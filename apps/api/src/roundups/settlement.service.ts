import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { Address, getAddress } from "viem";
import { DEFAULT_SETTLEMENT_POLICY, shouldSettle } from "@embryo/roundup";
import { ChainService } from "../chain/chain.service";
import { GateSyncService } from "../compliance/gate-sync.service";
import { config } from "../config";
import { ACCOUNTS, LedgerService } from "../ledger/ledger.service";
import { PrismaService } from "../prisma.service";
import { RoundUpsService } from "./roundups.service";

const LOCK_KEY = 7_242_001; // pg advisory lock: one settlement run at a time across replicas
const MAX_USERS_PER_BATCH = 100;

export interface SettlementReport {
  batchId: string | null;
  users: number;
  totalMicro: bigint;
  invested: number;
  failed: number;
  skipped?: string;
}

/**
 * Moves pending round-ups on-chain:
 *   pending entries → SUBMITTED (batch) → RoundUpRouter.batchDeposit → INVESTED (+ ledger)
 * Users whose deposit failed on-chain (revoked approval, insufficient USDC, cap) go back to PENDING.
 */
@Injectable()
export class SettlementService {
  private readonly log = new Logger(SettlementService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly chain: ChainService,
    private readonly ledger: LedgerService,
    private readonly roundups: RoundUpsService,
    private readonly gate: GateSyncService,
  ) {}

  @Cron(CronExpression.EVERY_10_MINUTES)
  async scheduled() {
    if (!config().SETTLEMENT_CRON_ENABLED) return;
    await this.gate.syncPending();
    await this.roundups.runRecurring();
    await this.run();
  }

  async run(now = new Date()): Promise<SettlementReport> {
    const [{ locked }] = await this.prisma.$queryRaw<{ locked: boolean }[]>`SELECT pg_try_advisory_lock(${LOCK_KEY}) AS locked`;
    if (!locked) return { batchId: null, users: 0, totalMicro: 0n, invested: 0, failed: 0, skipped: "locked" };
    try {
      return await this.runLocked(now);
    } finally {
      await this.prisma.$queryRaw`SELECT pg_advisory_unlock(${LOCK_KEY})`;
    }
  }

  private async runLocked(now: Date): Promise<SettlementReport> {
    const groups = await this.prisma.roundUpEntry.groupBy({
      by: ["userId"],
      where: { status: "PENDING" },
      _sum: { amountMicro: true },
      _min: { createdAt: true },
    });
    const due = groups.filter((g) => shouldSettle(g._sum.amountMicro ?? 0n, g._min.createdAt, now, DEFAULT_SETTLEMENT_POLICY));
    if (!due.length) return { batchId: null, users: 0, totalMicro: 0n, invested: 0, failed: 0, skipped: "nothing due" };

    const users = await this.prisma.user.findMany({
      where: {
        id: { in: due.map((g) => g.userId) },
        kycStatus: "APPROVED",
        gateSynced: true,
        walletAddress: { not: null },
      },
      take: MAX_USERS_PER_BATCH,
    });
    if (!users.length) return { batchId: null, users: 0, totalMicro: 0n, invested: 0, failed: 0, skipped: "no eligible users" };

    const entries = await this.prisma.roundUpEntry.findMany({
      where: { userId: { in: users.map((u) => u.id) }, status: "PENDING" },
    });
    const perUser = new Map<string, bigint>();
    for (const e of entries) perUser.set(e.userId, (perUser.get(e.userId) ?? 0n) + e.amountMicro);
    const totalMicro = [...perUser.values()].reduce((a, b) => a + b, 0n);

    const batch = await this.prisma.$transaction(async (db) => {
      const b = await db.settlementBatch.create({ data: { status: "building", totalMicro, userCount: perUser.size } });
      await db.roundUpEntry.updateMany({
        where: { id: { in: entries.map((e) => e.id) }, status: "PENDING" },
        data: { status: "SUBMITTED", batchId: b.id },
      });
      return b;
    });

    const addrToUser = new Map<string, string>();
    const addrs: Address[] = [];
    const amounts: bigint[] = [];
    for (const u of users) {
      const amount = perUser.get(u.id);
      if (!amount) continue;
      const addr = getAddress(u.walletAddress!);
      addrToUser.set(addr, u.id);
      addrs.push(addr);
      amounts.push(amount);
    }

    try {
      const result = await this.chain.batchDeposit(addrs, amounts);
      await this.prisma.settlementBatch.update({ where: { id: batch.id }, data: { status: "submitted", txHash: result.txHash } });
      const failedIds = result.failed.map((a) => addrToUser.get(a)).filter(Boolean) as string[];
      const investedIds = result.invested.map((a) => addrToUser.get(a)).filter(Boolean) as string[];

      await this.prisma.$transaction(async (db) => {
        for (const userId of investedIds) {
          const amount = perUser.get(userId)!;
          await db.roundUpEntry.updateMany({ where: { batchId: batch.id, userId }, data: { status: "INVESTED" } });
          await this.ledger.post(db, "roundup.invested", `settle:${batch.id}:${userId}`, [
            { userId, code: ACCOUNTS.invested, amountMicro: amount },
            { userId, code: ACCOUNTS.pending, amountMicro: -amount },
          ], result.txHash);
        }
        if (failedIds.length) {
          await db.roundUpEntry.updateMany({
            where: { batchId: batch.id, userId: { in: failedIds } },
            data: { status: "PENDING", batchId: null },
          });
        }
        await db.settlementBatch.update({ where: { id: batch.id }, data: { status: "confirmed" } });
      });
      this.log.log(`batch ${batch.id}: ${investedIds.length} invested, ${failedIds.length} failed, tx ${result.txHash}`);
      return { batchId: batch.id, users: addrs.length, totalMicro, invested: investedIds.length, failed: failedIds.length };
    } catch (e) {
      const msg = (e as Error).message;
      this.log.error(`batch ${batch.id} failed: ${msg}`);
      await this.prisma.$transaction([
        this.prisma.roundUpEntry.updateMany({ where: { batchId: batch.id }, data: { status: "PENDING", batchId: null } }),
        this.prisma.settlementBatch.update({ where: { id: batch.id }, data: { status: "failed", error: msg.slice(0, 500) } }),
      ]);
      throw e;
    }
  }
}
