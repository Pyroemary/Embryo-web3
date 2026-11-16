// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

// Re-export so Hardhat compiles the OpenZeppelin TimelockController used by the deploy script.
// Governance: Safe (3-of-5) -> TimelockController (48h) -> DEFAULT_ADMIN_ROLE on all contracts.
import {TimelockController} from "@openzeppelin/contracts/governance/TimelockController.sol";
