/**
 * Deploys the Embryo v1 core on Base / Base Sepolia / local Hardhat:
 *   - TimelockController (48h) governed by the founders' Safe
 *   - AllowlistGate (KYC perimeter, written by the compliance service)
 *   - 6 EmbryoVaults: {Conventional, Sharia} x {Conservative, Balanced, Aggressive}
 *   - RoundUpRouter
 *
 * Strategies are added afterwards via timelocked governance proposals, once yield sources
 * (Morpho vault, RWA T-bill / sukuk wrapper, cbBTC/WETH legs) are confirmed per vault.
 *
 * Env:
 *   USDC_ADDRESS        default: Base mainnet / Base Sepolia USDC; local: deploys a mock
 *   SAFE_ADDRESS        governance Safe (proposer/executor of the timelock). default: deployer
 *   GUARDIAN_ADDRESS    guardian Safe (instant pause). default: deployer
 *   KEEPER_ADDRESS      backend keeper EOA/relayer. default: deployer
 *   COMPLIANCE_ADDRESS  compliance service signer. default: deployer
 *   TREASURY_ADDRESS    fee recipient. default: SAFE_ADDRESS
 *   TIMELOCK_DELAY      seconds. default: 172800 (48h); 0 on local
 *   HANDOVER=true       transfer DEFAULT_ADMIN to the timelock and renounce deployer admin
 */
import { ethers, network } from "hardhat";
import fs from "node:fs";
import path from "node:path";

const USDC_BY_CHAIN: Record<number, string> = {
  8453: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", // Base
  84532: "0x036CbD53842c5426634e7929541eC2318f3dCF7e", // Base Sepolia
};

const TRACKS = [
  { id: 0, name: "Conventional", code: "C" },
  { id: 1, name: "Sharia", code: "S" },
];
const PROFILES = [
  { id: 0, name: "Conservative", code: "CON", mgmt: 50, perf: 0, cap: 10_000_000 },
  { id: 1, name: "Balanced", code: "BAL", mgmt: 75, perf: 1000, cap: 10_000_000 },
  { id: 2, name: "Aggressive", code: "AGG", mgmt: 100, perf: 1000, cap: 5_000_000 },
];

async function main() {
  const [deployer] = await ethers.getSigners();
  const chainId = Number((await ethers.provider.getNetwork()).chainId);
  const isLocal = network.name === "hardhat" || network.name === "localhost";
  console.log(`Deploying to ${network.name} (${chainId}) from ${deployer.address}`);

  let usdc = process.env.USDC_ADDRESS ?? USDC_BY_CHAIN[chainId];
  if (!usdc) {
    if (!isLocal) throw new Error("USDC_ADDRESS required for this network");
    const mock = await ethers.deployContract("MockERC20", ["USD Coin", "USDC", 6]);
    usdc = await mock.getAddress();
    console.log(`  mock USDC        ${usdc}`);
  }

  const safe = process.env.SAFE_ADDRESS ?? deployer.address;
  const guardian = process.env.GUARDIAN_ADDRESS ?? deployer.address;
  const keeper = process.env.KEEPER_ADDRESS ?? deployer.address;
  const compliance = process.env.COMPLIANCE_ADDRESS ?? deployer.address;
  const treasury = process.env.TREASURY_ADDRESS ?? safe;
  const delay = Number(process.env.TIMELOCK_DELAY ?? (isLocal ? 0 : 172_800));
  const handover = process.env.HANDOVER === "true";

  const timelock = await ethers.deployContract("TimelockController", [delay, [safe], [safe], ethers.ZeroAddress]);
  await timelock.waitForDeployment();
  console.log(`  Timelock         ${await timelock.getAddress()} (delay ${delay}s)`);

  const gate = await ethers.deployContract("AllowlistGate", [deployer.address]);
  await gate.waitForDeployment();
  await (await gate.grantRole(await gate.COMPLIANCE_ROLE(), compliance)).wait();
  console.log(`  AllowlistGate    ${await gate.getAddress()}`);

  const router = await ethers.deployContract("RoundUpRouter", [usdc, deployer.address]);
  await router.waitForDeployment();
  await (await router.grantRole(await router.KEEPER_ROLE(), keeper)).wait();
  await (await router.grantRole(await router.GUARDIAN_ROLE(), guardian)).wait();
  console.log(`  RoundUpRouter    ${await router.getAddress()}`);

  const vaults: Record<string, string> = {};
  for (const t of TRACKS) {
    for (const p of PROFILES) {
      const name = `Embryo ${t.name} ${p.name}`;
      const symbol = `emb${t.code}${p.code}`;
      const vault = await ethers.deployContract("EmbryoVault", [
        usdc, name, symbol, t.id, p.id, deployer.address, treasury, p.mgmt, p.perf,
        ethers.parseUnits(String(p.cap), 6),
      ]);
      await vault.waitForDeployment();
      const addr = await vault.getAddress();
      await (await vault.setAccessGate(await gate.getAddress())).wait();
      await (await vault.grantRole(await vault.KEEPER_ROLE(), keeper)).wait();
      await (await vault.grantRole(await vault.STRATEGIST_ROLE(), safe)).wait();
      await (await vault.grantRole(await vault.GUARDIAN_ROLE(), guardian)).wait();
      await (await router.setVault(addr, true)).wait();
      if (handover) {
        await (await vault.grantRole(await vault.DEFAULT_ADMIN_ROLE(), await timelock.getAddress())).wait();
        await (await vault.renounceRole(await vault.DEFAULT_ADMIN_ROLE(), deployer.address)).wait();
      }
      vaults[symbol] = addr;
      console.log(`  ${symbol.padEnd(16)} ${addr}  ${name}`);
    }
  }

  if (handover) {
    for (const c of [gate, router]) {
      await (await c.grantRole(await c.DEFAULT_ADMIN_ROLE(), await timelock.getAddress())).wait();
      await (await c.renounceRole(await c.DEFAULT_ADMIN_ROLE(), deployer.address)).wait();
    }
    console.log("  Admin handed over to timelock; deployer renounced.");
  } else {
    console.log("  NOTE: deployer still holds admin. Re-run governance handover before mainnet.");
  }

  const out = {
    network: network.name,
    chainId,
    usdc,
    timelock: await timelock.getAddress(),
    gate: await gate.getAddress(),
    router: await router.getAddress(),
    vaults,
    roles: { safe, guardian, keeper, compliance, treasury },
    deployedAt: new Date().toISOString(),
  };
  const dir = path.join(__dirname, "..", "deployments");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${network.name}.json`), JSON.stringify(out, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
