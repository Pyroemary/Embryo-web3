import Svg, { Path, Rect } from "react-native-svg";
import { Text, View } from "react-native";
import { colors } from "@embryo/ui";

/** Embryo mark: a rounded tile with a "+" seed cut from it, plus the wordmark. */
export function Logo({ size = 36, color = colors.lime, wordmark = true, tagline }: { size?: number; color?: string; wordmark?: boolean; tagline?: string }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: size * 0.25 }}>
      <Svg width={size} height={size} viewBox="0 0 40 40">
        <Rect x="0" y="0" width="40" height="40" rx="11" fill={color} />
        <Path d="M17 8h6v9h9v6h-9v9h-6v-9H8v-6h9z" fill={color === colors.forest ? colors.lime : colors.forest} />
      </Svg>
      {wordmark && (
        <View>
          <Text style={{ color, fontSize: size * 0.85, fontWeight: "800", letterSpacing: -1, lineHeight: size * 0.95 }}>embryo</Text>
          {tagline ? <Text style={{ color, fontSize: size * 0.28, fontWeight: "600", marginTop: -2 }}>{tagline}</Text> : null}
        </View>
      )}
    </View>
  );
}
