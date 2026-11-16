// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

/// @title IAccessGate
/// @notice Compliance perimeter: returns whether an account passed KYC / geo checks.
interface IAccessGate {
    function isAllowed(address account) external view returns (bool);
}
