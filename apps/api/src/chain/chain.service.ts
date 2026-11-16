import { Injectable, Logger } from "@nestjs/common";
import {
  Address, createPublicClient, createWalletClient, getAddress, Hex, http, parseEventLogs, PublicClient, WalletClient,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base, baseSepolia } from "viem/chains";
import { config } from "../config";
import { allowlistGateAbi, roundUpRouterAbi, vaultAbi } from "./abis";

export interface BatchResult {
  txHash: Hex;
  invested: Address[];
  failed: Address[];
}

/**
 * All on-chain writes go through here. In CHAIN_DRY_RUN mode nothing is sent and every
 * operation "succeeds" — used for local dev and tests.
 * Production: replace the raw keeper key with a KMS-backed signer or a relayer (e.g. OZ Defender / Gelato).
 */
@Injectable()
export class ChainService {
  private readonly log = new Logger(ChainService.name);
  private readonly cfg = config();
  private publicClient?: PublicClient;
  private walletClient?: WalletClient;

  get dryRun() {
    return this.cfg.CHAIN_DRY_RUN;
  }

  private clients() {
    if (!this.publicClient || !this.walletClient) {
      const chain = this.cfg.CHAIN === "base" ? base : baseSepolia;
      const transport = http(this.cfg.RPC_URL);
      this.publicClient = createPublicClient({ chain, transport }) as PublicClient;
      const account = privateKeyToAccount(this.cfg.KEEPER_PRIVATE_KEY as Hex);
      this.walletClient = createWalletClient({ chain, transport, account });
    }
    return { pub: this.publicClient, wallet: this.walletClient };
  }

  async batchDeposit(users: Address[], amounts: bigint[]): Promise<BatchResult> {
    if (this.dryRun) {
      this.log.log(`[dry-run] batchDeposit ${users.length} users, total ${amounts.reduce((a, b) => a + b, 0n)}`);
      return { txHash: `0x${"0".repeat(63)}1`, invested: users, failed: [] };
    }
    const { pub, wallet } = this.clients();
    const hash = await wallet.writeContract({
      address: getAddress(this.cfg.ROUNDUP_ROUTER_ADDRESS),
      abi: roundUpRouterAbi,
      functionName: "batchDeposit",
      args: [users, amounts],
      account: wallet.account!,
      chain: wallet.chain,
    });
    const receipt = await pub.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success") throw new Error(`batchDeposit reverted: ${hash}`);
    const logs = parseEventLogs({ abi: roundUpRouterAbi, logs: receipt.logs });
    const invested = logs.filter((l) => l.eventName === "RoundUpInvested").map((l) => getAddress(l.args.user));
    const failed = logs.filter((l) => l.eventName === "RoundUpFailed").map((l) => getAddress(l.args.user));
    return { txHash: hash, invested, failed };
  }

  async setAllowed(accounts: Address[], allowed: boolean): Promise<Hex | null> {
    if (accounts.length === 0) return null;
    if (this.dryRun) {
      this.log.log(`[dry-run] gate.setAllowed(${accounts.join(",")}, ${allowed})`);
      return `0x${"0".repeat(63)}2`;
    }
    const { pub, wallet } = this.clients();
    const hash = await wallet.writeContract({
      address: getAddress(this.cfg.ALLOWLIST_GATE_ADDRESS),
      abi: allowlistGateAbi,
      functionName: "setAllowed",
      args: [accounts, allowed],
      account: wallet.account!,
      chain: wallet.chain,
    });
    await pub.waitForTransactionReceipt({ hash });
    return hash;
  }

  async vaultPosition(vault: Address, owner: Address): Promise<{ shares: bigint; assets: bigint }> {
    if (this.dryRun) return { shares: 0n, assets: 0n };
    const { pub } = this.clients();
    const shares = await pub.readContract({ address: vault, abi: vaultAbi, functionName: "balanceOf", args: [owner] });
    const assets = await pub.readContract({ address: vault, abi: vaultAbi, functionName: "convertToAssets", args: [shares] });
    return { shares, assets };
  }
}
