import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";
import { deployVaultFixture, deployWithStrategiesFixture, USDC } from "./fixtures";

const BTC = (n: number | string) => ethers.parseUnits(String(n), 8);
const PRICE_100K = 100_000n * 10n ** 8n; // Chainlink 8 decimals

async function swapStrategyFixture() {
  const base = await deployVaultFixture();
  const { usdc, vault } = base;
  const cbBTC = await ethers.deployContract("MockERC20", ["Coinbase Wrapped BTC", "cbBTC", 8]);
  const feed = await ethers.deployContract("MockAggregator", [8, PRICE_100K]);
  const router = await ethers.deployContract("MockSwapRouter", [
    await usdc.getAddress(),
    await cbBTC.getAddress(),
    await feed.getAddress(),
  ]);
  const strategy = await ethers.deployContract("OracleSwapStrategy", [
    await vault.getAddress(),
    await cbBTC.getAddress(),
    await feed.getAddress(),
    await router.getAddress(),
    500, // 0.05% pool
    100, // 1% max slippage
    3600, // 1h max price age
  ]);
  await vault.addStrategy(await strategy.getAddress(), 5000, 10000);
  await vault.setFees(0, 0);
  return { ...base, cbBTC, feed, router, strategy };
}

describe("Strategies", () => {
  describe("AaveV3Strategy", () => {
    it("supplies, accrues interest and withdraws", async () => {
      const { vault, usdc, alice, strategist, sAave, aToken } = await loadFixture(deployWithStrategiesFixture);
      await vault.setFees(0, 0);
      await vault.connect(alice).deposit(USDC(1_000), alice.address);
      await vault.connect(strategist).allocate(1, USDC(500));
      expect(await sAave.totalAssets()).to.equal(USDC(500));

      // simulate interest: mint aTokens to the strategy and backing USDC to the aToken
      await aToken.mint(await sAave.getAddress(), USDC(25));
      await usdc.mint(await aToken.getAddress(), USDC(25));
      expect(await vault.totalAssets()).to.equal(USDC(1_025));

      await vault.connect(strategist).deallocate(1, USDC(525));
      expect(await sAave.totalAssets()).to.equal(0);
      expect(await usdc.balanceOf(await vault.getAddress())).to.equal(USDC(1_025));
    });
  });

  describe("OracleSwapStrategy (blue-chip basket leg)", () => {
    it("buys at oracle price and values position via Chainlink", async () => {
      const { vault, alice, strategist, strategy, cbBTC } = await loadFixture(swapStrategyFixture);
      await vault.connect(alice).deposit(USDC(10_000), alice.address);
      await vault.connect(strategist).allocate(0, USDC(5_000));
      expect(await cbBTC.balanceOf(await strategy.getAddress())).to.equal(BTC("0.05"));
      expect(await strategy.totalAssets()).to.equal(USDC(5_000));
      expect(await vault.totalAssets()).to.equal(USDC(10_000));
    });

    it("price moves flow through to share price", async () => {
      const { vault, alice, strategist, feed } = await loadFixture(swapStrategyFixture);
      await vault.connect(alice).deposit(USDC(10_000), alice.address);
      await vault.connect(strategist).allocate(0, USDC(5_000));
      await feed.set(PRICE_100K * 2n, await time.latest());
      expect(await vault.totalAssets()).to.equal(USDC(15_000));
    });

    it("reverts on swaps worse than max slippage (sandwich protection)", async () => {
      const { vault, alice, strategist, router } = await loadFixture(swapStrategyFixture);
      await vault.connect(alice).deposit(USDC(10_000), alice.address);
      await router.setImpact(150); // 1.5% > 1% max
      await expect(vault.connect(strategist).allocate(0, USDC(5_000))).to.be.revertedWith("Too little received");
    });

    it("rejects stale or invalid prices", async () => {
      const { vault, alice, strategist, strategy, feed } = await loadFixture(swapStrategyFixture);
      await vault.connect(alice).deposit(USDC(10_000), alice.address);
      await time.increase(7200);
      await expect(vault.connect(strategist).allocate(0, USDC(100))).to.be.revertedWithCustomError(
        strategy,
        "StalePrice",
      );
      await feed.set(0, await time.latest());
      await expect(strategy.price()).to.be.revertedWithCustomError(strategy, "InvalidPrice");
    });

    it("user withdrawals sell enough risk asset despite slippage", async () => {
      const { vault, usdc, alice, strategist, router } = await loadFixture(swapStrategyFixture);
      await vault.connect(alice).deposit(USDC(10_000), alice.address);
      await vault.connect(strategist).allocate(0, USDC(10_000));
      await router.setImpact(50); // 0.5% impact on the way out
      const max = await vault.maxWithdraw(alice.address);
      expect(max).to.equal(USDC(9_900)); // 1% liquidity haircut
      const before = await usdc.balanceOf(alice.address);
      await vault.connect(alice).withdraw(USDC(5_000), alice.address, alice.address);
      expect((await usdc.balanceOf(alice.address)) - before).to.equal(USDC(5_000));
    });

    it("rejects unsafe config", async () => {
      const { vault, cbBTC, feed, router } = await loadFixture(swapStrategyFixture);
      await expect(
        ethers.deployContract("OracleSwapStrategy", [
          await vault.getAddress(), await cbBTC.getAddress(), await feed.getAddress(), await router.getAddress(), 500, 501, 3600,
        ]),
      ).to.be.reverted;
    });
  });
});
