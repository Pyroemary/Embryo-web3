import { useState } from "react";
import { router } from "expo-router";
import { Text, View } from "react-native";
import { colors } from "@embryo/ui";
import { Body, Button, H1, Screen } from "../../components/ui";
import { useSession } from "../../lib/session";

export default function Verify() {
  const { t, startKyc, user } = useSession();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const approved = user?.kycStatus === "APPROVED";

  async function go() {
    if (approved) return router.push("/onboarding/invest");
    setBusy(true);
    setError(null);
    try {
      await startKyc();
      router.push("/onboarding/invest");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <View style={{ width: 88, height: 88, borderRadius: 44, backgroundColor: colors.forest, alignItems: "center", justifyContent: "center", marginTop: 24 }}>
        <Text style={{ fontSize: 40, color: colors.lime }}>{approved ? "✓" : "🪪"}</Text>
      </View>
      <H1>{approved ? t.verified : t.verifyTitle}</H1>
      <Body muted>{t.verifyBody}</Body>
      {error && <Text style={{ color: colors.danger }}>{error}</Text>}
      <View style={{ flex: 1 }} />
      <Button title={approved ? t.continue : t.startVerification} onPress={go} loading={busy} testID="start-kyc" />
    </Screen>
  );
}
