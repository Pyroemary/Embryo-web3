import { router } from "expo-router";
import { Pressable, Text, View } from "react-native";
import { colors, radius, type } from "@embryo/ui";
import { Logo } from "../../components/Logo";
import { Body, CardBox, Label, Screen } from "../../components/ui";
import { minor, money } from "../../lib/format";
import { useSession } from "../../lib/session";

function Action({ glyph, label, onPress, testID }: { glyph: string; label: string; onPress: () => void; testID?: string }) {
  return (
    <Pressable onPress={onPress} testID={testID} accessibilityRole="button" style={{ alignItems: "center", gap: 6, flex: 1 }}>
      <View style={{ width: 60, height: 60, borderRadius: 30, backgroundColor: colors.forestInk, alignItems: "center", justifyContent: "center" }}>
        <Text style={{ color: colors.lime, fontSize: 22 }}>{glyph}</Text>
      </View>
      <Text style={{ color: colors.forest, fontWeight: "700" }}>{label}</Text>
    </Pressable>
  );
}

export default function Home() {
  const { t, locale, currency, position, summary, entries, settings, simulatePurchase, backend } = useSession();
  const value = BigInt(position?.valueMicro ?? 0);
  const principal = BigInt(position?.principalMicro ?? 0);
  const gain = value - principal;
  const gainPct = principal > 0n ? Number((gain * 10000n) / principal) / 100 : 0;
  const pending = BigInt(summary?.pendingMicro ?? 0);
  const threshold = 5_000_000n;
  const progress = Math.min(1, Number(pending) / Number(threshold));

  return (
    <Screen>
      <View style={{ backgroundColor: colors.lime, borderRadius: radius.xl, padding: 20, gap: 6, marginHorizontal: -4 }}>
        <Logo size={26} color={colors.forest} />
        <Text style={{ color: colors.forest, fontSize: 18, fontWeight: "700", marginTop: 14 }}>{t.invested}</Text>
        <Text style={[type.display, { color: colors.forest }]} testID="invested-value">{money(value, currency, locale)}</Text>
        <Text style={{ color: colors.forest, fontWeight: "700" }}>
          {gain >= 0n ? "↑" : "↓"} {money(gain, currency, locale, { sign: true })} ({gainPct.toFixed(1)}%) · {t.allTime}
        </Text>
        <Text style={{ color: colors.forest, opacity: 0.75 }}>{t.marketGain}</Text>
      </View>

      <View style={{ flexDirection: "row", marginVertical: 4 }}>
        <Action glyph="↻" label={t.roundUps} onPress={() => router.push("/(tabs)/roundups")} testID="action-roundups" />
        <Action glyph="+" label={t.oneTime} onPress={() => router.push("/one-time")} testID="action-onetime" />
        <Action glyph="↓" label={t.withdraw} onPress={() => undefined} />
      </View>

      <CardBox>
        <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
          <Text style={{ fontWeight: "800", color: colors.forest }}>{money(pending, currency, locale)}</Text>
          <Text style={{ fontWeight: "700", color: colors.forest }}>
            {t.investsAt} {money(threshold, currency, locale)}
          </Text>
        </View>
        <View style={{ height: 14, backgroundColor: colors.line, borderRadius: 7, overflow: "hidden" }}>
          <View style={{ width: `${progress * 100}%`, height: "100%", backgroundColor: colors.forest, borderRadius: 7 }} />
        </View>
        <Text style={{ color: colors.muted, fontSize: 13 }}>{t.pendingLabel} · {t.pendingHint}</Text>
      </CardBox>

      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <Label>{t.recent}</Label>
        {backend.demo && simulatePurchase ? (
          <Pressable onPress={simulatePurchase} testID="simulate" accessibilityRole="button">
            <Text style={{ color: colors.forest, fontWeight: "700" }}>{t.tryPurchase}</Text>
          </Pressable>
        ) : null}
      </View>
      {entries.length === 0 ? <Body muted>{t.noRoundUps}</Body> : null}
      {entries.slice(0, 8).map((e) => (
        <CardBox key={e.id} style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12 }}>
          <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.limeSoft, alignItems: "center", justifyContent: "center" }}>
            <Text style={{ fontSize: 18 }}>{e.source === "card" ? "☕︎" : e.source === "recurring" ? "↺" : "+"}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontWeight: "700", color: colors.ink }}>{e.transaction?.merchantName ?? t.oneTime}</Text>
            {e.transaction ? <Text style={{ color: colors.muted }}>{minor(e.transaction.amountMinor, e.transaction.currency, locale)}</Text> : null}
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Text style={{ fontWeight: "800", color: colors.forest }}>
              {e.localMinor && e.localCurrency ? minor(e.localMinor, e.localCurrency, locale) : money(e.amountMicro, currency, locale)}
            </Text>
            <Text style={{ color: e.status === "INVESTED" ? colors.success : colors.muted, fontSize: 12 }}>
              {e.source === "card" && settings && settings.multiplier > 1 ? `x${settings.multiplier} · ` : ""}{e.status.toLowerCase()}
            </Text>
          </View>
        </CardBox>
      ))}
    </Screen>
  );
}
