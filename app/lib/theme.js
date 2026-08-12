// app/lib/theme.js — Kimono SEO design tokens (teal, clean, airy)
export const TOK = {
  black: "#0F172A",
  white: "#FFFFFF",
  off: "#F8FAFC",
  offDeep: "#F1F5F9",
  accent: "#0D9488",
  accentHover: "#0F766E",
  accentLight: "#CCFBF1",
  accentDark: "#134E4A",
  muted: "#475569",
  mutedLight: "#94A3B8",
  border: "#E2E8F0",
  borderLight: "#F1F5F9",
  danger: "#DC2626",
  dangerLight: "#FEF2F2",
  success: "#10B981",
  successLight: "#DCFCE7",
  warning: "#CA8A04",
  warningLight: "#FEF9C3",
};

export const FONT =
  "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif";

export const PLAN_COLORS = {
  TRIAL:   { fg: TOK.warning, bg: TOK.warningLight, br: "#FCD34D" },
  STARTER: { fg: "#2563EB",   bg: "#DBEAFE",         br: "#93C5FD" },
  GROWTH:  { fg: TOK.accent,  bg: TOK.accentLight,   br: "#5EEAD4" },
  AGENCY:  { fg: "#7C3AED",   bg: "#EDE9FE",         br: "#C4B5FD" },
  SCALE:   { fg: "#7C3AED",   bg: "#EDE9FE",         br: "#C4B5FD" },
  ADMIN:   { fg: TOK.danger,  bg: TOK.dangerLight,   br: "#FCA5A5" },
};
