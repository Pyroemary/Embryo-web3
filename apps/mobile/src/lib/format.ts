import type { Locale } from "./i18n";

/** USD per 1 unit of display currency (GCC pegs; others would come from the API). */
const USD_PER_UNIT: Record<string, number> = { USD: 1, AED: 0.272294, SAR: 0.266667, QAR: 0.274725, BHD: 2.659574, OMR: 2.60078, KWD: 3.25, EUR: 1.08, GBP: 1.27, EGP: 0.0205 };

export const COUNTRY_CURRENCY: Record<string, string> = {
  AE: "AED", SA: "SAR", QA: "QAR", BH: "BHD", OM: "OMR", KW: "KWD", GB: "GBP", DE: "EUR", FR: "EUR", EG: "EGP",
};

export const COUNTRIES: { code: string; en: string; ar: string; flag: string }[] = [
  { code: "AE", en: "United Arab Emirates", ar: "الإمارات", flag: "🇦🇪" },
  { code: "SA", en: "Saudi Arabia", ar: "السعودية", flag: "🇸🇦" },
  { code: "QA", en: "Qatar", ar: "قطر", flag: "🇶🇦" },
  { code: "KW", en: "Kuwait", ar: "الكويت", flag: "🇰🇼" },
  { code: "BH", en: "Bahrain", ar: "البحرين", flag: "🇧🇭" },
  { code: "OM", en: "Oman", ar: "عُمان", flag: "🇴🇲" },
  { code: "GB", en: "United Kingdom", ar: "المملكة المتحدة", flag: "🇬🇧" },
  { code: "DE", en: "Germany", ar: "ألمانيا", flag: "🇩🇪" },
  { code: "EG", en: "Egypt", ar: "مصر", flag: "🇪🇬" },
  { code: "US", en: "United States", ar: "الولايات المتحدة", flag: "🇺🇸" },
];

export function currencyFor(countryCode?: string | null) {
  return (countryCode && COUNTRY_CURRENCY[countryCode]) || "USD";
}

/** Format micro-USDC in the user's local currency. */
export function money(micro: bigint | string | number, currency: string, locale: Locale, opts: { compact?: boolean; sign?: boolean } = {}) {
  const usd = Number(BigInt(micro)) / 1e6;
  const local = usd / (USD_PER_UNIT[currency] ?? 1);
  const fmt = new Intl.NumberFormat(locale === "ar" ? "ar-AE-u-nu-latn" : "en-US", {
    style: "currency",
    currency,
    currencyDisplay: "code",
    minimumFractionDigits: opts.compact ? 0 : 2,
    maximumFractionDigits: opts.compact ? 0 : 2,
    signDisplay: opts.sign ? "exceptZero" : "auto",
  });
  return fmt.format(local);
}

/** Format an amount already in the currency's minor units (card transactions). */
export function minor(amountMinor: bigint | string | number, currency: string, locale: Locale) {
  const exp = ["KWD", "BHD", "OMR", "JOD"].includes(currency) ? 3 : 2;
  return new Intl.NumberFormat(locale === "ar" ? "ar-AE-u-nu-latn" : "en-US", {
    style: "currency",
    currency,
    currencyDisplay: "code",
  }).format(Number(BigInt(amountMinor)) / 10 ** exp);
}

export function toMicro(localAmount: number, currency: string): bigint {
  return BigInt(Math.floor(localAmount * (USD_PER_UNIT[currency] ?? 1) * 1e6));
}
