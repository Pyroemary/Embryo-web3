// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

/// @title IStrategy
/// @notice A yield source that an EmbryoVault allocates its underlying asset (USDC) into.
/// @dev Strategies are owned by exactly one vault. Only that vault may move funds.
interface IStrategy {
    /// @return The underlying asset (must equal the vault's asset).
    function asset() external view returns (address);

    /// @return The single vault allowed to call deposit/withdraw.
    function vault() external view returns (address);

    /// @return Total value held by the strategy, denominated in `asset`.
    function totalAssets() external view returns (uint256);

    /// @return Value (in `asset`) that can be withdrawn right now.
    function availableLiquidity() external view returns (uint256);

    /// @notice Pulls `assets` from the vault (vault must have approved) and deploys them.
    function deposit(uint256 assets) external;

    /// @notice Frees at least `assets` (best effort, bounded by liquidity) and sends all
    ///         freed underlying to the vault.
    /// @return withdrawn The amount of underlying actually transferred to the vault.
    function withdraw(uint256 assets) external returns (uint256 withdrawn);
}
