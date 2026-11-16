import { useEffect, useState } from "react";
import { Switch, Text, View } from "react-native";
import { colors } from "@embryo/ui";
import { Button, CardBox, H1, Label, Screen, Segmented } from "../../components/ui";
import type { Settings } from "../../lib/api";
import { money, toMicro } from "../../lib/format";
import { useSession } from "../../lib/session";

const MAX_MULT = { FREE: 2, PLUS: 5, ELITE: 10 } as const;

export default function RoundUpsTab() {
  const { t, locale, currency, user, settings, updateSettings } = useSession();
  const [draft, setDraft] = useState<Settings | null>(settings);
  const [status, setStatus] = useState<string | null>(null);
  useEffect(() => setDraft(settings), [settings]);
  if (!draft) return <Screen><H1>{t.tabRoundUps}</H1></Screen>;

  const max = MAX_MULT[user?.tier ?? "FREE"];
  const set = (p: Partial<Settings>) => {
    setDraft({ ...draft, ...p });
    setStatus(null);
  };
  async function save() {
    try {
      await updateSettings(draft!);
      setStatus(t.saved);
    } catch (e) {
      setStatus((e as Error).message);
    }
  }

  return (
    <Screen>
      <H1>{t.tabRoundUps}</H1>
      <CardBox style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <Text style={{ fontWeight: "700", fontSize: 16, color: colors.forest }}>{t.roundUpsOn}</Text>
        <Switch value={draft.enabled} onValueChange={(v) => set({ enabled: v })} trackColor={{ true: colors.forest }} thumbColor={colors.lime} />
      </CardBox>

      <Label>{t.spareChange}</Label>
      <Segmented testID="step" value={draft.spareChangeStep} onChange={(v) => set({ spareChangeStep: v })}
        options={[{ label: t.none, value: null }, { label: `${currency} 1`, value: 1 }, { label: `${currency} 5`, value: 5 }, { label: `${currency} 10`, value: 10 }]} />

      <Label>{t.percent}</Label>
      <Segmented testID="percent" value={draft.percentBps} onChange={(v) => set({ percentBps: v })}
        options={[{ label: t.none, value: null }, { label: "5%", value: 500 }, { label: "10%", value: 1000 }]} />

      <Label>{t.multiplier}</Label>
      <Segmented testID="multiplier" value={draft.multiplier} onChange={(v) => set({ multiplier: v })}
        options={[1, 2, 3, 5, 10].filter((m) => m <= max).map((m) => ({ label: `x${m}`, value: m }))} />
      {max < 10 && <Text style={{ color: colors.muted }}>{t.tierLimit}</Text>}

      <Label>{t.dailyCap}</Label>
      <Segmented testID="cap" value={draft.dailyCapMicro} onChange={(v) => set({ dailyCapMicro: v })}
        options={[50, 200, 500].map((v) => {
          const micro = toMicro(v, currency).toString();
          return { label: money(micro, currency, locale, { compact: true }), value: micro };
        })} />

      <Label>{t.recurring}</Label>
      <Segmented testID="recurring" value={draft.recurringFreq} onChange={(v) => set({ recurringFreq: v, recurringMicro: v ? draft.recurringMicro ?? toMicro(100, currency).toString() : null })}
        options={[{ label: t.none, value: null }, { label: t.daily, value: "daily" }, { label: t.weekly, value: "weekly" }, { label: t.monthly, value: "monthly" }]} />

      <View style={{ height: 8 }} />
      <Button title={t.save} onPress={save} testID="save-settings" />
      {status && <Text style={{ textAlign: "center", color: status === t.saved ? colors.success : colors.danger }}>{status}</Text>}
    </Screen>
  );
}
