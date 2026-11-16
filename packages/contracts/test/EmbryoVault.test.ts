import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";
import { deployVaultFixture, deployWithStrategiesFixture, USDC, YEAR, Track, Risk } from "./fixtures";

describe("EmbryoVault", () => {
  describe("metadata & roles", () => {
    it("exposes track, profile, decimals offset and fee config", async () => {
      const { vault, admin, treasury } = await loadFixture(deployVaultFixture);
      expect(await vault.track()).to.equal(Track.Conventional);
      expect(await vault.riskProfile()).to.equal(Risk.Balanced);
      expect(await vault.decimals()).to.equal(12); // 6 (USDC) + 6 offset
      expect(await vault.managementFeeBps()).to.equal(100);
      expect(await vault.performanceFeeBps()).to.equal(1000);
      expect(await vault.treasury()).to.equal(treasury.address);
      expect(await vault.hasRole(await vault.DEFAULT_ADMIN_ROLE(), admin.address)).to.equal(true);
    });

    it("rejects fees above hard caps", async () => {
      const { vault } = await loadFixture(deployVaultFixture);
      await expect(vault.setFees(201, 0)).to.be.revertedWithCustomError(vault, "FeeTooHigh");
      await expect(vault.setFees(0, 2001)).to.be.revertedWithCustomError(vault, "FeeTooHigh");
    });

    it("restricts admin functions", async () => {
      const { vault, alice } = await loadFixture(deployVaultFixture);
      await expect(vault.connect(alice).setFees(0, 0)).to.be.revertedWithCustomError(
        vault,
        "AccessControlUnauthorizedAccount",
      );
      await expect(vault.connect(alice).pause()).to.be.revertedWithCustomError(
        vault,
        "AccessControlUnauthorizedAccount",
      );
    });
  });

  describe("deposits & withdrawals", () => {
    it("mints shares 1:1e6 and redeems back exactly", async () => {
      const { vault, usdc, alice } = await loadFixture(deployVaultFixture);
      await vault.connect(alice).deposit(USDC(100), alice.address);
      expect(await vault.balanceOf(alice.address)).to.equal(USDC(100) * 10n ** 6n);
      expect(await vault.totalAssets()).to.equal(USDC(100));

      const before = await usdc.balanceOf(alice.address);
      await vault.connect(alice).redeem(await vault.balanceOf(alice.address), alice.address, alice.address);
      expect((await usdc.balanceOf(alice.address)) - before).to.equal(USDC(100));
    });

    it("resists the first-depositor inflation attack", async () => {
      const { vault, usdc, alice, bob } = await loadFixture(deployVaultFixture);
      // attacker: deposit 1 wei then donate 10k USDC directly
      await vault.connect(bob).deposit(1n, bob.address);
      await usdc.connect(bob).transfer(await vault.getAddress(), USDC(10_000));
      // victim deposits 10k
      await vault.connect(alice).deposit(USDC(10_000), alice.address);
      const aliceValue = await vault.convertToAssets(await vault.balanceOf(alice.address));
      // victim keeps > 99.99% of deposit
      expect(aliceValue).to.be.gte((USDC(10_000) * 9999n) / 10000n);
    });

    it("enforces deposit cap", async () => {
      const { vault, alice } = await loadFixture(deployVaultFixture);
      await vault.setDepositCap(USDC(500));
      await vault.connect(alice).deposit(USDC(400), alice.address);
      expect(await vault.maxDeposit(alice.address)).to.equal(USDC(100));
      await expect(vault.connect(alice).deposit(USDC(101), alice.address)).to.be.revertedWithCustomError(
        vault,
        "ERC4626ExceededMaxDeposit",
      );
    });

    it("pause blocks deposits but never withdrawals", async () => {
      const { vault, alice, guardian, admin } = await loadFixture(deployVaultFixture);
      await vault.connect(alice).deposit(USDC(100), alice.address);
      await vault.connect(guardian).pause();
      await expect(vault.connect(alice).deposit(USDC(1), alice.address)).to.be.revertedWithCustomError(
        vault,
        "ERC4626ExceededMaxDeposit",
      );
      await vault.connect(alice).withdraw(USDC(50), alice.address, alice.address);
      await expect(vault.connect(guardian).unpause()).to.be.revertedWithCustomError(
        vault,
        "AccessControlUnauthorizedAccount",
      );
      await vault.connect(admin).unpause();
      await vault.connect(alice).deposit(USDC(1), alice.address);
    });
  });

  describe("compliance gate", () => {
    it("blocks deposits and share transfers to non-KYC'd accounts, but lets anyone exit", async () => {
      const { vault, admin, alice, bob } = await loadFixture(deployVaultFixture);
      const gate = await ethers.deployContract("AllowlistGate", [admin.address]);
      await gate.grantRole(await gate.COMPLIANCE_ROLE(), admin.address);
      await gate.setAllowed([alice.address], true);
      await vault.setAccessGate(await gate.getAddress());

      await vault.connect(alice).deposit(USDC(100), alice.address);
      expect(await vault.maxDeposit(bob.address)).to.equal(0);
      await expect(vault.connect(bob).deposit(USDC(1), bob.address)).to.be.revertedWithCustomError(
        vault,
        "ERC4626ExceededMaxDeposit",
      );
      await expect(vault.connect(alice).transfer(bob.address, 1n))
        .to.be.revertedWithCustomError(vault, "NotAllowed")
        .withArgs(bob.address);

      // revoke alice (e.g. sanctions hit) — she can still withdraw
      await gate.setAllowed([alice.address], false);
      await vault.connect(alice).withdraw(USDC(100), alice.address, alice.address);
    });

    it("only compliance role can set allowlist", async () => {
      const { admin, alice } = await loadFixture(deployVaultFixture);
      const gate = await ethers.deployContract("AllowlistGate", [admin.address]);
      await expect(gate.connect(alice).setAllowed([alice.address], true)).to.be.revertedWithCustomError(
        gate,
        "AccessControlUnauthorizedAccount",
      );
    });
  });

  describe("fees", () => {
    it("accrues ~1% management fee over a year to the treasury", async () => {
      const { vault, alice, treasury } = await loadFixture(deployVaultFixture);
      await vault.setFees(100, 0);
      await vault.connect(alice).deposit(USDC(10_000), alice.address);
      await time.increase(YEAR);
      await vault.accrueFees();
      const feeValue = await vault.convertToAssets(await vault.balanceOf(treasury.address));
      expect(feeValue).to.be.closeTo(USDC(100), USDC(0.1));
    });

    it("charges performance fee only above the high-water mark", async () => {
      const { vault, usdc, alice, treasury } = await loadFixture(deployVaultFixture);
      await vault.setFees(0, 1000); // 10% perf only
      await vault.connect(alice).deposit(USDC(10_000), alice.address);

      // +1,000 USDC yield
      await usdc.mint(await vault.getAddress(), USDC(1_000));
      await vault.accrueFees();
      const fee1 = await vault.convertToAssets(await vault.balanceOf(treasury.address));
      expect(fee1).to.be.closeTo(USDC(100), USDC(0.01));

      // no new gains => no new fee
      const sharesBefore = await vault.balanceOf(treasury.address);
      await vault.accrueFees();
      expect(await vault.balanceOf(treasury.address)).to.equal(sharesBefore);

      // loss of 500 then recovery of 500 => back to HWM, still no fee
      await usdc.burn(await vault.getAddress(), USDC(500));
      await vault.accrueFees();
      await usdc.mint(await vault.getAddress(), USDC(500));
      await vault.accrueFees();
      expect(await vault.balanceOf(treasury.address)).to.be.closeTo(sharesBefore, 10n ** 6n);
    });

    it("previews include pending fees so previews equal execution", async () => {
      const { vault, usdc, alice, bob } = await loadFixture(deployVaultFixture);
      await vault.connect(alice).deposit(USDC(10_000), alice.address);
      await usdc.mint(await vault.getAddress(), USDC(500));
      await time.increase(YEAR / 2);

      const shares = await vault.balanceOf(alice.address);
      // The view runs at the current block; the tx lands 1s later, so allow ~1s of mgmt fee drift.
      const preview = await vault.previewRedeem(shares);
      const before = await usdc.balanceOf(alice.address);
      await vault.connect(alice).redeem(shares, alice.address, alice.address);
      const got = (await usdc.balanceOf(alice.address)) - before;
      expect(got).to.be.closeTo(preview, USDC(0.01));
      expect(got).to.be.lt(USDC(10_500)); // fees were taken
      // bob's later deposit is priced fairly
      await vault.connect(bob).deposit(USDC(100), bob.address);
      expect(await vault.convertToAssets(await vault.balanceOf(bob.address))).to.be.closeTo(USDC(100), 2n);
    });

    it("settles fees at old rate before a fee change", async () => {
      const { vault, alice, treasury } = await loadFixture(deployVaultFixture);
      await vault.setFees(200, 0);
      await vault.connect(alice).deposit(USDC(10_000), alice.address);
      await time.increase(YEAR);
      await vault.setFees(0, 0);
      const fee = await vault.convertToAssets(await vault.balanceOf(treasury.address));
      expect(fee).to.be.closeTo(USDC(200), USDC(0.1));
    });
  });

  describe("strategies", () => {
    it("rejects strategies for other vaults/assets and invalid bps", async () => {
      const { vault, usdc, admin } = await loadFixture(deployWithStrategiesFixture);
      const other = await ethers.deployContract("EmbryoVault", [
        await usdc.getAddress(), "x", "x", 0, 0, admin.address, admin.address, 0, 0, ethers.MaxUint256,
      ]);
      const target = await ethers.deployContract("MockERC4626", [await usdc.getAddress()]);
      const foreign = await ethers.deployContract("ERC4626Strategy", [await other.getAddress(), await target.getAddress()]);
      await expect(vault.addStrategy(await foreign.getAddress(), 0, 0)).to.be.revertedWithCustomError(
        vault,
        "StrategyMismatch",
      );
      const mine = await ethers.deployContract("ERC4626Strategy", [await vault.getAddress(), await target.getAddress()]);
      await expect(vault.addStrategy(await mine.getAddress(), 3000, 3000)).to.be.revertedWithCustomError(
        vault,
        "InvalidBps",
      ); // targets would sum to 110%
      await expect(vault.addStrategy(await mine.getAddress(), 2000, 1000)).to.be.revertedWithCustomError(
        vault,
        "InvalidBps",
      );
    });

    it("rebalances to target weights and keeps the remainder idle", async () => {
      const { vault, alice, keeper, s4626, sAave } = await loadFixture(deployWithStrategiesFixture);
      await vault.connect(alice).deposit(USDC(10_000), alice.address);
      await vault.connect(keeper).rebalance();
      expect(await s4626.totalAssets()).to.equal(USDC(4_000));
      expect(await sAave.totalAssets()).to.equal(USDC(4_000));
      expect(await vault.totalAssets()).to.equal(USDC(10_000));
    });

    it("enforces per-strategy max cap on allocation", async () => {
      const { vault, alice, strategist } = await loadFixture(deployWithStrategiesFixture);
      await vault.connect(alice).deposit(USDC(10_000), alice.address);
      await vault.connect(strategist).allocate(0, USDC(6_000));
      await expect(vault.connect(strategist).allocate(0, USDC(1))).to.be.revertedWithCustomError(
        vault,
        "ExceedsStrategyCap",
      );
    });

    it("only strategist/keeper can allocate; allocation is paused with the vault", async () => {
      const { vault, alice, guardian, keeper } = await loadFixture(deployWithStrategiesFixture);
      await vault.connect(alice).deposit(USDC(1_000), alice.address);
      await expect(vault.connect(alice).allocate(0, 1n)).to.be.revertedWithCustomError(vault, "Unauthorized");
      await vault.connect(guardian).pause();
      await expect(vault.connect(keeper).rebalance()).to.be.revertedWithCustomError(vault, "EnforcedPause");
    });

    it("strategy yield flows into share price", async () => {
      const { vault, usdc, alice, keeper, target } = await loadFixture(deployWithStrategiesFixture);
      await vault.setFees(0, 0);
      await vault.connect(alice).deposit(USDC(10_000), alice.address);
      await vault.connect(keeper).rebalance();
      await usdc.mint(await target.getAddress(), USDC(400)); // +10% on the 4k in the 4626 strategy
      expect(await vault.totalAssets()).to.be.closeTo(USDC(10_400), 2n);
      expect(await vault.maxWithdraw(alice.address)).to.be.closeTo(USDC(10_400), 2n);
    });

    it("withdrawals pull from strategies in queue order", async () => {
      const { vault, usdc, alice, keeper, s4626, sAave } = await loadFixture(deployWithStrategiesFixture);
      await vault.setFees(0, 0);
      await vault.connect(alice).deposit(USDC(10_000), alice.address);
      await vault.connect(keeper).rebalance();
      const before = await usdc.balanceOf(alice.address);
      await vault.connect(alice).withdraw(USDC(5_000), alice.address, alice.address);
      expect((await usdc.balanceOf(alice.address)) - before).to.equal(USDC(5_000));
      // 2k idle used first, then 3k from strategy 0
      expect(await s4626.totalAssets()).to.equal(USDC(1_000));
      expect(await sAave.totalAssets()).to.equal(USDC(4_000));
    });

    it("caps maxWithdraw by liquidity and reverts when illiquid", async () => {
      const { vault, alice, keeper, target, pool, aToken } = await loadFixture(deployWithStrategiesFixture);
      await vault.setFees(0, 0);
      await vault.connect(alice).deposit(USDC(10_000), alice.address);
      await vault.connect(keeper).rebalance();
      await target.setLiquidityLimit(USDC(1_000)); // redemption gate on the RWA/4626 source
      expect(await vault.maxWithdraw(alice.address)).to.equal(USDC(2_000 + 1_000 + 4_000));
      await expect(
        vault.connect(alice).withdraw(USDC(8_000), alice.address, alice.address),
      ).to.be.revertedWithCustomError(vault, "ERC4626ExceededMaxWithdraw");
      expect(await pool.getAddress()).to.properAddress;
      expect(await aToken.balanceOf(await vault.strategyAt(1).then((s) => s.strategy))).to.equal(USDC(4_000));
    });

    it("guardian can emergency-deallocate to the vault; removal requires empty strategy", async () => {
      const { vault, alice, keeper, guardian, s4626 } = await loadFixture(deployWithStrategiesFixture);
      await vault.connect(alice).deposit(USDC(10_000), alice.address);
      await vault.connect(keeper).rebalance();
      await expect(vault.removeStrategy(0)).to.be.revertedWithCustomError(vault, "StrategyNotEmpty");
      await vault.connect(guardian).deallocate(0, USDC(4_000));
      expect(await s4626.totalAssets()).to.equal(0);
      await vault.removeStrategy(0);
      expect(await vault.strategiesLength()).to.equal(1);
      expect(await vault.isStrategy(await s4626.getAddress())).to.equal(false);
      expect(await vault.totalAssets()).to.equal(USDC(10_000));
    });

    it("only the vault can move strategy funds", async () => {
      const { s4626, alice } = await loadFixture(deployWithStrategiesFixture);
      await expect(s4626.connect(alice).withdraw(1n)).to.be.revertedWithCustomError(s4626, "OnlyVault");
      await expect(s4626.connect(alice).deposit(1n)).to.be.revertedWithCustomError(s4626, "OnlyVault");
    });

    it("sweeps stray tokens but never the underlying", async () => {
      const { vault, usdc, admin } = await loadFixture(deployVaultFixture);
      const stray = await ethers.deployContract("MockERC20", ["Stray", "S", 18]);
      await stray.mint(await vault.getAddress(), 5n);
      await vault.sweep(await stray.getAddress(), admin.address);
      expect(await stray.balanceOf(admin.address)).to.equal(5n);
      await expect(vault.sweep(await usdc.getAddress(), admin.address)).to.be.revertedWithCustomError(
        vault,
        "Unauthorized",
      );
    });
  });
});
