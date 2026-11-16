import type { ReactNode } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View, type ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, radius, type } from "@embryo/ui";

export function Screen({ children, dark, scroll = true, style }: { children: ReactNode; dark?: boolean; scroll?: boolean; style?: ViewStyle }) {
  const insets = useSafeAreaInsets();
  const bg = dark ? colors.forest : colors.cream;
  const inner = <View style={[{ padding: 20, paddingTop: insets.top + 16, paddingBottom: insets.bottom + 24, gap: 16, width: "100%", maxWidth: 520, alignSelf: "center" }, style]}>{children}</View>;
  return scroll ? (
    <ScrollView style={{ flex: 1, backgroundColor: bg }} contentContainerStyle={{ flexGrow: 1 }}>{inner}</ScrollView>
  ) : (
    <View style={{ flex: 1, backgroundColor: bg }}>{inner}</View>
  );
}

export function H1({ children, light }: { children: ReactNode; light?: boolean }) {
  return <Text style={[type.h1, { color: light ? colors.lime : colors.forest }]}>{children}</Text>;
}

export function Body({ children, light, muted }: { children: ReactNode; light?: boolean; muted?: boolean }) {
  return <Text style={[type.body, { color: light ? colors.limeSoft : muted ? colors.muted : colors.ink, lineHeight: 23 }]}>{children}</Text>;
}

export function Label({ children }: { children: ReactNode }) {
  return <Text style={[type.small, { color: colors.muted, textTransform: "uppercase", letterSpacing: 0.6 }]}>{children}</Text>;
}

export function Button({ title, onPress, variant = "primary", loading, disabled, testID, onDark }: { title: string; onPress: () => void; variant?: "primary" | "lime" | "ghost"; loading?: boolean; disabled?: boolean; testID?: string; onDark?: boolean }) {
  const bg = variant === "primary" ? colors.forest : variant === "lime" ? colors.lime : "transparent";
  const fg = variant === "primary" ? colors.lime : variant === "ghost" && onDark ? colors.lime : colors.forest;
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => ({
        backgroundColor: bg,
        borderRadius: radius.pill,
        paddingVertical: 16,
        paddingHorizontal: 24,
        alignItems: "center",
        opacity: disabled ? 0.45 : pressed ? 0.85 : 1,
        borderWidth: variant === "ghost" ? 1.5 : 0,
        borderColor: fg,
      })}
    >
      {loading ? <ActivityIndicator color={fg} /> : <Text style={{ color: fg, fontWeight: "800", fontSize: 16 }}>{title}</Text>}
    </Pressable>
  );
}

export function Segmented<T extends string | number | null>({ options, value, onChange, testID }: { options: { label: string; value: T }[]; value: T; onChange: (v: T) => void; testID?: string }) {
  return (
    <View testID={testID} style={{ flexDirection: "row", backgroundColor: colors.limeSoft, borderRadius: radius.pill, padding: 4, gap: 4 }}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable key={String(o.value)} onPress={() => onChange(o.value)} accessibilityRole="button" accessibilityState={{ selected: active }} style={{ flex: 1, paddingVertical: 10, borderRadius: radius.pill, backgroundColor: active ? colors.forest : "transparent", alignItems: "center" }}>
            <Text style={{ color: active ? colors.lime : colors.forest, fontWeight: "700", fontSize: 14 }}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function CardBox({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  return <View style={[{ backgroundColor: colors.white, borderRadius: radius.lg, padding: 16, gap: 12, borderWidth: 1, borderColor: colors.line }, style]}>{children}</View>;
}

export function Choice({ title, subtitle, selected, onPress, testID }: { title: string; subtitle?: string; selected: boolean; onPress: () => void; testID?: string }) {
  return (
    <Pressable testID={testID} onPress={onPress} accessibilityRole="radio" accessibilityState={{ checked: selected }} style={{ borderRadius: radius.md, padding: 16, borderWidth: 2, borderColor: selected ? colors.forest : colors.line, backgroundColor: selected ? colors.limeSoft : colors.white, gap: 4 }}>
      <Text style={{ fontWeight: "800", fontSize: 16, color: colors.forest }}>{title}</Text>
      {subtitle ? <Text style={{ color: colors.muted, fontSize: 14, lineHeight: 20 }}>{subtitle}</Text> : null}
    </Pressable>
  );
}
