import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import { Prisma, RoundUpSettings, Tier, User } from "@prisma/client";
import {
  computeRoundUp, currencyExponent, nextRecurringRun, RecurringFrequency, RoundUpSettings as EngineSettings,
  SpareChangeStep, validateSettings,
} from "@embryo/roundup";
import { FxService } from "../fx/fx.service";
import { ACCOUNTS, LedgerService } from "../ledger/ledger.service";
import { PrismaService } from "../prisma.service";

const TIER: Record<Tier, EngineSettings["tier"]> = { FREE: "free", PLUS: "plus", ELITE: "elite" };

export function toEngine(s: RoundUpSettings, tier: Tier): EngineSettings {
  return {
    enabled: s.enabled,
    spareChangeStep: (s.spareChangeStep as SpareChangeStep | null) ?? null,
    percentBps: s.percentBps,
    multiplier: s.multiplier,
    dailyCapMicro: s.dailyCapMicro,
    tier: TIER[tier],
  };
}

export interface SettingsInput {
  enabled?: boolean;
  spareChangeStep?: 1 | 5 | 10 | null;
  percentBps?: number | null;
  multiplier?: number;
  dailyCapMicro?: bigint;
  recurringMicro?: bigint | null;
  recurringFreq?: RecurringFrequency | null;
}

function startOfUtcDay(d: Date) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

@Injectable()
export class RoundUpsService {
  private readonly log = new Logger(RoundUpsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
    private readonly fx: FxService,
  ) {}

  async settings(userId: string): Promise<RoundUpSettings> {
    return this.prisma.roundUpSettings.upsert({ where: { userId }, create: { userId }, update: {} });
  }

  async updateSettings(user: User, input: SettingsInput): Promise<RoundUpSettings> {
    const current = await this.settings(user.id);
    const next = { ...current, ...input } as RoundUpSettings;
    try {
      validateSettings(toEngine(next, user.tier));
    } catch (e) {
      throw new BadRequestException((e as Error).message);
    }
    if ((next.recurringMicro == null) !== (next.recurringFreq == null)) {
      throw new BadRequestException("recurringMicro and recurringFreq must be set together");
    }
    const recurringNextAt =
      next.recurringFreq && next.recurringFreq !== current.recurringFreq
        ? nextRecurringRun(new Date(), next.recurringFreq as RecurringFrequency)
        : next.recurringFreq
          ? current.recurringNextAt
          : null;
    return this.prisma.roundUpSettings.update({
      where: { userId: user.id },
      data: { ...input, recurringNextAt },
    });
  }

  async spentToday(userId: string, tx: Prisma.TransactionClient = this.prisma, now = new Date()): Promise<bigint> {
    const agg = await tx.roundUpEntry.aggregate({
      where: { userId, createdAt: { gte: startOfUtcDay(now) }, status: { notIn: ["REVERSED", "FAILED"] } },
      _sum: { amountMicro: true },
    });
    return agg._sum.amountMicro ?? 0n;
  }

  /** Called when a card transaction settles. Creates at most one round-up per transaction. */
  async onSettled(transactionId: string) {
    const tx = await this.prisma.cardTransaction.findUniqueOrThrow({
      where: { id: transactionId },
      include: { card: { include: { user: true } }, roundUp: true },
    });
    if (tx.roundUp) return tx.roundUp;
    const user = tx.card.user;
    const settings = await this.settings(user.id);
    const rate = await this.fx.usdPerUnit(tx.currency);

    return this.prisma.$transaction(async (db) => {
      const spent = await this.spentToday(user.id, db);
      const result = computeRoundUp(
        { id: tx.id, amountMinor: tx.amountMinor, currency: tx.currency, mcc: tx.mcc ?? undefined },
        toEngine(settings, user.tier),
        currencyExponent(tx.currency),
        rate,
        spent,
      );
      if (result.investMicro === 0n) return null;
      const entry = await db.roundUpEntry.create({
        data: {
          userId: user.id,
          transactionId: tx.id,
          source: "card",
          amountMicro: result.investMicro,
          localMinor: result.totalMinor,
          localCurrency: tx.currency,
        },
      });
      await this.ledger.post(db, "roundup.accrued", `roundup:${entry.id}`, [
        { userId: user.id, code: ACCOUNTS.pending, amountMicro: entry.amountMicro },
        { userId: user.id, code: ACCOUNTS.wallet, amountMicro: -entry.amountMicro },
      ], `${tx.merchantName} ${tx.currency} ${tx.amountMinor}`);
      return entry;
    }, { isolationLevel: "Serializable" });
  }

  /** Refund/reversal: undo a round-up that hasn't been invested yet. */
  async onReversed(transactionId: string) {
    const entry = await this.prisma.roundUpEntry.findUnique({ where: { transactionId } });
    if (!entry || entry.status !== "PENDING") return entry;
    return this.prisma.$transaction(async (db) => {
      const updated = await db.roundUpEntry.update({ where: { id: entry.id }, data: { status: "REVERSED" } });
      await this.ledger.post(db, "roundup.reversed", `roundup-reversal:${entry.id}`, [
        { userId: entry.userId, code: ACCOUNTS.pending, amountMicro: -entry.amountMicro },
        { userId: entry.userId, code: ACCOUNTS.wallet, amountMicro: entry.amountMicro },
      ]);
      return updated;
    });
  }

  /** One-time top-up into the vault (the "One-time" button in the app). */
  async oneTime(user: User, amountMicro: bigint, source: "manual" | "recurring" = "manual", reference?: string) {
    if (amountMicro <= 0n) throw new BadRequestException("amount must be positive");
    return this.prisma.$transaction(async (db) => {
      const entry = await db.roundUpEntry.create({ data: { userId: user.id, source, amountMicro } });
      await this.ledger.post(db, `roundup.${source}`, reference ?? `roundup:${entry.id}`, [
        { userId: user.id, code: ACCOUNTS.pending, amountMicro },
        { userId: user.id, code: ACCOUNTS.wallet, amountMicro: -amountMicro },
      ]);
      return entry;
    });
  }

  /** Create due recurring deposits (idempotent per user per scheduled run). */
  async runRecurring(now = new Date()): Promise<number> {
    const due = await this.prisma.roundUpSettings.findMany({
      where: { recurringNextAt: { lte: now }, recurringMicro: { not: null }, enabled: true },
      include: { user: true },
    });
    for (const s of due) {
      const ref = `recurring:${s.userId}:${s.recurringNextAt!.toISOString()}`;
      const exists = await this.prisma.ledgerTransaction.findUnique({ where: { reference: ref } });
      if (!exists) await this.oneTime(s.user, s.recurringMicro!, "recurring", ref);
      await this.prisma.roundUpSettings.update({
        where: { userId: s.userId },
        data: { recurringNextAt: nextRecurringRun(now, s.recurringFreq as RecurringFrequency) },
      });
    }
    return due.length;
  }

  async summary(userId: string) {
    const [pending, invested] = await Promise.all([
      this.ledger.balance(userId, ACCOUNTS.pending),
      this.ledger.balance(userId, ACCOUNTS.invested),
    ]);
    return { pendingMicro: pending, investedPrincipalMicro: invested, spentTodayMicro: await this.spentToday(userId) };
  }
}
