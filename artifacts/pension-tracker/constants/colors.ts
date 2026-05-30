export type ColorTokens = {
  text: string;
  tint: string;
  background: string;
  foreground: string;
  card: string;
  cardForeground: string;
  primary: string;
  primaryForeground: string;
  secondary: string;
  secondaryForeground: string;
  muted: string;
  mutedForeground: string;
  accent: string;
  accentForeground: string;
  destructive: string;
  destructiveForeground: string;
  border: string;
  input: string;
  positive: string;
  negative: string;
  positiveBg: string;
  negativeBg: string;
  chartLine: string;
  chartFill: string;
  chartDot: string;
};

export type Theme = {
  id: string;
  name: string;
  light: ColorTokens;
  dark: ColorTokens;
};

const LIGHT_BASE = {
  background: "#F4F6FA",
  foreground: "#0D1B2A",
  card: "#FFFFFF",
  cardForeground: "#0D1B2A",
  primaryForeground: "#FFFFFF",
  accentForeground: "#FFFFFF",
  secondary: "#EEF2F8",
  muted: "#EEF2F8",
  mutedForeground: "#6B7A8D",
  border: "#E2E8F2",
  input: "#E2E8F2",
  destructive: "#EF4444",
  destructiveForeground: "#FFFFFF",
  positive: "#16A34A",
  negative: "#DC2626",
  positiveBg: "#DCFCE7",
  negativeBg: "#FEE2E2",
};

const DARK_BASE = {
  background: "#0F1117",
  foreground: "#E8ECF4",
  card: "#1A1F2E",
  cardForeground: "#E8ECF4",
  primaryForeground: "#FFFFFF",
  accentForeground: "#FFFFFF",
  secondary: "#252D3D",
  muted: "#252D3D",
  mutedForeground: "#6B7A99",
  border: "#2A3347",
  input: "#2A3347",
  destructive: "#F87171",
  destructiveForeground: "#FFFFFF",
  positive: "#22C55E",
  negative: "#F87171",
  positiveBg: "#14532D",
  negativeBg: "#450A0A",
};

function makeLight(primary: string, accent: string): ColorTokens {
  return {
    ...LIGHT_BASE,
    text: LIGHT_BASE.foreground,
    tint: primary,
    primary,
    accent,
    secondaryForeground: primary,
    chartLine: primary,
    chartFill: primary,
    chartDot: accent,
  };
}

function makeDark(primary: string, accent: string): ColorTokens {
  return {
    ...DARK_BASE,
    text: DARK_BASE.foreground,
    tint: primary,
    primary,
    accent,
    secondaryForeground: primary,
    chartLine: primary,
    chartFill: primary,
    chartDot: accent,
  };
}

export const themes: Theme[] = [
  {
    id: "navy",
    name: "Navy & Gold",
    light: makeLight("#1A3560", "#C9A84C"),
    dark: makeDark("#4D7CC7", "#E2BC6B"),
  },
  {
    id: "forest",
    name: "Forest",
    light: makeLight("#1A5C3A", "#3D9A55"),
    dark: makeDark("#2ECC7A", "#86EFAC"),
  },
  {
    id: "slate",
    name: "Slate",
    light: makeLight("#334155", "#64748B"),
    dark: makeDark("#7B90B0", "#A8B9CF"),
  },
  {
    id: "rose",
    name: "Rose",
    light: makeLight("#9F1239", "#E11D48"),
    dark: makeDark("#FB7185", "#FDA4AF"),
  },
  {
    id: "violet",
    name: "Violet",
    light: makeLight("#5B21B6", "#7C3AED"),
    dark: makeDark("#A78BFA", "#C4B5FD"),
  },
  // — Fun & colourful —
  {
    id: "coral",
    name: "Coral",
    light: makeLight("#E84545", "#FF9F43"),
    dark: makeDark("#FF7676", "#FFBE76"),
  },
  {
    id: "teal",
    name: "Teal",
    light: makeLight("#00897B", "#00C9B1"),
    dark: makeDark("#26C6B8", "#64FFDA"),
  },
  {
    id: "sunset",
    name: "Sunset",
    light: makeLight("#D35400", "#F1C40F"),
    dark: makeDark("#F0935A", "#F5D76E"),
  },
  {
    id: "berry",
    name: "Berry",
    light: makeLight("#C2185B", "#9C27B0"),
    dark: makeDark("#F06292", "#CE93D8"),
  },
  {
    id: "ocean",
    name: "Ocean",
    light: makeLight("#0277BD", "#00BCD4"),
    dark: makeDark("#4FC3F7", "#4DD0E1"),
  },
];

export const defaultThemeId = "navy";
export const radius = 14;

// Legacy default export (light navy palette + radius) for backward compat
const colors = {
  light: themes[0].light,
  radius,
};

export default colors;
