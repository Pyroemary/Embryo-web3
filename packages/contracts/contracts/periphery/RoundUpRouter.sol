// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC4626} from "@openzeppelin/contracts/interfaces/IERC4626.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title RoundUpRouter
/// @notice Lets the Embryo keeper invest a user's accumulated round-ups from the user's own
///         (non-custodial) wallet into their chosen vault, within limits the user sets on-chain.
///
///         Flow: user approves USDC to this router and calls `optIn(vault, dailyCap)` once.
///         The backend aggregates card round-ups off-chain and periodically calls
///         `batchDeposit`. Shares are always minted directly to the user. The keeper can never
///         move more than `dailyCap` per user per UTC day, never to an unlisted vault, and the user
///         can `optOut()` (or revoke the approval) at any time.
contract RoundUpRouter is AccessControl, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    bytes32 public constant KEEPER_ROLE = keccak256("KEEPER_ROLE");
    bytes32 public constant GUARDIAN_ROLE = keccak256("GUARDIAN_ROLE");

    struct UserConfig {
        address vault;
        uint128 dailyCap;
        uint64 day;
        uint128 spentToday;
    }

    IERC20 public immutable usdc;
    mapping(address => bool) public isVault;
    mapping(address => UserConfig) public configs;

    event VaultListed(address indexed vault, bool listed);
    event OptedIn(address indexed user, address indexed vault, uint256 dailyCap);
    event OptedOut(address indexed user);
    event RoundUpInvested(address indexed user, address indexed vault, uint256 assets, uint256 shares);
    event RoundUpFailed(address indexed user, uint256 assets, bytes reason);

    error VaultNotListed();
    error NotOptedIn();
    error DailyCapExceeded(uint256 remaining);
    error LengthMismatch();
    error OnlySelf();
    error AssetMismatch();

    constructor(IERC20 usdc_, address admin) {
        usdc = usdc_;
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
    }

    // ------------------------------------------------------------------ admin

    function setVault(address vault, bool listed) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (listed && IERC4626(vault).asset() != address(usdc)) revert AssetMismatch();
        isVault[vault] = listed;
        emit VaultListed(vault, listed);
    }

    function pause() external onlyRole(GUARDIAN_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }

    // ------------------------------------------------------------------ user

    function optIn(address vault, uint128 dailyCap) external {
        if (!isVault[vault]) revert VaultNotListed();
        UserConfig storage cfg = configs[msg.sender];
        cfg.vault = vault;
        cfg.dailyCap = dailyCap;
        emit OptedIn(msg.sender, vault, dailyCap);
    }

    function optOut() external {
        delete configs[msg.sender];
        emit OptedOut(msg.sender);
    }

    /// @notice Remaining amount the keeper may invest for `user` today.
    function remainingToday(address user) public view returns (uint256) {
        UserConfig memory cfg = configs[user];
        if (cfg.vault == address(0)) return 0;
        uint64 today = uint64(block.timestamp / 1 days);
        uint256 spent = cfg.day == today ? cfg.spentToday : 0;
        return cfg.dailyCap > spent ? cfg.dailyCap - spent : 0;
    }

    // ------------------------------------------------------------------ keeper

    function depositFor(address user, uint256 assets)
        external
        onlyRole(KEEPER_ROLE)
        whenNotPaused
        nonReentrant
        returns (uint256 shares)
    {
        return _depositFor(user, assets);
    }

    /// @notice Invest round-ups for many users. Individual failures (revoked approval, empty
    ///         wallet, cap hit) are reported via `RoundUpFailed` and don't block the batch.
    function batchDeposit(address[] calldata users, uint256[] calldata amounts)
        external
        onlyRole(KEEPER_ROLE)
        whenNotPaused
        nonReentrant
        returns (uint256 succeeded)
    {
        if (users.length != amounts.length) revert LengthMismatch();
        for (uint256 i; i < users.length; ++i) {
            try this.depositForSelf(users[i], amounts[i]) {
                ++succeeded;
            } catch (bytes memory reason) {
                emit RoundUpFailed(users[i], amounts[i], reason);
            }
        }
    }

    /// @dev External only so `batchDeposit` can isolate failures with try/catch.
    function depositForSelf(address user, uint256 assets) external returns (uint256) {
        if (msg.sender != address(this)) revert OnlySelf();
        return _depositFor(user, assets);
    }

    function _depositFor(address user, uint256 assets) internal returns (uint256 shares) {
        UserConfig storage cfg = configs[user];
        address vault = cfg.vault;
        if (vault == address(0)) revert NotOptedIn();
        if (!isVault[vault]) revert VaultNotListed();

        uint64 today = uint64(block.timestamp / 1 days);
        if (cfg.day != today) {
            cfg.day = today;
            cfg.spentToday = 0;
        }
        uint256 remaining = cfg.dailyCap - cfg.spentToday;
        if (assets > remaining) revert DailyCapExceeded(remaining);
        cfg.spentToday += uint128(assets);

        usdc.safeTransferFrom(user, address(this), assets);
        usdc.forceApprove(vault, assets);
        shares = IERC4626(vault).deposit(assets, user);
        emit RoundUpInvested(user, vault, assets, shares);
    }
}
