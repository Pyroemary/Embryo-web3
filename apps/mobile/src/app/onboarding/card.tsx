import { useEffect, useState } from "react";
import { router } from "expo-router";
import { ActivityIndicator, View } from "react-native";
import { colors } from "@embryo/ui";
import { ZodiacCard } from "../../components/ZodiacCard";
import { Body, Button, H1, Screen } from "../../components/ui";
import { useSession } from "../../lib/session";

export default function CardReveal() {
  const { t, user, card, issueCard } = useSession();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!card) issueCard().catch((e) => setError((e as Error).message));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Screen dark>
      <H1 light>{t.cardReady}</H1>
      <Body light>{t.cardReadyBody}</Body>
      <View style={{ alignItems: "center", marginVertical: 24, minHeight: 200, justifyContent: "center" }}>
        {card ? <ZodiacCard card={card} sign={user?.zodiacSign ?? null} tier={user?.tier ?? "FREE"} /> : error ? <Body light>{error}</Body> : <ActivityIndicator color={colors.lime} />}
      </View>
      <View style={{ flex: 1 }} />
      {/* Production: Rain push-provisioning via Apple PassKit / Google Push Provisioning */}
      <Button title={t.addToWallet} variant="ghost" onDark onPress={() => undefined} disabled={!card} />
      <Button title={t.continue} variant="lime" onPress={() => router.replace("/(tabs)")} disabled={!card} testID="card-continue" />
    </Screen>
  );
}
