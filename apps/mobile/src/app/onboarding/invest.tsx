import { useState } from "react";
import { router } from "expo-router";
import { View } from "react-native";
import { Body, Button, Choice, H1, Label, Screen, Segmented } from "../../components/ui";
import type { Risk, Track } from "../../lib/api";
import { useSession } from "../../lib/session";

export default function Invest() {
  const { t, user, updateProfile } = useSession();
  const [track, setTrack] = useState<Track>(user?.track ?? "CONVENTIONAL");
  const [risk, setRisk] = useState<Risk>(user?.riskProfile ?? "BALANCED");
  const [busy, setBusy] = useState(false);

  async function next() {
    setBusy(true);
    try {
      await updateProfile({ track, riskProfile: risk });
      router.push("/onboarding/card");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <H1>{t.investTitle}</H1>
      <Label>{t.trackLabel}</Label>
      <Segmented
        testID="track"
        value={track}
        onChange={setTrack}
        options={[
          { label: t.conventional, value: "CONVENTIONAL" },
          { label: t.sharia, value: "SHARIA" },
        ]}
      />
      {track === "SHARIA" && <Body muted>{t.shariaHint}</Body>}
      <Label>{t.riskLabel}</Label>
      <View style={{ gap: 10 }}>
        {(["CONSERVATIVE", "BALANCED", "AGGRESSIVE"] as Risk[]).map((r) => (
          <Choice key={r} testID={`risk-${r}`} title={t[r.toLowerCase() as "balanced"]} subtitle={t.riskHint[r]} selected={risk === r} onPress={() => setRisk(r)} />
        ))}
      </View>
      <View style={{ flex: 1 }} />
      <Button title={t.continue} onPress={next} loading={busy} testID="invest-continue" />
    </Screen>
  );
}
