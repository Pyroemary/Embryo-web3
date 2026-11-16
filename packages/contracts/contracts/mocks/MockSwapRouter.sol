// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {ISwapRouter02} from "../interfaces/ISwapRouter02.sol";
import {MockERC20} from "./MockERC20.sol";
import {MockAggregator} from "./MockAggregator.sol";

/// @notice Swaps riskToken <-> stable at the oracle price minus `impactBps`. Burns input, mints output.
contract MockSwapRouter is ISwapRouter02 {
    MockERC20 public immutable stable;
    MockERC20 public immutable risk;
    MockAggregator public immutable feed;
    uint256 public impactBps;

    constructor(MockERC20 stable_, MockERC20 risk_, MockAggregator feed_) {
        stable = stable_;
        risk = risk_;
        feed = feed_;
    }

    function setImpact(uint256 bps) external {
        impactBps = bps;
    }

    function exactInputSingle(ExactInputSingleParams calldata p) external payable returns (uint256 out) {
        uint256 px = uint256(feed.answer());
        uint256 scale = 10 ** (IERC20Metadata(address(risk)).decimals() + feed.decimals());
        uint256 sDec = 10 ** IERC20Metadata(address(stable)).decimals();
        if (p.tokenIn == address(stable)) {
            out = Math.mulDiv(p.amountIn, scale, px * sDec);
        } else {
            out = Math.mulDiv(p.amountIn, px * sDec, scale);
        }
        out = out * (10_000 - impactBps) / 10_000;
        require(out >= p.amountOutMinimum, "Too little received");
        MockERC20(p.tokenIn).burn(msg.sender, p.amountIn);
        MockERC20(p.tokenOut).mint(p.recipient, out);
    }
}
