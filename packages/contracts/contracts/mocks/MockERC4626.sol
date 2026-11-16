// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

import {ERC4626} from "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

/// @notice Stand-in for a Morpho / tokenized-fund vault. Yield is simulated by minting
///         underlying to this contract; `liquidityLimit` simulates redemption gates.
contract MockERC4626 is ERC4626 {
    uint256 public liquidityLimit = type(uint256).max;

    constructor(IERC20 asset_) ERC20("Mock Yield Vault", "mYV") ERC4626(asset_) {}

    function setLiquidityLimit(uint256 limit) external {
        liquidityLimit = limit;
    }

    function maxWithdraw(address owner) public view override returns (uint256) {
        return Math.min(super.maxWithdraw(owner), liquidityLimit);
    }
}
