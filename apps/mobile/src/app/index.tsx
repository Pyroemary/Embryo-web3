import { Redirect } from "expo-router";
import { ActivityIndicator, View } from "react-native";
import { colors } from "@embryo/ui";
import { useSession } from "../lib/session";

/** Routes the user to the first incomplete onboarding step. */
export default function Gate() {
  const { ready, user, card } = useSession();
  if (!ready) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.forest }}>
        <ActivityIndicator color={colors.lime} />
      </View>
    );
  }
  if (!user?.dateOfBirth || !user.countryCode) return <Redirect href="/welcome" />;
  if (user.kycStatus !== "APPROVED") return <Redirect href="/onboarding/verify" />;
  if (!card) return <Redirect href="/onboarding/invest" />;
  return <Redirect href="/(tabs)" />;
}
