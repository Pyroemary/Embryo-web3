import { router } from "expo-router";
import { Text, View } from "react-native";
import { ZODIAC, type ZodiacSign } from "@embryo/roundup";
import { colors } from "@embryo/ui";
import { Button, CardBox, H1, Screen, Segmented } from "../../components/ui";
import { useSession } from "../../lib/session";

function Row({ k, v }: { k: string; v: string }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
      <Text style={{ color: colors.muted }}>{k}</Text>
      <Text style={{ color: colors.ink, fontWeight: "700" }}>{v}</Text>
    </View>
  );
}

export default function ProfileTab() {
  const { t, locale, setLocale, user, backend, reset } = useSession();
  const z = user?.zodiacSign ? ZODIAC[user.zodiacSign as ZodiacSign] : null;
  return (
    <Screen>
      <H1>{t.tabProfile}</H1>
      <Segmented testID="locale" value={locale} onChange={setLocale} options={[{ label: "English", value: "en" }, { label: "العربية", value: "ar" }]} />
      <CardBox>
        {z && <Row k={t.yourSign} v={`${z.symbol}︎ ${locale === "ar" ? z.nameAr : z.nameEn}`} />}
        <Row k={t.kycStatus} v={user?.kycStatus === "APPROVED" ? t.verified : user?.kycStatus ?? "-"} />
        <Row k={t.track} v={user?.track === "SHARIA" ? t.sharia : t.conventional} />
        <Row k={t.risk} v={t[(user?.riskProfile ?? "BALANCED").toLowerCase() as "balanced"]} />
        <Row k={t.tabCard} v={user?.tier ?? "FREE"} />
      </CardBox>
      {backend.demo && <Text style={{ color: colors.muted, textAlign: "center" }}>{t.demoMode}</Text>}
      <Button title={backend.demo ? t.resetDemo : t.signOut} variant="ghost" onPress={() => { reset(); router.replace("/"); }} testID="reset" />
    </Screen>
  );
}
