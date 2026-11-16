import { Tabs } from "expo-router/tabs";
import { Text, type ColorValue } from "react-native";
import { colors } from "@embryo/ui";
import { useSession } from "../../lib/session";

const icon = (glyph: string) => ({ color }: { color: ColorValue }) => <Text style={{ color, fontSize: 18 }}>{glyph}</Text>;

export default function TabsLayout() {
  const { t } = useSession();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.forest,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: { backgroundColor: colors.white, borderTopColor: colors.line, minHeight: 64, paddingTop: 6, paddingBottom: 8 },
        tabBarLabelStyle: { fontWeight: "700", fontSize: 11, lineHeight: 16 },
      }}
    >
      <Tabs.Screen name="index" options={{ title: t.tabHome, tabBarIcon: icon("◉") }} />
      <Tabs.Screen name="card" options={{ title: t.tabCard, tabBarIcon: icon("▭") }} />
      <Tabs.Screen name="roundups" options={{ title: t.tabRoundUps, tabBarIcon: icon("↻") }} />
      <Tabs.Screen name="profile" options={{ title: t.tabProfile, tabBarIcon: icon("☺") }} />
    </Tabs>
  );
}
