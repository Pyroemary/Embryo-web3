/** Embryo brand tokens — shared by mobile (React Native) and admin (web). */
export const colors = {
  forest: "#1E4D45", // primary brand green
  forestDeep: "#163B35",
  forestInk: "#0F2A26",
  lime: "#DDF98A", // brand accent
  limeSoft: "#EEFCC4",
  cream: "#F6FDE6",
  white: "#FFFFFF",
  ink: "#10201D",
  muted: "#5D706B",
  line: "#D9E5D5",
  danger: "#C2412D",
  warning: "#B7791F",
  success: "#2F855A",
} as const;

/** Zodiac element palettes for card art (gradient start → end, glyph colour). */
export const elementPalette = {
  fire: { from: "#FF8A4C", to: "#7A1E12", glyph: "#FFE3B3" },
  earth: { from: "#DDF98A", to: "#1E4D45", glyph: "#1E4D45" },
  air: { from: "#C9E8FF", to: "#3B5B8C", glyph: "#F4FAFF" },
  water: { from: "#7ED6D1", to: "#10394D", glyph: "#E4FFFB" },
} as const;

export const tierStyle = {
  free: { label: "Free", border: "#DDF98A", sheen: 0 },
  plus: { label: "Plus", border: "#FFFFFF", sheen: 0.18 },
  elite: { label: "Elite", border: "#E9D8A6", sheen: 0.32 },
} as const;

export const radius = { sm: 8, md: 14, lg: 22, xl: 32, pill: 999 } as const;
export const space = (n: number) => n * 4;

export const type = {
  display: { fontSize: 40, fontWeight: "800" as const, letterSpacing: -1 },
  h1: { fontSize: 28, fontWeight: "800" as const, letterSpacing: -0.5 },
  h2: { fontSize: 20, fontWeight: "700" as const },
  body: { fontSize: 16, fontWeight: "400" as const },
  small: { fontSize: 13, fontWeight: "500" as const },
  mono: { fontSize: 16, fontWeight: "600" as const, letterSpacing: 2 },
};
