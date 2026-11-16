import { I18nManager, Platform } from "react-native";

export type Locale = "en" | "ar";

const en = {
  tagline: "your wealth conceived",
  heroTitle: "Your Wealth\nConceived.",
  heroBody: "Every purchase rounds up and grows in a vault you own. Spend with a card written in your stars.",
  getStarted: "Get started",
  continue: "Continue",
  language: "العربية",
  // onboarding
  aboutYou: "About you",
  dobLabel: "Date of birth (YYYY-MM-DD)",
  countryLabel: "Country of residence",
  yourSign: "Your sign",
  notAvailable: "Embryo isn't available in your country yet.",
  verifyTitle: "Verify your identity",
  verifyBody: "We use Sumsub to check your ID and a quick selfie. It takes about 2 minutes and keeps Embryo safe for everyone.",
  startVerification: "Start verification",
  verified: "Verified",
  investTitle: "How should we invest?",
  trackLabel: "Track",
  conventional: "Conventional",
  sharia: "Sharia-compliant",
  shariaHint: "Screened by our Sharia board: sukuk and spot assets only, no interest.",
  riskLabel: "Risk profile",
  conservative: "Conservative",
  balanced: "Balanced",
  aggressive: "Aggressive",
  riskHint: {
    CONSERVATIVE: "Tokenized T-bills / sukuk. Steady, lowest volatility.",
    BALANCED: "Mostly yield, with a slice of BTC & ETH.",
    AGGRESSIVE: "Larger BTC & ETH allocation. Higher swings.",
  },
  cardReady: "Your card is ready",
  cardReadyBody: "A virtual Visa you can add to Apple Pay or Google Pay right now.",
  addToWallet: "Add to Wallet",
  // home
  invested: "Invested",
  allTime: "All time",
  marketGain: "Market gain",
  roundUps: "Round-Ups",
  oneTime: "One-time",
  withdraw: "Withdraw",
  investsAt: "Invests at",
  tryPurchase: "＋ Try a purchase",
  pendingLabel: "Pending round-ups",
  pendingHint: "Invested automatically at $5 or every 24h",
  recent: "Recent round-ups",
  noRoundUps: "Spend with your card and your spare change will appear here.",
  // tabs
  tabHome: "Home",
  tabCard: "Card",
  tabRoundUps: "Round-ups",
  tabProfile: "Profile",
  // card
  freeze: "Freeze card",
  unfreeze: "Unfreeze card",
  frozen: "Frozen",
  tiers: "Card tiers",
  perMonth: "/mo",
  current: "Current",
  upgrade: "Upgrade",
  tierPerks: {
    free: ["Static zodiac card", "Round-ups up to x2", "1% vault fee"],
    plus: ["Animated zodiac card", "Round-ups up to x5", "0.5% cashback to vault", "0.75% FX"],
    elite: ["Constellation drops", "Round-ups up to x10", "1% cashback to vault", "0% FX · priority support"],
  },
  // round-up settings
  roundUpsOn: "Round-ups on",
  spareChange: "Round up to the next",
  percent: "Plus a % of each purchase",
  multiplier: "Multiplier",
  dailyCap: "Daily limit",
  recurring: "Recurring deposit",
  none: "None",
  daily: "Daily",
  weekly: "Weekly",
  monthly: "Monthly",
  save: "Save",
  saved: "Saved",
  tierLimit: "Upgrade your card for higher multipliers",
  // one-time
  oneTimeTitle: "Invest a one-time amount",
  amount: "Amount",
  invest: "Invest",
  // profile
  kycStatus: "Verification",
  track: "Track",
  risk: "Risk",
  signOut: "Sign out",
  demoMode: "Demo mode: data stays on this device",
  resetDemo: "Reset demo",
};

type Dict = typeof en;

const ar: Dict = {
  tagline: "ثروتك تبدأ هنا",
  heroTitle: "ثروتك\nتبدأ هنا.",
  heroBody: "كل عملية شراء تُقرَّب وتنمو في محفظة تملكها. وأنفق ببطاقة مكتوبة في نجومك.",
  getStarted: "ابدأ الآن",
  continue: "متابعة",
  language: "English",
  aboutYou: "عنك",
  dobLabel: "تاريخ الميلاد (YYYY-MM-DD)",
  countryLabel: "بلد الإقامة",
  yourSign: "برجك",
  notAvailable: "إمبريو غير متاح في بلدك بعد.",
  verifyTitle: "تحقق من هويتك",
  verifyBody: "نستخدم Sumsub للتحقق من هويتك وصورة سيلفي سريعة. يستغرق الأمر دقيقتين تقريبًا ويحافظ على أمان الجميع.",
  startVerification: "ابدأ التحقق",
  verified: "تم التحقق",
  investTitle: "كيف نستثمر أموالك؟",
  trackLabel: "المسار",
  conventional: "تقليدي",
  sharia: "متوافق مع الشريعة",
  shariaHint: "تحت إشراف هيئتنا الشرعية: صكوك وأصول فورية فقط، بلا فوائد.",
  riskLabel: "مستوى المخاطرة",
  conservative: "متحفظ",
  balanced: "متوازن",
  aggressive: "جريء",
  riskHint: {
    CONSERVATIVE: "سندات خزينة / صكوك مرمّزة. نمو ثابت وأقل تقلبًا.",
    BALANCED: "عوائد في الغالب مع حصة من البيتكوين والإيثيريوم.",
    AGGRESSIVE: "حصة أكبر من البيتكوين والإيثيريوم. تقلبات أعلى.",
  },
  cardReady: "بطاقتك جاهزة",
  cardReadyBody: "بطاقة فيزا افتراضية يمكنك إضافتها إلى Apple Pay أو Google Pay الآن.",
  addToWallet: "أضف إلى المحفظة",
  invested: "المستثمَر",
  allTime: "منذ البداية",
  marketGain: "ربح السوق",
  roundUps: "التقريب",
  oneTime: "مرة واحدة",
  withdraw: "سحب",
  investsAt: "يُستثمر عند",
  tryPurchase: "＋ جرّب عملية شراء",
  pendingLabel: "مبالغ التقريب المعلّقة",
  pendingHint: "تُستثمر تلقائيًا عند 5$ أو كل 24 ساعة",
  recent: "آخر عمليات التقريب",
  noRoundUps: "أنفق ببطاقتك وستظهر الفكة هنا.",
  tabHome: "الرئيسية",
  tabCard: "البطاقة",
  tabRoundUps: "التقريب",
  tabProfile: "حسابي",
  freeze: "تجميد البطاقة",
  unfreeze: "إلغاء التجميد",
  frozen: "مجمّدة",
  tiers: "فئات البطاقة",
  perMonth: "/شهريًا",
  current: "الحالية",
  upgrade: "ترقية",
  tierPerks: {
    free: ["بطاقة برج ثابتة", "تقريب حتى ×2", "رسوم محفظة 1%"],
    plus: ["بطاقة برج متحركة", "تقريب حتى ×5", "استرداد 0.5% إلى المحفظة", "صرف 0.75%"],
    elite: ["إصدارات الأبراج الشهرية", "تقريب حتى ×10", "استرداد 1% إلى المحفظة", "صرف 0% · دعم أولوية"],
  },
  roundUpsOn: "التقريب مفعّل",
  spareChange: "قرّب إلى أقرب",
  percent: "بالإضافة إلى نسبة من كل عملية",
  multiplier: "المضاعِف",
  dailyCap: "الحد اليومي",
  recurring: "إيداع دوري",
  none: "بدون",
  daily: "يومي",
  weekly: "أسبوعي",
  monthly: "شهري",
  save: "حفظ",
  saved: "تم الحفظ",
  tierLimit: "قم بترقية بطاقتك لمضاعفات أعلى",
  oneTimeTitle: "استثمر مبلغًا لمرة واحدة",
  amount: "المبلغ",
  invest: "استثمر",
  kycStatus: "التحقق",
  track: "المسار",
  risk: "المخاطرة",
  signOut: "تسجيل الخروج",
  demoMode: "وضع تجريبي: تبقى البيانات على هذا الجهاز",
  resetDemo: "إعادة ضبط العرض",
};

export const dictionaries: Record<Locale, Dict> = { en, ar };
export type Strings = Dict;

export function isRTL(locale: Locale) {
  return locale === "ar";
}

/** Apply layout direction. Web flips immediately; native needs an app reload to take effect. */
export function applyDirection(locale: Locale) {
  const rtl = isRTL(locale);
  if (Platform.OS === "web") {
    if (typeof document !== "undefined") {
      document.documentElement.dir = rtl ? "rtl" : "ltr";
      document.documentElement.lang = locale;
    }
    return;
  }
  I18nManager.allowRTL(rtl);
  I18nManager.forceRTL(rtl);
}
