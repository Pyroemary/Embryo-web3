// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {BaseStrategy} from "./BaseStrategy.sol";
import {IAaveV3Pool} from "../interfaces/IAaveV3Pool.sol";

/// @title AaveV3Strategy
/// @notice Supplies USDC to Aave V3 on Base. Conventional track only (interest-bearing).
contract AaveV3Strategy is BaseStrategy {
    using SafeERC20 for IERC20;

    IAaveV3Pool public immutable pool;
    IERC20 public immutable aToken;

    constructor(address vault_, IAaveV3Pool pool_, IERC20 aToken_) BaseStrategy(vault_) {
        pool = pool_;
        aToken = aToken_;
    }

    function _deploy(uint256 assets) internal override {
        _asset.forceApprove(address(pool), assets);
        pool.supply(address(_asset), assets, address(this), 0);
    }

    function _free(uint256 assets) internal override {
        uint256 amount = Math.min(assets, _liquidDeployedAssets());
        if (amount > 0) pool.withdraw(address(_asset), amount, address(this));
    }

    function _deployedAssets() internal view override returns (uint256) {
        return aToken.balanceOf(address(this));
    }

    /// @dev Bounded by the reserve's idle cash (high utilisation can block withdrawals).
    function _liquidDeployedAssets() internal view override returns (uint256) {
        return Math.min(aToken.balanceOf(address(this)), _asset.balanceOf(address(aToken)));
    }
}
