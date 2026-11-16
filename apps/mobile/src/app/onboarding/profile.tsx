import { useState } from "react";
import { router } from "expo-router";
import { Pressable, Text, TextInput, View } from "react-native";
import { zodiacFromDate, ZODIAC } from "@embryo/roundup";
import { colors, radius } from "@embryo/ui";
import { Body, Button, CardBox, H1, Label, Screen } from "../../components/ui";
import { COUNTRIES } from "../../lib/format";
import { useSession } from "../../lib/session";

const DOB_RE = /^(19|20)\d\d-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

export default function Profile() {
  const { t, locale, user, updateProfile } = useSession();
  const [dob, setDob] = useState(user?.dateOfBirth?.slice(0, 10) ?? "");
  const [country, setCountry] = useState(user?.countryCode ?? "AE");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const valid = DOB_RE.test(dob);
  const sign = valid ? ZODIAC[zodiacFromDate(new Date(`${dob}T00:00:00Z`))] : null;

  async function next() {
    setBusy(true);
    setError(null);
    try {
      const u = await updateProfile({ dateOfBirth: dob, countryCode: country });
      if (u.eligibility && !u.eligibility.onboarding) {
        setError(u.eligibility.reason ?? t.notAvailable);
        return;
      }
      router.push("/onboarding/verify");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <H1>{t.aboutYou}</H1>
      <Label>{t.dobLabel}</Label>
      <TextInput
        testID="dob"
        value={dob}
        onChangeText={setDob}
        placeholder="1994-08-01"
        inputMode="numeric"
        maxLength={10}
        style={{ backgroundColor: colors.white, borderRadius: radius.md, padding: 16, fontSize: 18, borderWidth: 1, borderColor: colors.line, color: colors.ink, textAlign: "left", writingDirection: "ltr" }}
      />
      {sign && (
        <CardBox style={{ flexDirection: "row", alignItems: "center", gap: 16, backgroundColor: colors.forest, borderColor: colors.forest }}>
          <Text style={{ fontSize: 44, color: colors.lime }}>{sign.symbol}{"︎"}</Text>
          <View>
            <Text style={{ color: colors.limeSoft, fontSize: 13 }}>{t.yourSign}</Text>
            <Text style={{ color: colors.lime, fontSize: 22, fontWeight: "800" }} testID="sign-name">
              {locale === "ar" ? sign.nameAr : sign.nameEn}
            </Text>
          </View>
        </CardBox>
      )}
      <Label>{t.countryLabel}</Label>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {COUNTRIES.map((c) => {
          const active = c.code === country;
          return (
            <Pressable key={c.code} testID={`country-${c.code}`} onPress={() => setCountry(c.code)} style={{ paddingVertical: 10, paddingHorizontal: 14, borderRadius: radius.pill, borderWidth: 1.5, borderColor: active ? colors.forest : colors.line, backgroundColor: active ? colors.forest : colors.white }}>
              <Text style={{ color: active ? colors.lime : colors.forest, fontWeight: "600" }}>{c.flag} {locale === "ar" ? c.ar : c.en}</Text>
            </Pressable>
          );
        })}
      </View>
      {error && <Body><Text style={{ color: colors.danger }}>{error}</Text></Body>}
      <View style={{ flex: 1 }} />
      <Button title={t.continue} onPress={next} disabled={!valid} loading={busy} testID="profile-continue" />
    </Screen>
  );
}
