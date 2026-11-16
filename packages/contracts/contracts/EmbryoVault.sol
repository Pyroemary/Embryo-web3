// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

import {ERC4626} from "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

import {IStrategy} from "./interfaces/IStrategy.sol";
import {IAccessGate} from "./interfaces/IAccessGate.sol";

/// @title EmbryoVault
/// @notice ERC-4626 round-up investment vault. Users (or the RoundUpRouter on their behalf)
///         deposit USDC and receive shares; the vault allocates across whitelisted strategies.
///         One vault is deployed per (track x risk profile), e.g. "Sharia / Balanced".
/// @dev Roles:
///      - DEFAULT_ADMIN_ROLE: TimelockController (Safe 3-of-5 + 48h). Strategy whitelist,
///        caps, fees, treasury, gate, deposit cap, unpause.
///      - STRATEGIST_ROLE: target weights and manual allocation within admin caps.
///      - KEEPER_ROLE: automated rebalance / fee accrual.
///      - GUARDIAN_ROLE: instant pause and emergency de-allocation (funds only move to the vault).
///      Withdrawals are never paused: users can always exit to the limit of available liquidity.
contract EmbryoVault is ERC4626, AccessControl, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;
    using Math for uint256;

    // ------------------------------------------------------------------ constants

    bytes32 public constant STRATEGIST_ROLE = keccak256("STRATEGIST_ROLE");
    bytes32 public constant KEEPER_ROLE = keccak256("KEEPER_ROLE");
    bytes32 public constant GUARDIAN_ROLE = keccak256("GUARDIAN_ROLE");

    uint256 public constant BPS = 10_000;
    uint256 public constant MAX_MANAGEMENT_FEE_BPS = 200; // 2% / year
    uint256 public constant MAX_PERFORMANCE_FEE_BPS = 2_000; // 20% of gains
    uint256 public constant MAX_STRATEGIES = 10;
    uint256 private constant YEAR = 365 days;

    // ------------------------------------------------------------------ types

    enum Track {
        Conventional,
        Sharia
    }

    enum RiskProfile {
        Conservative,
        Balanced,
        Aggressive
    }

    struct StrategyConfig {
        IStrategy strategy;
        uint16 targetBps; // desired share of totalAssets
        uint16 maxBps; // hard cap enforced on every allocation
    }

    // ------------------------------------------------------------------ storage

    Track public immutable track;
    RiskProfile public immutable riskProfile;

    StrategyConfig[] private _strategies; // also the withdrawal queue (index order)
    mapping(address => bool) public isStrategy;

    IAccessGate public accessGate;
    address public treasury;
    uint16 public managementFeeBps;
    uint16 public performanceFeeBps;
    /// @notice Highest price-per-share (assets per 10**decimals() shares) on which a performance fee was charged.
    uint256 public highWaterMark;
    uint64 public lastFeeAccrual;
    uint256 public depositCap;

    // ------------------------------------------------------------------ events & errors

    event StrategyAdded(address indexed strategy, uint16 targetBps, uint16 maxBps);
    event StrategyRemoved(address indexed strategy);
    event StrategyTargetUpdated(address indexed strategy, uint16 targetBps);
    event StrategyMaxUpdated(address indexed strategy, uint16 maxBps);
    event Allocated(address indexed strategy, uint256 assets);
    event Deallocated(address indexed strategy, uint256 requested, uint256 received);
    event FeesAccrued(uint256 feeShares, uint256 totalAssets, uint256 highWaterMark);
    event FeesUpdated(uint16 managementFeeBps, uint16 performanceFeeBps);
    event TreasuryUpdated(address treasury);
    event AccessGateUpdated(address gate);
    event DepositCapUpdated(uint256 cap);

    error ZeroAddress();
    error FeeTooHigh();
    error InvalidBps();
    error TooManyStrategies();
    error StrategyExists();
    error StrategyMismatch();
    error StrategyNotEmpty();
    error BadIndex();
    error ExceedsStrategyCap();
    error InsufficientLiquidity(uint256 shortfall);
    error NotAllowed(address account);
    error Unauthorized();

    // ------------------------------------------------------------------ constructor

    constructor(
        IERC20Metadata asset_,
        string memory name_,
        string memory symbol_,
        Track track_,
        RiskProfile riskProfile_,
        address admin_,
        address treasury_,
        uint16 managementFeeBps_,
        uint16 performanceFeeBps_,
        uint256 depositCap_
    ) ERC20(name_, symbol_) ERC4626(asset_) {
        if (admin_ == address(0) || treasury_ == address(0)) revert ZeroAddress();
        if (managementFeeBps_ > MAX_MANAGEMENT_FEE_BPS || performanceFeeBps_ > MAX_PERFORMANCE_FEE_BPS) {
            revert FeeTooHigh();
        }
        track = track_;
        riskProfile = riskProfile_;
        treasury = treasury_;
        managementFeeBps = managementFeeBps_;
        performanceFeeBps = performanceFeeBps_;
        depositCap = depositCap_;
        highWaterMark = 10 ** asset_.decimals(); // initial price-per-share is exactly 1.0
        lastFeeAccrual = uint64(block.timestamp);
        _grantRole(DEFAULT_ADMIN_ROLE, admin_);
    }

    // ------------------------------------------------------------------ ERC-4626 accounting

    /// @dev 6 extra decimals of share precision mitigates the first-depositor inflation attack.
    function _decimalsOffset() internal pure override returns (uint8) {
        return 6;
    }

    /// @inheritdoc ERC4626
    function totalAssets() public view override returns (uint256 total) {
        total = IERC20(asset()).balanceOf(address(this));
        uint256 n = _strategies.length;
        for (uint256 i; i < n; ++i) {
            total += _strategies[i].strategy.totalAssets();
        }
    }

    /// @notice Assets withdrawable right now (idle + liquid strategy balances).
    function availableLiquidity() public view returns (uint256 liquid) {
        liquid = IERC20(asset()).balanceOf(address(this));
        uint256 n = _strategies.length;
        for (uint256 i; i < n; ++i) {
            liquid += _strategies[i].strategy.availableLiquidity();
        }
    }

    /// @dev Conversions include not-yet-minted fee shares so previews match execution exactly.
    function _convertToShares(uint256 assets, Math.Rounding rounding) internal view override returns (uint256) {
        (uint256 feeShares,) = _previewFees();
        return assets.mulDiv(totalSupply() + feeShares + 10 ** _decimalsOffset(), totalAssets() + 1, rounding);
    }

    function _convertToAssets(uint256 shares, Math.Rounding rounding) internal view override returns (uint256) {
        (uint256 feeShares,) = _previewFees();
        return shares.mulDiv(totalAssets() + 1, totalSupply() + feeShares + 10 ** _decimalsOffset(), rounding);
    }

    function maxDeposit(address receiver) public view override returns (uint256) {
        if (paused()) return 0;
        if (address(accessGate) != address(0) && !accessGate.isAllowed(receiver)) return 0;
        uint256 cap = depositCap;
        if (cap == type(uint256).max) return type(uint256).max;
        uint256 assets = totalAssets();
        return cap > assets ? cap - assets : 0;
    }

    function maxMint(address receiver) public view override returns (uint256) {
        uint256 assets = maxDeposit(receiver);
        if (assets == type(uint256).max) return type(uint256).max;
        return _convertToShares(assets, Math.Rounding.Floor);
    }

    function maxWithdraw(address owner) public view override returns (uint256) {
        return Math.min(super.maxWithdraw(owner), availableLiquidity());
    }

    function maxRedeem(address owner) public view override returns (uint256) {
        return Math.min(super.maxRedeem(owner), _convertToShares(availableLiquidity(), Math.Rounding.Floor));
    }

    function deposit(uint256 assets, address receiver) public override nonReentrant returns (uint256) {
        _accrueFees();
        return super.deposit(assets, receiver);
    }

    function mint(uint256 shares, address receiver) public override nonReentrant returns (uint256) {
        _accrueFees();
        return super.mint(shares, receiver);
    }

    function withdraw(uint256 assets, address receiver, address owner) public override nonReentrant returns (uint256) {
        _accrueFees();
        return super.withdraw(assets, receiver, owner);
    }

    function redeem(uint256 shares, address receiver, address owner) public override nonReentrant returns (uint256) {
        _accrueFees();
        return super.redeem(shares, receiver, owner);
    }

    /// @dev Pull liquidity from strategies (in queue order) when idle funds are insufficient.
    function _withdraw(address caller, address receiver, address owner, uint256 assets, uint256 shares)
        internal
        override
    {
        uint256 idle = IERC20(asset()).balanceOf(address(this));
        if (idle < assets) {
            _pullFromStrategies(assets - idle);
        }
        super._withdraw(caller, receiver, owner, assets, shares);
    }

    /// @dev Shares may only be transferred to accounts inside the compliance perimeter.
    function _update(address from, address to, uint256 value) internal override {
        if (from != address(0) && to != address(0) && address(accessGate) != address(0)) {
            if (!accessGate.isAllowed(to)) revert NotAllowed(to);
        }
        super._update(from, to, value);
    }

    // ------------------------------------------------------------------ fees

    /// @notice Mint any accrued management and performance fees to the treasury.
    function accrueFees() external nonReentrant {
        _accrueFees();
    }

    /// @notice Fee shares that would be minted if fees were accrued now.
    function pendingFeeShares() external view returns (uint256 feeShares) {
        (feeShares,) = _previewFees();
    }

    function _accrueFees() internal {
        (uint256 feeShares, uint256 newHwm) = _previewFees();
        lastFeeAccrual = uint64(block.timestamp);
        highWaterMark = newHwm;
        if (feeShares > 0) {
            _mint(treasury, feeShares);
            emit FeesAccrued(feeShares, totalAssets(), newHwm);
        }
    }

    /// @dev Management fee: pro-rata AUM fee since last accrual.
    ///      Performance fee: share of per-share gains above the high-water mark.
    ///      Both are paid by minting shares (dilution), so no assets leave the strategies.
    function _previewFees() internal view returns (uint256 feeShares, uint256 newHwm) {
        newHwm = highWaterMark;
        uint256 supply = totalSupply();
        uint256 assets = totalAssets();
        if (supply == 0 || assets == 0) return (0, newHwm);

        uint256 unit = 10 ** decimals();
        uint256 elapsed = block.timestamp - lastFeeAccrual;
        uint256 feeAssets = assets.mulDiv(uint256(managementFeeBps) * elapsed, BPS * YEAR);

        uint256 pps = assets.mulDiv(unit, supply);
        if (pps > newHwm && performanceFeeBps > 0) {
            uint256 gain = (pps - newHwm).mulDiv(supply, unit);
            feeAssets += gain.mulDiv(performanceFeeBps, BPS);
        }

        // Safety bound: fees can never take more than half the vault in one accrual.
        if (feeAssets > assets / 2) feeAssets = assets / 2;
        if (feeAssets > 0) {
            feeShares = feeAssets.mulDiv(supply, assets - feeAssets);
        }

        uint256 ppsAfter = assets.mulDiv(unit, supply + feeShares);
        if (ppsAfter > newHwm) newHwm = ppsAfter;
    }

    // ------------------------------------------------------------------ strategy admin

    function strategiesLength() external view returns (uint256) {
        return _strategies.length;
    }

    function strategyAt(uint256 index) external view returns (StrategyConfig memory) {
        if (index >= _strategies.length) revert BadIndex();
        return _strategies[index];
    }

    function addStrategy(IStrategy strategy, uint16 targetBps, uint16 maxBps) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (_strategies.length >= MAX_STRATEGIES) revert TooManyStrategies();
        if (isStrategy[address(strategy)]) revert StrategyExists();
        if (strategy.asset() != asset() || strategy.vault() != address(this)) revert StrategyMismatch();
        if (targetBps > maxBps || maxBps > BPS) revert InvalidBps();
        _strategies.push(StrategyConfig(strategy, targetBps, maxBps));
        isStrategy[address(strategy)] = true;
        _checkTargetSum();
        emit StrategyAdded(address(strategy), targetBps, maxBps);
    }

    /// @notice Remove a strategy. It must be fully exited first (all funds back in the vault).
    function removeStrategy(uint256 index) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (index >= _strategies.length) revert BadIndex();
        IStrategy strategy = _strategies[index].strategy;
        if (strategy.totalAssets() != 0) revert StrategyNotEmpty();
        // Preserve queue order.
        for (uint256 i = index; i + 1 < _strategies.length; ++i) {
            _strategies[i] = _strategies[i + 1];
        }
        _strategies.pop();
        isStrategy[address(strategy)] = false;
        emit StrategyRemoved(address(strategy));
    }

    function setStrategyMax(uint256 index, uint16 maxBps) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (index >= _strategies.length) revert BadIndex();
        StrategyConfig storage cfg = _strategies[index];
        if (maxBps > BPS) revert InvalidBps();
        cfg.maxBps = maxBps;
        if (cfg.targetBps > maxBps) {
            cfg.targetBps = maxBps;
            emit StrategyTargetUpdated(address(cfg.strategy), maxBps);
        }
        emit StrategyMaxUpdated(address(cfg.strategy), maxBps);
    }

    function setStrategyTarget(uint256 index, uint16 targetBps) external onlyRole(STRATEGIST_ROLE) {
        if (index >= _strategies.length) revert BadIndex();
        StrategyConfig storage cfg = _strategies[index];
        if (targetBps > cfg.maxBps) revert InvalidBps();
        cfg.targetBps = targetBps;
        _checkTargetSum();
        emit StrategyTargetUpdated(address(cfg.strategy), targetBps);
    }

    function _checkTargetSum() internal view {
        uint256 sum;
        uint256 n = _strategies.length;
        for (uint256 i; i < n; ++i) {
            sum += _strategies[i].targetBps;
        }
        if (sum > BPS) revert InvalidBps();
    }

    // ------------------------------------------------------------------ allocation

    function allocate(uint256 index, uint256 assets) external nonReentrant whenNotPaused {
        _onlyRoles(STRATEGIST_ROLE, KEEPER_ROLE);
        _allocate(index, assets);
    }

    function deallocate(uint256 index, uint256 assets) external nonReentrant returns (uint256) {
        if (!hasRole(STRATEGIST_ROLE, msg.sender) && !hasRole(KEEPER_ROLE, msg.sender)) {
            _onlyRoles(GUARDIAN_ROLE, DEFAULT_ADMIN_ROLE);
        }
        return _deallocate(index, assets);
    }

    /// @notice Move every strategy toward its target weight: de-allocate excess first, then
    ///         allocate idle funds to under-weight strategies.
    function rebalance() external nonReentrant whenNotPaused {
        _onlyRoles(STRATEGIST_ROLE, KEEPER_ROLE);
        uint256 total = totalAssets();
        uint256 n = _strategies.length;
        for (uint256 i; i < n; ++i) {
            uint256 target = total.mulDiv(_strategies[i].targetBps, BPS);
            uint256 current = _strategies[i].strategy.totalAssets();
            if (current > target) {
                uint256 excess = Math.min(current - target, _strategies[i].strategy.availableLiquidity());
                if (excess > 0) _deallocate(i, excess);
            }
        }
        total = totalAssets();
        for (uint256 i; i < n; ++i) {
            uint256 target = total.mulDiv(_strategies[i].targetBps, BPS);
            uint256 current = _strategies[i].strategy.totalAssets();
            if (target > current) {
                uint256 idle = IERC20(asset()).balanceOf(address(this));
                uint256 amount = Math.min(target - current, idle);
                if (amount > 0) _allocate(i, amount);
            }
        }
    }

    function _allocate(uint256 index, uint256 assets) internal {
        if (index >= _strategies.length) revert BadIndex();
        StrategyConfig memory cfg = _strategies[index];
        IERC20(asset()).forceApprove(address(cfg.strategy), assets);
        cfg.strategy.deposit(assets);
        if (cfg.strategy.totalAssets() > totalAssets().mulDiv(cfg.maxBps, BPS)) revert ExceedsStrategyCap();
        emit Allocated(address(cfg.strategy), assets);
    }

    function _deallocate(uint256 index, uint256 assets) internal returns (uint256 received) {
        if (index >= _strategies.length) revert BadIndex();
        IStrategy strategy = _strategies[index].strategy;
        received = strategy.withdraw(assets);
        emit Deallocated(address(strategy), assets, received);
    }

    function _pullFromStrategies(uint256 needed) internal {
        uint256 n = _strategies.length;
        for (uint256 i; i < n && needed > 0; ++i) {
            IStrategy strategy = _strategies[i].strategy;
            uint256 amount = Math.min(needed, strategy.availableLiquidity());
            if (amount == 0) continue;
            uint256 received = strategy.withdraw(amount);
            needed = received >= needed ? 0 : needed - received;
        }
        if (needed > 0) revert InsufficientLiquidity(needed);
    }

    function _onlyRoles(bytes32 a, bytes32 b) internal view {
        if (!hasRole(a, msg.sender) && !hasRole(b, msg.sender)) revert Unauthorized();
    }

    // ------------------------------------------------------------------ admin

    function setFees(uint16 managementFeeBps_, uint16 performanceFeeBps_) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (managementFeeBps_ > MAX_MANAGEMENT_FEE_BPS || performanceFeeBps_ > MAX_PERFORMANCE_FEE_BPS) {
            revert FeeTooHigh();
        }
        _accrueFees(); // settle at the old rates first
        managementFeeBps = managementFeeBps_;
        performanceFeeBps = performanceFeeBps_;
        emit FeesUpdated(managementFeeBps_, performanceFeeBps_);
    }

    function setTreasury(address treasury_) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (treasury_ == address(0)) revert ZeroAddress();
        _accrueFees();
        treasury = treasury_;
        emit TreasuryUpdated(treasury_);
    }

    function setAccessGate(IAccessGate gate) external onlyRole(DEFAULT_ADMIN_ROLE) {
        accessGate = gate;
        emit AccessGateUpdated(address(gate));
    }

    function setDepositCap(uint256 cap) external onlyRole(DEFAULT_ADMIN_ROLE) {
        depositCap = cap;
        emit DepositCapUpdated(cap);
    }

    function pause() external onlyRole(GUARDIAN_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }

    /// @notice Recover tokens accidentally sent to the vault (never the underlying asset).
    function sweep(IERC20 token, address to) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (address(token) == asset()) revert Unauthorized();
        token.safeTransfer(to, token.balanceOf(address(this)));
    }
}
