// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {BaseStrategy} from "./BaseStrategy.sol";
import {IChainlinkAggregator} from "../interfaces/IChainlinkAggregator.sol";
import {ISwapRouter02} from "../interfaces/ISwapRouter02.sol";

/// @title OracleSwapStrategy
/// @notice Holds a single blue-chip spot asset (cbBTC or WETH on Base) bought with USDC through
///         Uniswap V3. Valued with a Chainlink USD feed; every swap is bounded by an oracle-derived
///         minimum output, so a manipulated pool cannot drain the vault. Spot holding (no interest)
///         is permissible for the Sharia track.
/// @dev Assumes the underlying (USDC) is worth $1. Combine several instances for a basket.
contract OracleSwapStrategy is BaseStrategy {
    using SafeERC20 for IERC20;
    using Math for uint256;

    uint256 private constant BPS = 10_000;

    IERC20 public immutable riskToken;
    IChainlinkAggregator public immutable priceFeed;
    ISwapRouter02 public immutable router;
    uint24 public immutable poolFee;
    uint16 public immutable maxSlippageBps;
    uint32 public immutable maxPriceAge;

    uint8 private immutable _assetDecimals;
    uint8 private immutable _riskDecimals;
    uint8 private immutable _feedDecimals;

    error StalePrice();
    error InvalidPrice();
    error InvalidConfig();

    constructor(
        address vault_,
        IERC20 riskToken_,
        IChainlinkAggregator priceFeed_,
        ISwapRouter02 router_,
        uint24 poolFee_,
        uint16 maxSlippageBps_,
        uint32 maxPriceAge_
    ) BaseStrategy(vault_) {
        if (maxSlippageBps_ == 0 || maxSlippageBps_ > 500 || maxPriceAge_ == 0) revert InvalidConfig();
        riskToken = riskToken_;
        priceFeed = priceFeed_;
        router = router_;
        poolFee = poolFee_;
        maxSlippageBps = maxSlippageBps_;
        maxPriceAge = maxPriceAge_;
        _assetDecimals = IERC20Metadata(address(_asset)).decimals();
        _riskDecimals = IERC20Metadata(address(riskToken_)).decimals();
        _feedDecimals = priceFeed_.decimals();
    }

    /// @notice Oracle price of 1 riskToken in USD, scaled by feed decimals.
    function price() public view returns (uint256) {
        (, int256 answer,, uint256 updatedAt,) = priceFeed.latestRoundData();
        if (answer <= 0) revert InvalidPrice();
        if (block.timestamp - updatedAt > maxPriceAge) revert StalePrice();
        return uint256(answer);
    }

    /// @notice Value of `riskAmount` in underlying units.
    function valueOf(uint256 riskAmount) public view returns (uint256) {
        return riskAmount.mulDiv(price() * 10 ** _assetDecimals, 10 ** (_riskDecimals + _feedDecimals));
    }

    /// @notice Risk token amount worth `assets` underlying.
    function riskFor(uint256 assets) public view returns (uint256) {
        return assets.mulDiv(10 ** (_riskDecimals + _feedDecimals), price() * 10 ** _assetDecimals);
    }

    function _deploy(uint256 assets) internal override {
        uint256 minOut = riskFor(assets).mulDiv(BPS - maxSlippageBps, BPS);
        _swap(address(_asset), address(riskToken), assets, minOut);
    }

    function _free(uint256 assets) internal override {
        uint256 balance = riskToken.balanceOf(address(this));
        // Sell slightly more than needed so slippage doesn't leave the vault short.
        uint256 sell = Math.min(riskFor(assets).mulDiv(BPS + maxSlippageBps, BPS), balance);
        if (sell == 0) return;
        uint256 minOut = valueOf(sell).mulDiv(BPS - maxSlippageBps, BPS);
        _swap(address(riskToken), address(_asset), sell, minOut);
    }

    function _deployedAssets() internal view override returns (uint256) {
        uint256 balance = riskToken.balanceOf(address(this));
        return balance == 0 ? 0 : valueOf(balance);
    }

    /// @dev Haircut by max slippage: what we can be sure to realise when selling.
    function _liquidDeployedAssets() internal view override returns (uint256) {
        return _deployedAssets().mulDiv(BPS - maxSlippageBps, BPS);
    }

    function _swap(address tokenIn, address tokenOut, uint256 amountIn, uint256 minOut) internal {
        IERC20(tokenIn).forceApprove(address(router), amountIn);
        router.exactInputSingle(
            ISwapRouter02.ExactInputSingleParams({
                tokenIn: tokenIn,
                tokenOut: tokenOut,
                fee: poolFee,
                recipient: address(this),
                amountIn: amountIn,
                amountOutMinimum: minOut,
                sqrtPriceLimitX96: 0
            })
        );
    }
}
