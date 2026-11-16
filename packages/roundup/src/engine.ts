import { MICRO, toMicroUsdc } from "./currency";

export type Tier = "free" | "plus" | "elite";

/** Maximum round-up multiplier allowed per card tier (PRD §2.3). */
export const TIER_MAX_MULTIPLIER: Record<Tier, number> = { free: 2, plus: 5, elite: 10 };

export type SpareChangeStep = 1 | 5 | 10;

export interface RoundUpSettings {
  enabled: boolean;
  /** Round each purchase up to the next 1/5/10 major units of the transaction currency. */
  spareChangeStep?: SpareChangeStep | null;
  /** Additionally invest this % of each purchase, in basis points (500 = 5%). */
  percentBps?: number | null;
  /** Multiplies the spare-change component (x1..x10, capped by tier). */
  multiplier: number;
  /** User-defined cap per UTC day, micro-USDC. */
  dailyCapMicro: bigint;
  tier: Tier;
}

export interface CardTransaction {
  id: string;
  /** Purchase amount in the transaction currency's minor units (positive). */
  amountMinor: bigint;
  currency: string;
  /** Merchant category code; some categories are excluded (see EXCLUDED_MCC). */
  mcc?: string;
}

export interface RoundUpResult {
  /** Spare-change component (after multiplier), minor units of tx currency. */
  spareMinor: bigint;
  /** Percent component, minor units of tx currency. */
  percentMinor: bigint;
  totalMinor: bigint;
  /** Amount to invest in micro-USDC, after daily cap. */
  investMicro: bigint;
  /** True when the daily cap reduced the round-up. */
  capped: boolean;
  /** Reason when nothing is invested. */
  skipped?: "disabled" | "excluded_mcc" | "cap_reached" | "zero";
}

/**
 * Merchant categories we never round up on: cash withdrawals, quasi-cash, gambling,
 * money transfers and crypto purchases (avoids investing someone's rent transfer or a bet).
 */
export const EXCLUDED_MCC = new Set(["6010", "6011", "6051", "6540", "7995", "4829", "6012"]);

export function validateSettings(s: RoundUpSettings): void {
  if (!Number.isInteger(s.multiplier) || s.multiplier < 1) throw new Error("multiplier must be an integer >= 1");
  if (s.multiplier > TIER_MAX_MULTIPLIER[s.tier]) {
    throw new Error(`multiplier x${s.multiplier} exceeds ${s.tier} tier max x${TIER_MAX_MULTIPLIER[s.tier]}`);
  }
  if (s.spareChangeStep != null && ![1, 5, 10].includes(s.spareChangeStep)) throw new Error("invalid step");
  if (s.percentBps != null && (!Number.isInteger(s.percentBps) || s.percentBps < 0 || s.percentBps > 5000)) {
    throw new Error("percentBps must be an integer in [0, 5000]");
  }
  if (s.dailyCapMicro < 0n) throw new Error("dailyCapMicro must be >= 0");
}

/** Spare change to the next multiple of `step` major units. 24.50 AED step 1 → 0.50. */
export function spareChange(amountMinor: bigint, exponent: number, step: SpareChangeStep): bigint {
  if (amountMinor <= 0n) return 0n;
  const stepMinor = BigInt(step) * 10n ** BigInt(exponent);
  const rem = amountMinor % stepMinor;
  return rem === 0n ? 0n : stepMinor - rem;
}

/**
 * Compute the round-up for one settled card transaction.
 * @param usdPerUnit FX rate for tx.currency (USD per major unit, FX_SCALE fixed-point)
 * @param spentTodayMicro amount already invested today for this user (micro-USDC)
 */
export function computeRoundUp(
  tx: CardTransaction,
  settings: RoundUpSettings,
  exponent: number,
  usdPerUnit: bigint,
  spentTodayMicro: bigint,
): RoundUpResult {
  validateSettings(settings);
  const zero = { spareMinor: 0n, percentMinor: 0n, totalMinor: 0n, investMicro: 0n, capped: false };
  if (!settings.enabled) return { ...zero, skipped: "disabled" };
  if (tx.mcc && EXCLUDED_MCC.has(tx.mcc)) return { ...zero, skipped: "excluded_mcc" };

  const spare = settings.spareChangeStep
    ? spareChange(tx.amountMinor, exponent, settings.spareChangeStep) * BigInt(settings.multiplier)
    : 0n;
  const percent = settings.percentBps ? (tx.amountMinor * BigInt(settings.percentBps)) / 10_000n : 0n;
  const totalMinor = spare + percent;
  if (totalMinor === 0n) return { ...zero, skipped: "zero" };

  const wantMicro = toMicroUsdc(totalMinor, tx.currency, usdPerUnit);
  const remaining = settings.dailyCapMicro > spentTodayMicro ? settings.dailyCapMicro - spentTodayMicro : 0n;
  if (remaining === 0n) return { spareMinor: spare, percentMinor: percent, totalMinor, investMicro: 0n, capped: true, skipped: "cap_reached" };
  const investMicro = wantMicro > remaining ? remaining : wantMicro;
  return { spareMinor: spare, percentMinor: percent, totalMinor, investMicro, capped: investMicro < wantMicro };
}

export interface SettlementPolicy {
  /** Settle once pending reaches this many micro-USDC. Default $5. */
  thresholdMicro: bigint;
  /** Settle anything pending older than this. Default 24h. */
  maxAgeMs: number;
  /** Never settle dust below this (gas would exceed value). Default $0.50. */
  minMicro: bigint;
}

export const DEFAULT_SETTLEMENT_POLICY: SettlementPolicy = {
  thresholdMicro: 5n * MICRO,
  maxAgeMs: 24 * 60 * 60 * 1000,
  minMicro: MICRO / 2n,
};

/** Decide whether a user's pending round-ups should be batched on-chain now. */
export function shouldSettle(
  pendingMicro: bigint,
  oldestPendingAt: Date | null,
  now: Date,
  policy: SettlementPolicy = DEFAULT_SETTLEMENT_POLICY,
): boolean {
  if (pendingMicro < policy.minMicro || !oldestPendingAt) return false;
  if (pendingMicro >= policy.thresholdMicro) return true;
  return now.getTime() - oldestPendingAt.getTime() >= policy.maxAgeMs;
}

export type RecurringFrequency = "daily" | "weekly" | "monthly";

/** Next run of a recurring deposit, anchored to UTC midnight. */
export function nextRecurringRun(from: Date, frequency: RecurringFrequency, anchorDay = 1): Date {
  const d = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()));
  if (frequency === "daily") {
    d.setUTCDate(d.getUTCDate() + 1);
  } else if (frequency === "weekly") {
    d.setUTCDate(d.getUTCDate() + 7);
  } else {
    const day = Math.min(Math.max(anchorDay, 1), 28);
    const next = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), day));
    if (next <= from) next.setUTCMonth(next.getUTCMonth() + 1);
    return next;
  }
  return d;
}
