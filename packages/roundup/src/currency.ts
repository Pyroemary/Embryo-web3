/** ISO-4217 minor-unit exponents for currencies Embryo users commonly spend in. Default 2. */
const EXPONENTS: Record<string, number> = {
  BHD: 3, IQD: 3, JOD: 3, KWD: 3, LYD: 3, OMR: 3, TND: 3,
  JPY: 0, KRW: 0, VND: 0, CLP: 0, ISK: 0, UGX: 0, XAF: 0, XOF: 0,
};

export function currencyExponent(currency: string): number {
  const c = currency.toUpperCase();
  if (!/^[A-Z]{3}$/.test(c)) throw new Error(`Invalid currency code: ${currency}`);
  return EXPONENTS[c] ?? 2;
}

/** USDC has 6 decimals; we account in "micro-USDC" (1 USDC = 1_000_000n). */
export const USDC_DECIMALS = 6;
export const MICRO = 10n ** BigInt(USDC_DECIMALS);

/** Fixed-point scale for FX rates. */
export const FX_SCALE = 10n ** 18n;

/** Parse a decimal string ("3.6725") into a bigint scaled by 10^decimals. Rounds down. */
export function parseDecimal(value: string, decimals: number): bigint {
  const s = value.trim();
  if (!/^\d+(\.\d+)?$/.test(s)) throw new Error(`Invalid decimal: ${value}`);
  const [whole, frac = ""] = s.split(".");
  const fracPadded = (frac + "0".repeat(decimals)).slice(0, decimals);
  return BigInt(whole) * 10n ** BigInt(decimals) + BigInt(fracPadded || "0");
}

/** Format a bigint amount with `decimals` places as a plain decimal string. */
export function formatUnits(amount: bigint, decimals: number): string {
  const neg = amount < 0n;
  const abs = neg ? -amount : amount;
  const base = 10n ** BigInt(decimals);
  const whole = abs / base;
  const frac = (abs % base).toString().padStart(decimals, "0");
  return `${neg ? "-" : ""}${whole}${decimals > 0 ? "." + frac : ""}`;
}

/**
 * Convert an amount in a currency's minor units into micro-USDC.
 * @param usdPerUnit price of 1 major unit of `currency` in USD, scaled by FX_SCALE
 *                   (e.g. AED: parseDecimal("0.272294", 18)). Rounds down (never over-invest).
 */
export function toMicroUsdc(amountMinor: bigint, currency: string, usdPerUnit: bigint): bigint {
  if (usdPerUnit <= 0n) throw new Error("FX rate must be positive");
  const exp = BigInt(currencyExponent(currency));
  return (amountMinor * usdPerUnit * MICRO) / (10n ** exp * FX_SCALE);
}
