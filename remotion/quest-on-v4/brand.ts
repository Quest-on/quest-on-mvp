// Quest-On v4 brand tokens. Pulled from real product (app/globals.css + qstn_logo_svg.svg).
// Cobalt blue replaces the v3 cyan/mint as the dominant accent.

export const QUESTON_BRAND = {
  // Real cobalt primary (--primary in globals.css ≈ #3559C4)
  primary: "#3559C4",
  // Logo gradient stops
  primaryLight: "#57CDFF",
  primaryDeep: "#2F46B9",
  // Slightly desaturated cobalt for ambient glow
  primarySoft: "rgba(53,89,196,0.55)",
  // Text / surface tokens
  ink: "#0F172A",
  inkInverse: "#F8FAFC",
  inkMuted: "#52525B",
  surface: "#FFFFFF",
  surfaceMuted: "#F5F5F5",
  border: "#E5E5E5",
  // Accents (used sparingly inside UI mockups)
  yellow: "#FACC15",
  red: "#DC2626",
  green: "#16A34A",
  // Gradients
  brandGradient: "linear-gradient(135deg, #57CDFF 0%, #2F46B9 100%)",
  brandGradientSoft:
    "linear-gradient(135deg, rgba(87,205,255,0.18) 0%, rgba(47,70,185,0.18) 100%)",
  // Fonts. Pretendard already loaded in remotion. Geist Mono kept as preferred mono fallback.
  fontFamily:
    "'Pretendard Variable', Pretendard, 'Geist', -apple-system, sans-serif",
  fontFamilyMono:
    "'Geist Mono', 'JetBrains Mono', 'SF Mono', Roboto Mono, monospace",
  // Logo
  logoPath: "qstn_logo_svg.svg",
  // Radii
  radiusCard: 14,
  radiusButton: 8,
} as const;

export type QuestOnBrand = typeof QUESTON_BRAND;
