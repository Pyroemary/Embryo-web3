// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC4626} from "@openzeppelin/contracts/interfaces/IERC4626.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IStrategy} from "../interfaces/IStrategy.sol";

/// @title BaseStrategy
/// @notice Shared plumbing for vault strategies: access control (vault-only), funds routing,
///         and the "send everything freed back to the vault" withdrawal semantics.
abstract contract BaseStrategy is IStrategy {
    using SafeERC20 for IERC20;

    IERC20 internal immutable _asset;
    address public immutable override vault;

    error OnlyVault();

    modifier onlyVault() {
        if (msg.sender != vault) revert OnlyVault();
        _;
    }

    constructor(address vault_) {
        vault = vault_;
        _asset = IERC20(IERC4626(vault_).asset());
    }

    function asset() external view override returns (address) {
        return address(_asset);
    }

    function totalAssets() public view override returns (uint256) {
        return _asset.balanceOf(address(this)) + _deployedAssets();
    }

    function availableLiquidity() public view override returns (uint256) {
        return _asset.balanceOf(address(this)) + _liquidDeployedAssets();
    }

    function deposit(uint256 assets) external override onlyVault {
        _asset.safeTransferFrom(vault, address(this), assets);
        _deploy(assets);
    }

    function withdraw(uint256 assets) external override onlyVault returns (uint256 withdrawn) {
        uint256 idle = _asset.balanceOf(address(this));
        if (idle < assets) _free(assets - idle);
        withdrawn = _asset.balanceOf(address(this));
        if (withdrawn > 0) _asset.safeTransfer(vault, withdrawn);
    }

    /// @dev Invest `assets` of underlying currently held by this contract.
    function _deploy(uint256 assets) internal virtual;

    /// @dev Free at least `assets` of underlying into this contract (bounded by liquidity).
    function _free(uint256 assets) internal virtual;

    /// @dev Value of deployed positions in underlying units.
    function _deployedAssets() internal view virtual returns (uint256);

    /// @dev Value of deployed positions that can be freed immediately.
    function _liquidDeployedAssets() internal view virtual returns (uint256);
}
