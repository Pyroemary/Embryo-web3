import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";
import { deployVaultFixture, USDC } from "./fixtures";

async function routerFixture() {
  const base = await deployVaultFixture();
  const { usdc, vault, admin, keeper, guardian, alice, bob } = base;
  const router = await ethers.deployContract("RoundUpRouter", [await usdc.getAddress(), admin.address]);
  await router.grantRole(await router.KEEPER_ROLE(), keeper.address);
  await router.grantRole(await router.GUARDIAN_ROLE(), guardian.address);
  await router.setVault(await vault.getAddress(), true);
  for (const u of [alice, bob]) {
    await usdc.connect(u).approve(await router.getAddress(), ethers.MaxUint256);
  }
  return { ...base, router };
}

describe("RoundUpRouter", () => {
  it("only lists vaults with matching asset", async () => {
    const { router, admin } = await loadFixture(routerFixture);
    const otherAsset = await ethers.deployContract("MockERC20", ["EURC", "EURC", 6]);
    const eurVault = await ethers.deployContract("EmbryoVault", [
      await otherAsset.getAddress(), "e", "e", 0, 0, admin.address, admin.address, 0, 0, ethers.MaxUint256,
    ]);
    await expect(router.setVault(await eurVault.getAddress(), true)).to.be.revertedWithCustomError(
      router,
      "AssetMismatch",
    );
  });

  it("invests round-ups from the user's wallet; shares go to the user", async () => {
    const { router, vault, usdc, keeper, alice } = await loadFixture(routerFixture);
    await router.connect(alice).optIn(await vault.getAddress(), USDC(50));
    const before = await usdc.balanceOf(alice.address);
    await expect(router.connect(keeper).depositFor(alice.address, USDC(1.5)))
      .to.emit(router, "RoundUpInvested")
      .withArgs(alice.address, await vault.getAddress(), USDC(1.5), USDC(1.5) * 10n ** 6n);
    expect(before - (await usdc.balanceOf(alice.address))).to.equal(USDC(1.5));
    expect(await vault.balanceOf(alice.address)).to.equal(USDC(1.5) * 10n ** 6n);
    expect(await vault.balanceOf(await router.getAddress())).to.equal(0);
  });

  it("enforces the user's daily cap and resets each UTC day", async () => {
    const { router, vault, keeper, alice } = await loadFixture(routerFixture);
    await router.connect(alice).optIn(await vault.getAddress(), USDC(10));
    await router.connect(keeper).depositFor(alice.address, USDC(7));
    expect(await router.remainingToday(alice.address)).to.equal(USDC(3));
    await expect(router.connect(keeper).depositFor(alice.address, USDC(4)))
      .to.be.revertedWithCustomError(router, "DailyCapExceeded")
      .withArgs(USDC(3));
    await time.increase(24 * 60 * 60);
    expect(await router.remainingToday(alice.address)).to.equal(USDC(10));
    await router.connect(keeper).depositFor(alice.address, USDC(10));
  });

  it("cannot invest for users who never opted in or opted out", async () => {
    const { router, vault, keeper, alice, bob } = await loadFixture(routerFixture);
    await expect(router.connect(keeper).depositFor(bob.address, USDC(1))).to.be.revertedWithCustomError(
      router,
      "NotOptedIn",
    );
    await router.connect(alice).optIn(await vault.getAddress(), USDC(10));
    await router.connect(alice).optOut();
    await expect(router.connect(keeper).depositFor(alice.address, USDC(1))).to.be.revertedWithCustomError(
      router,
      "NotOptedIn",
    );
  });

  it("stops investing into a delisted vault", async () => {
    const { router, vault, keeper, alice } = await loadFixture(routerFixture);
    await router.connect(alice).optIn(await vault.getAddress(), USDC(10));
    await router.setVault(await vault.getAddress(), false);
    await expect(router.connect(keeper).depositFor(alice.address, USDC(1))).to.be.revertedWithCustomError(
      router,
      "VaultNotListed",
    );
  });

  it("batch isolates per-user failures", async () => {
    const { router, vault, usdc, keeper, alice, bob, carol } = await loadFixture(routerFixture);
    await router.connect(alice).optIn(await vault.getAddress(), USDC(100));
    await router.connect(bob).optIn(await vault.getAddress(), USDC(100));
    await usdc.connect(bob).approve(await router.getAddress(), 0); // bob revoked approval
    // carol never opted in
    const tx = router
      .connect(keeper)
      .batchDeposit([alice.address, bob.address, carol.address], [USDC(2), USDC(2), USDC(2)]);
    await expect(tx).to.emit(router, "RoundUpFailed");
    expect(await vault.balanceOf(alice.address)).to.equal(USDC(2) * 10n ** 6n);
    expect(await vault.balanceOf(bob.address)).to.equal(0);
    // bob's failed attempt didn't consume his cap
    expect(await router.remainingToday(bob.address)).to.equal(USDC(100));
    const result = await router.connect(keeper).batchDeposit.staticCall([alice.address, carol.address], [1n, 1n]);
    expect(result).to.equal(1n);
  });

  it("access control and pause", async () => {
    const { router, vault, keeper, guardian, alice } = await loadFixture(routerFixture);
    await router.connect(alice).optIn(await vault.getAddress(), USDC(10));
    await expect(router.connect(alice).depositFor(alice.address, 1n)).to.be.revertedWithCustomError(
      router,
      "AccessControlUnauthorizedAccount",
    );
    await expect(router.connect(alice).depositForSelf(alice.address, 1n)).to.be.revertedWithCustomError(
      router,
      "OnlySelf",
    );
    await router.connect(guardian).pause();
    await expect(router.connect(keeper).depositFor(alice.address, 1n)).to.be.revertedWithCustomError(
      router,
      "EnforcedPause",
    );
  });
});
