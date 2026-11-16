import { useState } from "react";
import { router } from "expo-router";
import { Text, TextInput } from "react-native";
import { colors, radius } from "@embryo/ui";
import { Button, H1, Label, Screen, Segmented } from "../components/ui";
import { toMicro } from "../lib/format";
import { useSession } from "../lib/session";

export default function OneTime() {
  const { t, currency, oneTime } = useSession();
  const [amount, setAmount] = useState("50");
  const [busy, setBusy] = useState(false);
  const n = Number(amount);
  const valid = Number.isFinite(n) && n > 0 && n <= 100_000;

  async function submit() {
    setBusy(true);
    try {
      await oneTime(toMicro(n, currency));
      router.back();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <H1>{t.oneTimeTitle}</H1>
      <Label>{t.amount} ({currency})</Label>
      <TextInput testID="amount" value={amount} onChangeText={setAmount} inputMode="decimal"
        style={{ backgroundColor: colors.white, borderRadius: radius.md, padding: 18, fontSize: 32, fontWeight: "800", color: colors.forest, borderWidth: 1, borderColor: colors.line, writingDirection: "ltr" }} />
      <Segmented value={amount} onChange={setAmount} options={["50", "100", "500", "1000"].map((v) => ({ label: v, value: v }))} />
      <Text style={{ color: colors.muted }}>USDC · Base</Text>
      <Button title={t.invest} onPress={submit} disabled={!valid} loading={busy} testID="invest-submit" />
    </Screen>
  );
}
