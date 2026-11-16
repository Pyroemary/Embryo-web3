// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

/// @notice Minimal subset of the Aave V3 Pool interface used by AaveV3Strategy.
interface IAaveV3Pool {
    function supply(address asset, uint256 amount, address onBehalfOf, uint16 referralCode) external;
    function withdraw(address asset, uint256 amount, address to) external returns (uint256);
}
