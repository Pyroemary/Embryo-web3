import { Text, View, useWindowDimensions } from "react-native";
import Svg, { Circle, Defs, LinearGradient, Line, Rect, Stop } from "react-native-svg";
import { ZODIAC, type ZodiacSign } from "@embryo/roundup";
import { colors, elementPalette, tierStyle } from "@embryo/ui";
import type { Card, Tier } from "../lib/api";

// Simple, original constellation sketches (normalised 0..1 coords) per element.
const CONSTELLATIONS: Record<string, [number, number][]> = {
  fire: [[0.55, 0.2], [0.68, 0.32], [0.62, 0.5], [0.78, 0.62], [0.9, 0.48]],
  earth: [[0.58, 0.25], [0.7, 0.2], [0.82, 0.3], [0.76, 0.5], [0.88, 0.66]],
  air: [[0.56, 0.35], [0.66, 0.22], [0.8, 0.28], [0.72, 0.46], [0.86, 0.56]],
  water: [[0.6, 0.6], [0.66, 0.42], [0.76, 0.3], [0.86, 0.4], [0.9, 0.24]],
};

export function ZodiacCard({ card, sign, tier, name, width }: { card: Card | null; sign: string | null; tier: Tier; name?: string; width?: number }) {
  const { width: screen } = useWindowDimensions();
  const w = width ?? Math.min(screen - 40, 380);
  const h = w / 1.586;
  const z = sign && sign in ZODIAC ? ZODIAC[sign as ZodiacSign] : null;
  const pal = elementPalette[z?.element ?? "earth"];
  const t = tierStyle[tier.toLowerCase() as keyof typeof tierStyle];
  const stars = CONSTELLATIONS[z?.element ?? "earth"];
  const frozen = card?.status === "FROZEN";
  const textColor = z?.element === "earth" || !z ? colors.forest : colors.white;

  return (
    <View style={{ width: w, height: h, borderRadius: 18, overflow: "hidden", borderWidth: tier === "FREE" ? 0 : 1.5, borderColor: t.border, shadowColor: "#000", shadowOpacity: 0.25, shadowRadius: 16, shadowOffset: { width: 0, height: 10 }, elevation: 8 }} testID="zodiac-card">
      <Svg width={w} height={h} style={{ position: "absolute" }}>
        <Defs>
          <LinearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={pal.from} />
            <Stop offset="1" stopColor={pal.to} />
          </LinearGradient>
          <LinearGradient id="sheen" x1="0" y1="0" x2="1" y2="0.4">
            <Stop offset="0" stopColor="#fff" stopOpacity={t.sheen} />
            <Stop offset="0.5" stopColor="#fff" stopOpacity={0} />
          </LinearGradient>
        </Defs>
        <Rect width={w} height={h} fill="url(#bg)" />
        {tier !== "FREE" &&
          stars.slice(1).map(([x, y], i) => (
            <Line key={i} x1={stars[i][0] * w} y1={stars[i][1] * h} x2={x * w} y2={y * h} stroke={pal.glyph} strokeOpacity={0.55} strokeWidth={1} />
          ))}
        {stars.map(([x, y], i) => (
          <Circle key={i} cx={x * w} cy={y * h} r={i === 2 ? 3 : 2} fill={pal.glyph} fillOpacity={tier === "FREE" ? 0.35 : 0.9} />
        ))}
        <Rect width={w} height={h} fill="url(#sheen)" />
        {/* EMV chip */}
        <Rect x={w * 0.07} y={h * 0.36} width={w * 0.12} height={h * 0.17} rx={5} fill="#E8C66A" />
      </Svg>

      <Text style={{ position: "absolute", right: -w * 0.04, top: -h * 0.18, fontSize: h * 1.05, color: pal.glyph, opacity: 0.16 }}>
        {z ? `${z.symbol}︎` : ""}
      </Text>

      <View style={{ flex: 1, padding: w * 0.06, justifyContent: "space-between" }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <Text style={{ color: textColor, fontWeight: "800", fontSize: w * 0.065, letterSpacing: -0.5 }}>embryo</Text>
          <Text style={{ color: textColor, fontWeight: "700", fontSize: w * 0.035, opacity: 0.9 }}>
            {z ? `${z.nameEn} · ${z.nameAr}` : ""}
          </Text>
        </View>
        <View>
          <Text style={{ color: textColor, fontSize: w * 0.052, fontWeight: "600", letterSpacing: 3, writingDirection: "ltr" }}>
            •••• •••• •••• {card?.last4 ?? "0000"}
          </Text>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", marginTop: 6 }}>
            <View>
              <Text style={{ color: textColor, fontSize: w * 0.032, opacity: 0.85, writingDirection: "ltr" }}>
                {card ? `${String(card.expMonth).padStart(2, "0")}/${String(card.expYear).slice(-2)}` : "--/--"}  ·  {t.label.toUpperCase()}
              </Text>
              {name ? <Text style={{ color: textColor, fontSize: w * 0.036, fontWeight: "600" }}>{name}</Text> : null}
            </View>
            <Text style={{ color: textColor, fontSize: w * 0.075, fontWeight: "900", fontStyle: "italic" }}>VISA</Text>
          </View>
        </View>
      </View>

      {frozen && (
        <View style={{ position: "absolute", inset: 0, backgroundColor: "rgba(15,42,38,0.65)", alignItems: "center", justifyContent: "center" }}>
          <Text style={{ color: colors.white, fontSize: 18, fontWeight: "800" }}>❄︎</Text>
        </View>
      )}
    </View>
  );
}
