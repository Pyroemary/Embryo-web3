import { parseAbi } from "viem";

export const roundUpRouterAbi = parseAbi([
  "function batchDeposit(address[] users, uint256[] amounts) returns (uint256 succeeded)",
  "function remainingToday(address user) view returns (uint256)",
  "function configs(address user) view returns (address vault, uint128 dailyCap, uint64 day, uint128 spentToday)",
  "event RoundUpInvested(address indexed user, address indexed vault, uint256 assets, uint256 shares)",
  "event RoundUpFailed(address indexed user, uint256 assets, bytes reason)",
]);

export const allowlistGateAbi = parseAbi([
  "function setAllowed(address[] accounts, bool allowed)",
  "function isAllowed(address account) view returns (bool)",
]);

export const vaultAbi = parseAbi([
  "function balanceOf(address) view returns (uint256)",
  "function convertToAssets(uint256 shares) view returns (uint256)",
  "function maxWithdraw(address owner) view returns (uint256)",
]);
