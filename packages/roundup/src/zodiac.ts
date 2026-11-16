export type ZodiacSign =
  | "aries" | "taurus" | "gemini" | "cancer" | "leo" | "virgo"
  | "libra" | "scorpio" | "sagittarius" | "capricorn" | "aquarius" | "pisces";

export type Element = "fire" | "earth" | "air" | "water";

export interface ZodiacInfo {
  sign: ZodiacSign;
  element: Element;
  symbol: string;
  nameAr: string;
  nameEn: string;
}

// [sign, startMonth, startDay] in order; a sign runs until the next one starts.
const TABLE: [ZodiacSign, number, number][] = [
  ["capricorn", 1, 1], ["aquarius", 1, 20], ["pisces", 2, 19], ["aries", 3, 21],
  ["taurus", 4, 20], ["gemini", 5, 21], ["cancer", 6, 21], ["leo", 7, 23],
  ["virgo", 8, 23], ["libra", 9, 23], ["scorpio", 10, 23], ["sagittarius", 11, 22],
  ["capricorn", 12, 22],
];

export const ZODIAC: Record<ZodiacSign, ZodiacInfo> = {
  aries: { sign: "aries", element: "fire", symbol: "♈", nameEn: "Aries", nameAr: "الحمل" },
  taurus: { sign: "taurus", element: "earth", symbol: "♉", nameEn: "Taurus", nameAr: "الثور" },
  gemini: { sign: "gemini", element: "air", symbol: "♊", nameEn: "Gemini", nameAr: "الجوزاء" },
  cancer: { sign: "cancer", element: "water", symbol: "♋", nameEn: "Cancer", nameAr: "السرطان" },
  leo: { sign: "leo", element: "fire", symbol: "♌", nameEn: "Leo", nameAr: "الأسد" },
  virgo: { sign: "virgo", element: "earth", symbol: "♍", nameEn: "Virgo", nameAr: "العذراء" },
  libra: { sign: "libra", element: "air", symbol: "♎", nameEn: "Libra", nameAr: "الميزان" },
  scorpio: { sign: "scorpio", element: "water", symbol: "♏", nameEn: "Scorpio", nameAr: "العقرب" },
  sagittarius: { sign: "sagittarius", element: "fire", symbol: "♐", nameEn: "Sagittarius", nameAr: "القوس" },
  capricorn: { sign: "capricorn", element: "earth", symbol: "♑", nameEn: "Capricorn", nameAr: "الجدي" },
  aquarius: { sign: "aquarius", element: "air", symbol: "♒", nameEn: "Aquarius", nameAr: "الدلو" },
  pisces: { sign: "pisces", element: "water", symbol: "♓", nameEn: "Pisces", nameAr: "الحوت" },
};

/** Western tropical zodiac sign for a date of birth (uses UTC month/day). */
export function zodiacFromDate(dob: Date): ZodiacSign {
  const m = dob.getUTCMonth() + 1;
  const d = dob.getUTCDate();
  let result: ZodiacSign = "capricorn";
  for (const [sign, sm, sd] of TABLE) {
    if (m > sm || (m === sm && d >= sd)) result = sign;
  }
  return result;
}
