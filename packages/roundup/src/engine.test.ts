import { describe, expect, it } from "vitest";
import {
  computeRoundUp, currencyExponent, DEFAULT_SETTLEMENT_POLICY, formatUnits, MICRO, nextRecurringRun,
  parseDecimal, RoundUpSettings, shouldSettle, spareChange, toMicroUsdc, zodiacFromDate,
} from "./index";

const AED_USD = parseDecimal("0.272294", 18); // 1 AED = 0.272294 USD (pegged at 3.6725)
const USD_USD = parseDecimal("1", 18);

const base: RoundUpSettings = {
  enabled: true,
  spareChangeStep: 1,
  percentBps: null,
  multiplier: 1,
  dailyCapMicro: 100n * MICRO,
  tier: "free",
};

describe("currency", () => {
  it("knows exponents", () => {
    expect(currencyExponent("AED")).toBe(2);
    expect(currencyExponent("kwd")).toBe(3);
    expect(currencyExponent("JPY")).toBe(0);
    expect(() => currencyExponent("US")).toThrow();
  });

  it("parses and formats decimals", () => {
    expect(parseDecimal("3.6725", 4)).toBe(36725n);
    expect(parseDecimal("1.23456789", 2)).toBe(123n);
    expect(formatUnits(1_500_000n, 6)).toBe("1.500000");
    expect(formatUnits(-5n, 2)).toBe("-0.05");
    expect(() => parseDecimal("1e5", 2)).toThrow();
  });

  it("converts to micro-USDC rounding down", () => {
    expect(toMicroUsdc(100n, "USD", USD_USD)).toBe(1_000_000n);
    expect(toMicroUsdc(367n, "AED", AED_USD)).toBe(999_318n); // 3.67 AED ≈ 0.999 USD
    expect(toMicroUsdc(1000n, "KWD", parseDecimal("3.25", 18))).toBe(3_250_000n);
    expect(() => toMicroUsdc(1n, "USD", 0n)).toThrow();
  });
});

describe("spareChange", () => {
  it("rounds to next step", () => {
    expect(spareChange(2450n, 2, 1)).toBe(50n); // AED 24.50 → 0.50 (deck mockup)
    expect(spareChange(2450n, 2, 5)).toBe(50n);
    expect(spareChange(2450n, 2, 10)).toBe(550n);
    expect(spareChange(2500n, 2, 1)).toBe(0n);
    expect(spareChange(1234n, 3, 1)).toBe(766n); // KWD 1.234 → 0.766
    expect(spareChange(0n, 2, 1)).toBe(0n);
  });
});

describe("computeRoundUp", () => {
  const coffee = { id: "t1", amountMinor: 2450n, currency: "AED", mcc: "5814" };

  it("reproduces the deck: Attibassi Coffee AED 24.50, x3 → AED 1.50", () => {
    const r = computeRoundUp(coffee, { ...base, tier: "plus", multiplier: 3 }, 2, AED_USD, 0n);
    expect(r.spareMinor).toBe(150n);
    expect(r.totalMinor).toBe(150n);
    expect(r.investMicro).toBe(408_441n); // AED 1.50 ≈ $0.408
    expect(r.capped).toBe(false);
  });

  it("combines spare change and percentage", () => {
    const r = computeRoundUp(coffee, { ...base, percentBps: 1000 }, 2, AED_USD, 0n);
    expect(r.spareMinor).toBe(50n);
    expect(r.percentMinor).toBe(245n);
    expect(r.totalMinor).toBe(295n);
  });

  it("percent-only mode", () => {
    const r = computeRoundUp({ ...coffee, amountMinor: 10_000n, currency: "USD" }, { ...base, spareChangeStep: null, percentBps: 500 }, 2, USD_USD, 0n);
    expect(r.investMicro).toBe(5n * MICRO);
  });

  it("applies the daily cap", () => {
    const tx = { id: "t", amountMinor: 1_000_00n, currency: "USD" };
    const s = { ...base, spareChangeStep: null, percentBps: 1000, dailyCapMicro: 15n * MICRO };
    const r = computeRoundUp(tx, s, 2, USD_USD, 10n * MICRO);
    expect(r.investMicro).toBe(5n * MICRO);
    expect(r.capped).toBe(true);
    const r2 = computeRoundUp(tx, s, 2, USD_USD, 15n * MICRO);
    expect(r2.skipped).toBe("cap_reached");
    expect(r2.investMicro).toBe(0n);
  });

  it("skips disabled, excluded MCCs and exact amounts", () => {
    expect(computeRoundUp(coffee, { ...base, enabled: false }, 2, AED_USD, 0n).skipped).toBe("disabled");
    expect(computeRoundUp({ ...coffee, mcc: "6011" }, base, 2, AED_USD, 0n).skipped).toBe("excluded_mcc");
    expect(computeRoundUp({ ...coffee, amountMinor: 2500n }, base, 2, AED_USD, 0n).skipped).toBe("zero");
  });

  it("enforces tier multiplier limits", () => {
    expect(() => computeRoundUp(coffee, { ...base, multiplier: 3 }, 2, AED_USD, 0n)).toThrow(/free tier max x2/);
    expect(() => computeRoundUp(coffee, { ...base, tier: "elite", multiplier: 11 }, 2, AED_USD, 0n)).toThrow();
    expect(() => computeRoundUp(coffee, { ...base, multiplier: 0 }, 2, AED_USD, 0n)).toThrow();
    expect(() => computeRoundUp(coffee, { ...base, percentBps: 6000 }, 2, AED_USD, 0n)).toThrow();
  });
});

describe("settlement", () => {
  const now = new Date("2026-11-16T12:00:00Z");
  it("settles at threshold or age, never dust", () => {
    expect(shouldSettle(5n * MICRO, new Date(now), now)).toBe(true);
    expect(shouldSettle(1n * MICRO, new Date(now.getTime() - 3600_000), now)).toBe(false);
    expect(shouldSettle(1n * MICRO, new Date(now.getTime() - DEFAULT_SETTLEMENT_POLICY.maxAgeMs), now)).toBe(true);
    expect(shouldSettle(MICRO / 10n, new Date(0), now)).toBe(false);
    expect(shouldSettle(10n * MICRO, null, now)).toBe(false);
  });

  it("schedules recurring deposits", () => {
    expect(nextRecurringRun(now, "daily").toISOString()).toBe("2026-11-17T00:00:00.000Z");
    expect(nextRecurringRun(now, "weekly").toISOString()).toBe("2026-11-23T00:00:00.000Z");
    expect(nextRecurringRun(now, "monthly", 1).toISOString()).toBe("2026-12-01T00:00:00.000Z");
    expect(nextRecurringRun(now, "monthly", 25).toISOString()).toBe("2026-11-25T00:00:00.000Z");
    expect(nextRecurringRun(now, "monthly", 31).toISOString()).toBe("2026-11-28T00:00:00.000Z");
  });
});

describe("zodiac", () => {
  it.each([
    ["1990-03-21", "aries"], ["1990-04-19", "aries"], ["1990-04-20", "taurus"],
    ["1990-12-22", "capricorn"], ["1990-01-19", "capricorn"], ["1990-01-20", "aquarius"],
    ["1990-02-29", "pisces"], ["1990-08-23", "virgo"], ["1990-11-21", "scorpio"],
  ])("%s → %s", (date, sign) => {
    expect(zodiacFromDate(new Date(`${date}T00:00:00Z`))).toBe(sign);
  });
});
