import { router } from "expo-router";
import { Pressable, Text, View } from "react-native";
import { colors, type } from "@embryo/ui";
import { Logo } from "../components/Logo";
import { ZodiacCard } from "../components/ZodiacCard";
import { Body, Button, Screen } from "../components/ui";
import { useSession } from "../lib/session";

export default function Welcome() {
  const { t, locale, setLocale } = useSession();
  return (
    <Screen dark>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <Logo tagline={t.tagline} />
        <Pressable onPress={() => setLocale(locale === "en" ? "ar" : "en")} testID="lang-toggle" accessibilityRole="button">
          <Text style={{ color: colors.lime, fontWeight: "700", fontSize: 15 }}>{t.language}</Text>
        </Pressable>
      </View>
      <View style={{ alignItems: "center", marginVertical: 28, transform: [{ rotate: "-6deg" }] }}>
        <ZodiacCard card={null} sign="leo" tier="ELITE" width={300} />
      </View>
      <Text style={[type.display, { color: colors.lime, lineHeight: 46 }]}>{t.heroTitle}</Text>
      <Body light>{t.heroBody}</Body>
      <View style={{ flex: 1 }} />
      <Button title={t.getStarted} variant="lime" onPress={() => router.push("/onboarding/profile")} testID="get-started" />
    </Screen>
  );
}
