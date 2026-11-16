import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { getLocales } from "expo-localization";
import { DemoBackend, HttpBackend, type Backend, type Card, type Entry, type Position, type ProfileInput, type Settings, type Summary, type User } from "./api";
import { applyDirection, dictionaries, isRTL, type Locale, type Strings } from "./i18n";
import { currencyFor } from "./format";

/**
 * Auth integration point. Production: Privy embedded wallets (`@privy-io/expo`) —
 * `getAccessToken()` returns the Privy JWT verified by the API, and the embedded wallet address
 * is linked via PATCH /me. Until the Privy app id is provisioned the app runs in demo mode.
 */
const API_URL = process.env.EXPO_PUBLIC_API_URL;
const DEV_TOKEN = process.env.EXPO_PUBLIC_DEV_TOKEN; // "Dev did:..." against an API with AUTH_DEV_BYPASS

function createBackend(): Backend {
  if (!API_URL) return new DemoBackend();
  return new HttpBackend(API_URL, async () => DEV_TOKEN ?? null);
}

interface SessionState {
  backend: Backend;
  locale: Locale;
  t: Strings;
  rtl: boolean;
  currency: string;
  user: User | null;
  card: Card | null;
  settings: Settings | null;
  entries: Entry[];
  summary: Summary | null;
  position: Position | null;
  ready: boolean;
  setLocale(l: Locale): void;
  refresh(): Promise<void>;
  updateProfile(p: ProfileInput): Promise<User>;
  startKyc(): Promise<void>;
  issueCard(): Promise<Card>;
  toggleFreeze(): Promise<void>;
  updateSettings(s: Partial<Settings>): Promise<Settings>;
  oneTime(micro: bigint): Promise<void>;
  simulatePurchase?: () => Promise<Entry | null>;
  reset(): void;
}

const Ctx = createContext<SessionState | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [backend, setBackend] = useState<Backend>(createBackend);
  const [locale, setLocaleState] = useState<Locale>(() => (getLocales()[0]?.languageCode === "ar" ? "ar" : "en"));
  const [user, setUser] = useState<User | null>(null);
  const [card, setCard] = useState<Card | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [position, setPosition] = useState<Position | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => applyDirection(locale), [locale]);

  const refresh = useCallback(async () => {
    const me = await backend.me();
    setUser(me);
    if (me.kycStatus === "APPROVED") {
      const [cards, s, e, sum, pos] = await Promise.all([backend.cards(), backend.settings(), backend.entries(), backend.summary(), backend.position()]);
      setCard(cards.find((c) => c.status !== "CANCELLED") ?? null);
      setSettings(s);
      setEntries(e);
      setSummary(sum);
      setPosition(pos);
    }
    setReady(true);
  }, [backend]);

  useEffect(() => {
    refresh().catch(() => setReady(true));
  }, [refresh]);

  const value = useMemo<SessionState>(() => {
    const demo = backend instanceof DemoBackend ? backend : null;
    return {
      backend,
      locale,
      t: dictionaries[locale],
      rtl: isRTL(locale),
      currency: currencyFor(user?.countryCode),
      user, card, settings, entries, summary, position, ready,
      setLocale: (l) => {
        setLocaleState(l);
        backend.updateProfile({ locale: l }).catch(() => undefined);
      },
      refresh,
      async updateProfile(p) {
        const u = await backend.updateProfile(p);
        setUser(u);
        return u;
      },
      async startKyc() {
        // Production: launch the Sumsub MobileSDK with this token; the webhook updates status.
        await backend.startKyc();
        await refresh();
      },
      async issueCard() {
        const c = await backend.issueCard();
        setCard(c);
        await refresh();
        return c;
      },
      async toggleFreeze() {
        if (!card) return;
        setCard(await backend.setFrozen(card.id, card.status !== "FROZEN"));
      },
      async updateSettings(s) {
        const next = await backend.updateSettings(s);
        setSettings(next);
        return next;
      },
      async oneTime(micro) {
        await backend.oneTime(micro);
        await refresh();
      },
      simulatePurchase: demo
        ? async () => {
            const e = demo.simulatePurchase();
            await refresh();
            return e;
          }
        : undefined,
      reset() {
        setUser(null);
        setCard(null);
        setEntries([]);
        setSummary(null);
        setPosition(null);
        setBackend(createBackend());
      },
    };
  }, [backend, locale, user, card, settings, entries, summary, position, ready, refresh]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSession() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useSession outside SessionProvider");
  return v;
}
