// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC4626} from "@openzeppelin/contracts/interfaces/IERC4626.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {BaseStrategy} from "./BaseStrategy.sol";

/// @title ERC4626Strategy
/// @notice Allocates into any ERC-4626 vault that shares our underlying: Morpho (MetaMorpho)
///         USDC vaults, tokenized T-bill / money-market wrappers, or Sharia-screened sukuk
///         fund wrappers. One adapter, many yield sources.
contract ERC4626Strategy is BaseStrategy {
    using SafeERC20 for IERC20;

    IERC4626 public immutable target;

    error AssetMismatch();

    constructor(address vault_, IERC4626 target_) BaseStrategy(vault_) {
        if (target_.asset() != address(_asset)) revert AssetMismatch();
        target = target_;
    }

    function _deploy(uint256 assets) internal override {
        _asset.forceApprove(address(target), assets);
        target.deposit(assets, address(this));
    }

    function _free(uint256 assets) internal override {
        uint256 amount = Math.min(assets, target.maxWithdraw(address(this)));
        if (amount > 0) target.withdraw(amount, address(this), address(this));
    }

    function _deployedAssets() internal view override returns (uint256) {
        return target.previewRedeem(target.balanceOf(address(this)));
    }

    function _liquidDeployedAssets() internal view override returns (uint256) {
        return target.maxWithdraw(address(this));
    }
}
