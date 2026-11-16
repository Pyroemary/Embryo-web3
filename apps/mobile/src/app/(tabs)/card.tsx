import { Text, View } from "react-native";
import { colors } from "@embryo/ui";
import { ZodiacCard } from "../../components/ZodiacCard";
import { Button, CardBox, H1, Label, Screen } from "../../components/ui";
import type { Tier } from "../../lib/api";
import { useSession } from "../../lib/session";

const PRICES: Record<Tier, string> = { FREE: "$0", PLUS: "$4", ELITE: "$13" };

export default function CardTab() {
  const { t, user, card, toggleFreeze } = useSession();
  const tier = user?.tier ?? "FREE";
  return (
    <Screen>
      <H1>{t.tabCard}</H1>
      <View style={{ alignItems: "center" }}>
        <ZodiacCard card={card} sign={user?.zodiacSign ?? null} tier={tier} />
      </View>
      <Button title={card?.status === "FROZEN" ? t.unfreeze : t.freeze} variant="ghost" onPress={toggleFreeze} testID="freeze" />
      <Label>{t.tiers}</Label>
      {(["FREE", "PLUS", "ELITE"] as Tier[]).map((k) => (
        <CardBox key={k} style={k === tier ? { borderColor: colors.forest, borderWidth: 2 } : undefined}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <Text style={{ fontSize: 18, fontWeight: "800", color: colors.forest }}>
              {k[0] + k.slice(1).toLowerCase()} <Text style={{ fontWeight: "500", color: colors.muted }}>{PRICES[k]}{t.perMonth}</Text>
            </Text>
            <Text style={{ color: k === tier ? colors.success : colors.forest, fontWeight: "700" }}>{k === tier ? t.current : t.upgrade}</Text>
          </View>
          {t.tierPerks[k.toLowerCase() as "free"].map((p) => (
            <Text key={p} style={{ color: colors.ink }}>✓ {p}</Text>
          ))}
        </CardBox>
      ))}
    </Screen>
  );
}
