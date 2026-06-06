import type { CSSProperties, ReactElement } from "react";
import { QUESTON_BRAND } from "../brand";

export interface BoxV4Props {
  size?: number;
  yawDeg?: number;
  pitchDeg?: number;
  rollDeg?: number;
  // Surface state. graphite = closed, glass = frost, blueprint = light wireframe.
  surface?: "graphite" | "glass" | "blueprint";
  // Internal energy 0..1
  energy?: number;
  // Crystallise morph 0..1 (graphite -> glass).
  crystallise?: number;
  scale?: number;
  noise?: boolean;
  // Front-face content slot. Used by surface-morph for student exam UI.
  frontFace?: ReactElement;
  // Iridescent thin-film overlay opacity 0..1 (V6 peak — keep ≤1.5s).
  iridescent?: number;
  // v7: when true, graphite mode renders as a sealed opaque black monolith
  // (no inner gradient lift, stronger rim shadow). Reinforces the "blackbox"
  // beat in cuts 7-8. Has no effect on glass / blueprint surfaces.
  opaqueBlack?: boolean;
  style?: CSSProperties;
}

const RADIUS = 14;

// Cobalt-tinted graphite (still mostly black, with #2F46B9 deep tone instead of cyan).
const GRAPHITE_FILL =
  "radial-gradient(circle at 30% 28%, #1a2342 0%, #131a30 35%, #0c1224 70%, #050811 100%)";

// Sealed opaque black — virtually no gradient lift, only the faintest rim hint.
// Used by v7 when the storyboard needs a true "blackbox" silhouette. iter 14:
// pushed darker (top stop #07090F → #05060B → #01020A) so the monolith reads
// as the heaviest, most opaque object in the film.
const OPAQUE_BLACK_FILL =
  "radial-gradient(circle at 30% 26%, #07090F 0%, #05060B 55%, #01020A 100%)";

// Cobalt-tinted glass (sky -> deep cobalt).
const GLASS_FILL =
  "linear-gradient(135deg, rgba(87,205,255,0.10) 0%, rgba(47,70,185,0.10) 100%)";

// Blueprint: very pale cobalt grid wash.
const BLUEPRINT_FILL =
  "linear-gradient(135deg, rgba(87,205,255,0.04) 0%, rgba(53,89,196,0.06) 100%)";

const TURBULENCE_DATA_URI =
  "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='t'><feTurbulence type='fractalNoise' baseFrequency='2.4' numOctaves='2' seed='5' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0.6  0 0 0 0 0.7  0 0 0 0 0.9  0 0 0 1 0'/></filter><rect width='160' height='160' filter='url(%23t)' opacity='1'/></svg>\")";

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * clamp(t, 0, 1);
}

function faceBackground(
  surface: "graphite" | "glass" | "blueprint",
  crystallise: number,
  opaqueBlack: boolean,
): string {
  if (surface === "glass") return GLASS_FILL;
  if (surface === "blueprint") return BLUEPRINT_FILL;
  const baseFill = opaqueBlack ? OPAQUE_BLACK_FILL : GRAPHITE_FILL;
  if (crystallise <= 0) return baseFill;
  const t = clamp(crystallise, 0, 1);
  return `linear-gradient(135deg, rgba(87,205,255,${0.07 * t}) 0%, rgba(47,70,185,${0.07 * t}) 100%), ${baseFill}`;
}

export function BoxV4({
  size = 480,
  yawDeg = -22,
  pitchDeg = 18,
  rollDeg = 0,
  surface = "graphite",
  energy = 0,
  crystallise = 0,
  scale = 1,
  noise = true,
  frontFace,
  iridescent = 0,
  opaqueBlack = false,
  style,
}: BoxV4Props): ReactElement {
  const half = size / 2;

  const rimAlpha = opaqueBlack
    ? lerp(0.10, 0.18, energy)
    : lerp(0.18, 0.42, energy);

  const rimColour =
    surface === "glass" || crystallise > 0.6
      ? `linear-gradient(120deg, ${QUESTON_BRAND.primaryLight} 0%, ${QUESTON_BRAND.primaryDeep} 100%)`
      : surface === "blueprint"
        ? `linear-gradient(120deg, ${QUESTON_BRAND.primaryLight} 0%, ${QUESTON_BRAND.primary} 100%)`
        : opaqueBlack
          ? "linear-gradient(120deg, rgba(120,140,180,0.32) 0%, rgba(70,90,140,0.18) 100%)"
          : "linear-gradient(120deg, rgba(180,200,230,0.55) 0%, rgba(120,160,210,0.32) 100%)";

  const glowAlpha = opaqueBlack
    ? clamp(energy * 0.05, 0, 0.05)
    : lerp(0.08, 0.32, energy + crystallise);
  const ambient = opaqueBlack
    ? `0 0 60px -10px rgba(0,0,0,0.95), 0 40px 100px -20px rgba(0,0,0,0.95)`
    : `0 0 80px -8px rgba(53,89,196,${clamp(glowAlpha, 0, 0.45)}), 0 30px 80px -20px rgba(0,0,0,0.78)`;

  const inset = opaqueBlack
    ? `inset 0 0 0 1px rgba(120,140,180,0.10), inset 0 0 80px rgba(0,0,0,0.95), inset 1px 1px 0 rgba(180,200,230,0.08)`
    : `inset 0 0 0 1px rgba(255,255,255,${rimAlpha * 0.4}), inset 1px 1px 0 rgba(255,255,255,${rimAlpha * 0.2}), inset -1px -1px 0 rgba(0,0,0,0.6)`;

  const glassFilter = surface === "glass" ? "blur(8px) saturate(1.4)" : undefined;
  const filterValue =
    surface === "glass"
      ? "brightness(1.05)"
      : surface === "blueprint"
        ? "brightness(1.1) contrast(0.92)"
        : "brightness(1.02) contrast(1.05)";

  const faceBase: CSSProperties = {
    position: "absolute",
    width: size,
    height: size,
    borderRadius: RADIUS,
    background: faceBackground(surface, crystallise, opaqueBlack),
    boxShadow: `${inset}, ${ambient}`,
    backdropFilter: glassFilter,
    WebkitBackdropFilter: glassFilter,
    filter: filterValue,
    overflow: "hidden",
  };

  const rim: CSSProperties = {
    position: "absolute",
    inset: 0,
    borderRadius: RADIUS,
    pointerEvents: "none",
    background: rimColour,
    WebkitMask:
      "linear-gradient(#000 0 0) content-box exclude, linear-gradient(#000 0 0)",
    mask: "linear-gradient(#000 0 0) content-box exclude, linear-gradient(#000 0 0)",
    padding: surface === "blueprint" ? 1.5 : 1,
    opacity: 0.85,
  };

  const innerGlow: CSSProperties = opaqueBlack
    ? { display: "none" }
    : {
        position: "absolute",
        inset: "12%",
        borderRadius: RADIUS,
        background:
          surface === "glass"
            ? `radial-gradient(circle at 50% 50%, rgba(87,205,255,0.18) 0%, rgba(47,70,185,0.06) 50%, transparent 75%)`
            : `radial-gradient(circle at 50% 50%, rgba(53,89,196,${0.05 + energy * 0.18}) 0%, transparent 65%)`,
        pointerEvents: "none",
        opacity: lerp(0.4, 1, energy + crystallise),
        filter: "blur(18px)",
      };

  const turbulence: CSSProperties = noise
    ? {
        position: "absolute",
        inset: 0,
        borderRadius: RADIUS,
        backgroundImage: TURBULENCE_DATA_URI,
        backgroundSize: "160px 160px",
        opacity: 0.045,
        mixBlendMode: "overlay",
        pointerEvents: "none",
      }
    : { display: "none" };

  // Iridescent thin-film overlay — conic gradient + screen blend (V6).
  const iridescentOverlay: CSSProperties =
    iridescent > 0
      ? {
          position: "absolute",
          inset: 0,
          borderRadius: RADIUS,
          background:
            "conic-gradient(from 220deg at 50% 50%, rgba(87,205,255,0.55), rgba(167,139,250,0.55), rgba(52,211,153,0.5), rgba(250,204,21,0.45), rgba(87,205,255,0.55))",
          mixBlendMode: "screen",
          opacity: clamp(iridescent, 0, 1) * 0.7,
          pointerEvents: "none",
          filter: "blur(2px)",
        }
      : { display: "none" };

  return (
    <div
      style={{
        position: "absolute",
        left: "50%",
        top: "50%",
        width: size,
        height: size,
        marginLeft: -half,
        marginTop: -half,
        transformStyle: "preserve-3d",
        transform: `scale(${scale}) rotateX(${pitchDeg}deg) rotateY(${yawDeg}deg) rotateZ(${rollDeg}deg)`,
        ...style,
      }}
    >
      {/* Front face — supports embedded React content */}
      <div
        style={{
          ...faceBase,
          transform: `translateZ(${half}px)`,
        }}
      >
        <div style={innerGlow} />
        <div style={turbulence} />
        {frontFace ? (
          <div
            style={{
              position: "absolute",
              inset: 0,
              borderRadius: RADIUS,
              overflow: "hidden",
            }}
          >
            {frontFace}
          </div>
        ) : null}
        <div style={iridescentOverlay} />
        <div style={rim} />
      </div>
      {/* Back face */}
      <div
        style={{
          ...faceBase,
          background: "#020308",
          transform: `translateZ(${-half}px) rotateY(180deg)`,
          opacity: 0.9,
          backdropFilter: undefined,
          WebkitBackdropFilter: undefined,
          filter: undefined,
        }}
      />
      {/* Left */}
      <div
        style={{
          ...faceBase,
          transform: `translateX(${-half}px) rotateY(-90deg)`,
          filter:
            surface === "glass"
              ? "brightness(0.92)"
              : surface === "blueprint"
                ? "brightness(0.94) contrast(0.95)"
                : "brightness(0.78) contrast(1.05)",
        }}
      >
        <div style={turbulence} />
        <div style={iridescentOverlay} />
        <div style={rim} />
      </div>
      {/* Right */}
      <div
        style={{
          ...faceBase,
          transform: `translateX(${half}px) rotateY(90deg)`,
          filter:
            surface === "glass"
              ? "brightness(0.96)"
              : surface === "blueprint"
                ? "brightness(0.98) contrast(0.95)"
                : "brightness(0.84) contrast(1.05)",
        }}
      >
        <div style={turbulence} />
        <div style={iridescentOverlay} />
        <div style={rim} />
      </div>
      {/* Top */}
      <div
        style={{
          ...faceBase,
          transform: `translateY(${-half}px) rotateX(90deg)`,
          filter:
            surface === "glass"
              ? "brightness(1.12)"
              : surface === "blueprint"
                ? "brightness(1.16)"
                : "brightness(1.08) contrast(1.05)",
        }}
      >
        <div style={turbulence} />
        <div style={iridescentOverlay} />
        <div style={rim} />
      </div>
      {/* Bottom */}
      <div
        style={{
          ...faceBase,
          transform: `translateY(${half}px) rotateX(-90deg)`,
          background: "#020308",
          filter: "brightness(0.6)",
          backdropFilter: undefined,
          WebkitBackdropFilter: undefined,
        }}
      />
    </div>
  );
}
