import {
  computeRoundUp, currencyExponent, parseDecimal, zodiacFromDate, type RoundUpSettings as EngineSettings,
} from "@embryo/roundup";

// ---------- wire types (bigints arrive as decimal strings) ----------

export type Tier = "FREE" | "PLUS" | "ELITE";
export type KycStatus = "NOT_STARTED" | "PENDING" | "APPROVED" | "REJECTED" | "BLOCKED";
export type Track = "CONVENTIONAL" | "SHARIA";
export type Risk = "CONSERVATIVE" | "BALANCED" | "AGGRESSIVE";

export interface Eligibility {
  countryCode: string | null;
  onboarding: boolean;
  card: boolean;
  vault: boolean;
  trading: boolean;
  reason?: string;
}

export interface User {
  id: string;
  countryCode: string | null;
  dateOfBirth: string | null;
  zodiacSign: string | null;
  locale: string;
  tier: Tier;
  kycStatus: KycStatus;
  track: Track;
  riskProfile: Risk;
  walletAddress: string | null;
  eligibility?: Eligibility;
}

export interface Card {
  id: string;
  last4: string;
  expMonth: number;
  expYear: number;
  status: "ACTIVE" | "FROZEN" | "CANCELLED";
  design: string;
}

export interface Settings {
  enabled: boolean;
  spareChangeStep: 1 | 5 | 10 | null;
  percentBps: number | null;
  multiplier: number;
  dailyCapMicro: string;
  recurringMicro: string | null;
  recurringFreq: "daily" | "weekly" | "monthly" | null;
}

export interface Entry {
  id: string;
  source: "card" | "recurring" | "manual";
  amountMicro: string;
  localMinor: string | null;
  localCurrency: string | null;
  status: "PENDING" | "SUBMITTED" | "INVESTED" | "REVERSED" | "FAILED";
  createdAt: string;
  transaction?: { merchantName: string; amountMinor: string; currency: string } | null;
}

export interface Summary {
  pendingMicro: string;
  investedPrincipalMicro: string;
  spentTodayMicro: string;
}

export interface Position {
  principalMicro: string;
  valueMicro: string;
}

export type ProfileInput = Partial<Pick<User, "countryCode" | "track" | "riskProfile" | "locale" | "walletAddress">> & {
  dateOfBirth?: string;
};

export interface Backend {
  readonly demo: boolean;
  me(): Promise<User>;
  updateProfile(input: ProfileInput): Promise<User>;
  startKyc(): Promise<{ token: string }>;
  cards(): Promise<Card[]>;
  issueCard(): Promise<Card>;
  setFrozen(cardId: string, frozen: boolean): Promise<Card>;
  settings(): Promise<Settings>;
  updateSettings(input: Partial<Settings>): Promise<Settings>;
  entries(): Promise<Entry[]>;
  summary(): Promise<Summary>;
  position(): Promise<Position>;
  oneTime(amountMicro: bigint): Promise<Entry>;
}

// ---------- real backend ----------

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export class HttpBackend implements Backend {
  readonly demo = false;

  constructor(
    private readonly baseUrl: string,
    private readonly token: () => Promise<string | null>,
  ) {}

  private async req<T>(method: string, path: string, body?: unknown): Promise<T> {
    const token = await this.token();
    const res = await fetch(this.baseUrl + path, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body, (_k, v) => (typeof v === "bigint" ? v.toString() : v)),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new ApiError(res.status, json.message ?? res.statusText);
    return json as T;
  }

  me = () => this.req<User>("GET", "/me");
  updateProfile = (input: ProfileInput) => this.req<User>("PATCH", "/me", input);
  startKyc = () => this.req<{ token: string }>("POST", "/kyc/token");
  cards = () => this.req<Card[]>("GET", "/cards");
  issueCard = () => this.req<Card>("POST", "/cards");
  setFrozen = (id: string, frozen: boolean) => this.req<Card>("POST", `/cards/${id}/${frozen ? "freeze" : "unfreeze"}`);
  settings = () => this.req<Settings>("GET", "/roundups/settings");
  updateSettings = (input: Partial<Settings>) => this.req<Settings>("PUT", "/roundups/settings", input);
  entries = () => this.req<Entry[]>("GET", "/roundups");
  summary = () => this.req<Summary>("GET", "/roundups/summary");
  oneTime = (amountMicro: bigint) => this.req<Entry>("POST", "/roundups/one-time", { amountMicro: amountMicro.toString() });

  async position(): Promise<Position> {
    // On-chain vault value is read by the API in a later milestone; principal is the floor.
    const s = await this.summary();
    return { principalMicro: s.investedPrincipalMicro, valueMicro: s.investedPrincipalMicro };
  }
}

// ---------- demo backend (offline prototype; uses the real round-up engine) ----------

const RATES: Record<string, string> = { USD: "1", AED: "0.272294", SAR: "0.266667", EUR: "1.08", GBP: "1.27" };
const TIER_ENGINE: Record<Tier, EngineSettings["tier"]> = { FREE: "free", PLUS: "plus", ELITE: "elite" };
const DEMO_MERCHANTS = [
  { name: "Attibassi Coffee", amount: 2450n, mcc: "5814" },
  { name: "Carrefour", amount: 18735n, mcc: "5411" },
  { name: "Careem", amount: 3420n, mcc: "4121" },
  { name: "Noon", amount: 12990n, mcc: "5399" },
  { name: "Talabat", amount: 6875n, mcc: "5812" },
  { name: "VOX Cinemas", amount: 9500n, mcc: "7832" },
];

let seq = 0;
const id = (p: string) => `${p}_${Date.now().toString(36)}${(++seq).toString(36)}`;
const later = <T,>(v: T, ms = 250) => new Promise<T>((r) => setTimeout(() => r(structuredClone(v)), ms));

export class DemoBackend implements Backend {
  readonly demo = true;
  private user: User = {
    id: "demo-user",
    countryCode: null,
    dateOfBirth: null,
    zodiacSign: null,
    locale: "en",
    tier: "PLUS",
    kycStatus: "NOT_STARTED",
    track: "CONVENTIONAL",
    riskProfile: "BALANCED",
    walletAddress: "0x7a3b000000000000000000000000000000e1b0",
  };
  private card: Card | null = null;
  private s: Settings = {
    enabled: true, spareChangeStep: 1, percentBps: null, multiplier: 3, dailyCapMicro: "54458800" /* AED 200 */, recurringMicro: null, recurringFreq: null,
  };
  private list: Entry[] = [];
  private investedMicro = 0n;
  private gainBps = 0n;

  private currency() {
    return ({ AE: "AED", SA: "SAR", DE: "EUR", GB: "GBP" } as Record<string, string>)[this.user.countryCode ?? ""] ?? "USD";
  }

  private eligibility() {
    const cc = this.user.countryCode;
    const blocked = cc === "US";
    const noCard = cc === "EG";
    return { countryCode: cc, onboarding: !blocked, card: !blocked && !noCard, vault: !blocked && !noCard, trading: !blocked && !noCard, reason: blocked ? "Not available in the US yet" : noCard ? "Card & vault coming soon in Egypt" : undefined };
  }

  me = () => later({ ...this.user, eligibility: this.eligibility() });

  async updateProfile(input: ProfileInput) {
    Object.assign(this.user, input);
    if (input.dateOfBirth) this.user.zodiacSign = zodiacFromDate(new Date(`${input.dateOfBirth}T00:00:00Z`));
    return this.me();
  }

  async startKyc() {
    this.user.kycStatus = "APPROVED";
    return later({ token: "demo" }, 1200);
  }

  cards = () => later(this.card ? [this.card] : []);

  async issueCard() {
    if (!this.card) {
      this.card = { id: id("card"), last4: "7741", expMonth: 11, expYear: 2030, status: "ACTIVE", design: `${this.user.zodiacSign}-${this.user.tier.toLowerCase()}` };
      this.seed();
    }
    return later(this.card, 900);
  }

  async setFrozen(_id: string, frozen: boolean) {
    if (this.card) this.card.status = frozen ? "FROZEN" : "ACTIVE";
    return later(this.card!);
  }

  settings = () => later(this.s);

  async updateSettings(input: Partial<Settings>) {
    const max = { FREE: 2, PLUS: 5, ELITE: 10 }[this.user.tier];
    if (input.multiplier && input.multiplier > max) throw new ApiError(400, `multiplier exceeds ${this.user.tier} max x${max}`);
    this.s = { ...this.s, ...input };
    return later(this.s);
  }

  entries = () => later([...this.list].sort((a, b) => b.createdAt.localeCompare(a.createdAt)));

  async summary() {
    const pending = this.list.filter((e) => e.status === "PENDING").reduce((s, e) => s + BigInt(e.amountMicro), 0n);
    return later({ pendingMicro: pending.toString(), investedPrincipalMicro: this.investedMicro.toString(), spentTodayMicro: "0" });
  }

  async position() {
    const value = this.investedMicro + (this.investedMicro * this.gainBps) / 10_000n;
    return later({ principalMicro: this.investedMicro.toString(), valueMicro: value.toString() });
  }

  async oneTime(amountMicro: bigint) {
    const e: Entry = { id: id("ru"), source: "manual", amountMicro: amountMicro.toString(), localMinor: null, localCurrency: null, status: "PENDING", createdAt: new Date().toISOString() };
    this.list.push(e);
    this.settleIfDue();
    return later(e);
  }

  /** Prototype-only: simulate a card purchase through the real round-up engine. */
  simulatePurchase(): Entry | null {
    const m = DEMO_MERCHANTS[Math.floor(Math.random() * DEMO_MERCHANTS.length)];
    return this.purchase(m.name, m.amount, m.mcc, new Date());
  }

  private purchase(merchant: string, amountMinor: bigint, mcc: string, at: Date): Entry | null {
    const currency = this.currency();
    const r = computeRoundUp(
      { id: id("tx"), amountMinor, currency, mcc },
      { ...this.s, dailyCapMicro: BigInt(this.s.dailyCapMicro), tier: TIER_ENGINE[this.user.tier] },
      currencyExponent(currency),
      parseDecimal(RATES[currency] ?? "1", 18),
      0n,
    );
    if (r.investMicro === 0n) return null;
    const e: Entry = {
      id: id("ru"), source: "card", amountMicro: r.investMicro.toString(), localMinor: r.totalMinor.toString(), localCurrency: currency,
      status: "PENDING", createdAt: at.toISOString(), transaction: { merchantName: merchant, amountMinor: amountMinor.toString(), currency },
    };
    this.list.push(e);
    this.settleIfDue();
    return e;
  }

  private settleIfDue() {
    const pending = this.list.filter((e) => e.status === "PENDING");
    const total = pending.reduce((s, e) => s + BigInt(e.amountMicro), 0n);
    if (total >= 5_000_000n) {
      pending.forEach((e) => (e.status = "INVESTED"));
      this.investedMicro += total;
    }
  }

  /** Give a fresh demo account some history so the home screen tells the story. */
  private seed() {
    this.investedMicro = 1_361_470_000n; // ≈ AED 5,000
    this.gainBps = 620n; // +6.2% market gain
    const now = Date.now();
    DEMO_MERCHANTS.slice(1).forEach((m, i) => {
      const e = this.purchase(m.name, m.amount, m.mcc, new Date(now - (i + 2) * 3_600_000 * 7));
      if (e) e.status = "INVESTED";
    });
    this.purchase("Attibassi Coffee", 2450n, "5814", new Date(now - 60_000));
  }
}
