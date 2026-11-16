import { ethers } from "hardhat";

export const USDC = (n: number | string) => ethers.parseUnits(String(n), 6);
export const YEAR = 365 * 24 * 60 * 60;

export const Track = { Conventional: 0, Sharia: 1 } as const;
export const Risk = { Conservative: 0, Balanced: 1, Aggressive: 2 } as const;

export async function deployVaultFixture() {
  const [admin, treasury, strategist, keeper, guardian, alice, bob, carol] = await ethers.getSigners();

  const usdc = await ethers.deployContract("MockERC20", ["USD Coin", "USDC", 6]);
  const vault = await ethers.deployContract("EmbryoVault", [
    await usdc.getAddress(),
    "Embryo Conventional Balanced",
    "eCB",
    Track.Conventional,
    Risk.Balanced,
    admin.address,
    treasury.address,
    100, // 1%/yr management
    1000, // 10% performance
    ethers.MaxUint256,
  ]);

  await vault.grantRole(await vault.STRATEGIST_ROLE(), strategist.address);
  await vault.grantRole(await vault.KEEPER_ROLE(), keeper.address);
  await vault.grantRole(await vault.GUARDIAN_ROLE(), guardian.address);

  for (const u of [alice, bob, carol]) {
    await usdc.mint(u.address, USDC(1_000_000));
    await usdc.connect(u).approve(await vault.getAddress(), ethers.MaxUint256);
  }

  return { usdc, vault, admin, treasury, strategist, keeper, guardian, alice, bob, carol };
}

export async function deployWithStrategiesFixture() {
  const base = await deployVaultFixture();
  const { usdc, vault } = base;
  const vaultAddr = await vault.getAddress();

  // ERC-4626 yield source (stands in for Morpho / tokenized T-bills / sukuk wrapper)
  const target = await ethers.deployContract("MockERC4626", [await usdc.getAddress()]);
  const s4626 = await ethers.deployContract("ERC4626Strategy", [vaultAddr, await target.getAddress()]);

  // Aave V3
  const aToken = await ethers.deployContract("MockATokenVault", [await usdc.getAddress()]);
  const pool = await ethers.deployContract("MockAavePool", [await usdc.getAddress(), await aToken.getAddress()]);
  await aToken.setPool(await pool.getAddress());
  const sAave = await ethers.deployContract("AaveV3Strategy", [
    vaultAddr,
    await pool.getAddress(),
    await aToken.getAddress(),
  ]);

  await vault.addStrategy(await s4626.getAddress(), 4000, 6000);
  await vault.addStrategy(await sAave.getAddress(), 4000, 6000);

  return { ...base, target, s4626, aToken, pool, sAave };
}
