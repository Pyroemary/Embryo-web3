// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {MockERC20} from "./MockERC20.sol";

/// @notice Minimal Aave V3 pool: aToken is 1:1 with underlying held by the aToken address.
///         Interest is simulated with `accrue` (mints aTokens and backing underlying).
contract MockAavePool {
    IERC20 public immutable underlying;
    MockERC20 public immutable aToken;

    constructor(IERC20 underlying_, MockERC20 aToken_) {
        underlying = underlying_;
        aToken = aToken_;
    }

    function supply(address, uint256 amount, address onBehalfOf, uint16) external {
        underlying.transferFrom(msg.sender, address(aToken), amount);
        aToken.mint(onBehalfOf, amount);
    }

    function withdraw(address, uint256 amount, address to) external returns (uint256) {
        aToken.burn(msg.sender, amount);
        // aToken (a MockERC20) can't transfer on our behalf, so the pool pulls via a helper.
        MockATokenVault(address(aToken)).release(to, amount);
        return amount;
    }
}

/// @notice aToken that holds the underlying and lets the pool release it.
contract MockATokenVault is MockERC20 {
    IERC20 public immutable underlying;
    address public pool;

    constructor(IERC20 underlying_) MockERC20("Aave USDC", "aUSDC", 6) {
        underlying = underlying_;
    }

    function setPool(address pool_) external {
        require(pool == address(0), "pool set");
        pool = pool_;
    }

    function release(address to, uint256 amount) external {
        require(msg.sender == pool, "only pool");
        underlying.transfer(to, amount);
    }
}
