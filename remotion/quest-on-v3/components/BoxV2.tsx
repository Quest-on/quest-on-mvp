import type { CSSProperties, ReactElement } from "react";

export interface BoxV2Props {
  size?: number;
  yawDeg?: number;
  pitchDeg?: number;
  rollDeg?: number;
  // Surface state. "graphite" = closed cinematic cube. "glass" = frost glass.
  surface?: "graphite" | "glass";
  // Internal energy 0..1. Glow + rim slightly stronger when "alive".
  energy?: number;
  // Crystallisation morph 0..1. Used by Cut 11 (graphite -> glass).
  crystallise?: number;
  scale?: number;
  // Whether to render the turbulence noise overlay (perf for multi-cube grids)
  noise?: boolean;
  // Override translateX/Y (scene composition wraps the cube further)
  style?: CSSProperties;
}

// Cinematic graphite cube — radial gradient + rim + corner radius +
// soft shadow. Three faces visible in isometric: front + left + top.
// Renders entirely with CSS 3D transforms. No external assets.
const RADIUS = 14;

const GRAPHITE_FILL =
  "radial-gradient(circle at 30% 30%, #1c2740 0%, #131c30 35%, #0e1828 70%, #050a14 100%)";

// Slightly desaturated cyan/mint edge for the glass form.
const GLASS_FILL =
  "linear-gradient(135deg, rgba(34,211,238,0.08) 0%, rgba(52,211,153,0.06) 100%)";

const TURBULENCE_DATA_URI =
  "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='t'><feTurbulence type='fractalNoise' baseFrequency='2.4' numOctaves='2' seed='5' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0.6  0 0 0 0 0.7  0 0 0 0 0.9  0 0 0 1 0'/></filter><rect width='160' height='160' filter='url(%23t)' opacity='1'/></svg>\")";

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * clamp(t, 0, 1);
}

function faceBackground(
  surface: "graphite" | "glass",
  crystallise: number,
): string {
  if (surface === "glass") return GLASS_FILL;
  if (crystallise <= 0) return GRAPHITE_FILL;
  // Mid-morph: layer glass tint over graphite proportionally.
  const t = clamp(crystallise, 0, 1);
  return `linear-gradient(135deg, rgba(34,211,238,${0.07 * t}) 0%, rgba(52,211,153,${0.05 * t}) 100%), ${GRAPHITE_FILL}`;
}

export function BoxV2({
  size = 480,
  yawDeg = -22,
  pitchDeg = 18,
  rollDeg = 0,
  surface = "graphite",
  energy = 0,
  crystallise = 0,
  scale = 1,
  noise = true,
  style,
}: BoxV2Props): ReactElement {
  const half = size / 2;

  // Rim light intensity grows with energy.
  const rimAlpha = lerp(0.18, 0.42, energy);

  // Morph rim colour towards cyan for glass.
  const rimColour =
    surface === "glass" || crystallise > 0.6
      ? "linear-gradient(120deg, rgba(34,211,238,0.85) 0%, rgba(52,211,153,0.75) 100%)"
      : "linear-gradient(120deg, rgba(180,200,230,0.55) 0%, rgba(120,160,210,0.32) 100%)";

  // Outer ambient glow.
  const glowAlpha = lerp(0.08, 0.32, energy + crystallise);
  const ambient = `0 0 80px -8px rgba(34,211,238,${clamp(glowAlpha, 0, 0.45)}), 0 30px 80px -20px rgba(0,0,0,0.78)`;

  // Inset rim shadow (top-light + bottom shadow occlusion).
  const inset = `inset 0 0 0 1px rgba(255,255,255,${rimAlpha * 0.4}), inset 1px 1px 0 rgba(255,255,255,${rimAlpha * 0.2}), inset -1px -1px 0 rgba(0,0,0,0.6)`;

  // backdrop-filter for glass
  const glassFilter = surface === "glass" ? "blur(8px) saturate(1.4)" : undefined;
  const filterValue = surface === "glass" ? "brightness(1.05)" : "brightness(1.02) contrast(1.05)";

  const faceBase: CSSProperties = {
    position: "absolute",
    width: size,
    height: size,
    borderRadius: RADIUS,
    background: faceBackground(surface, crystallise),
    boxShadow: `${inset}, ${ambient}`,
    backdropFilter: glassFilter,
    WebkitBackdropFilter: glassFilter,
    filter: filterValue,
    overflow: "hidden",
  };

  // Rim stroke as masked div
  const rim: CSSProperties = {
    position: "absolute",
    inset: 0,
    borderRadius: RADIUS,
    pointerEvents: "none",
    background: rimColour,
    WebkitMask:
      "linear-gradient(#000 0 0) content-box exclude, linear-gradient(#000 0 0)",
    mask: "linear-gradient(#000 0 0) content-box exclude, linear-gradient(#000 0 0)",
    padding: 1,
    opacity: 0.85,
  };

  // Subtle internal glow (grows with energy)
  const innerGlow: CSSProperties = {
    position: "absolute",
    inset: "12%",
    borderRadius: RADIUS,
    background:
      surface === "glass"
        ? "radial-gradient(circle at 50% 50%, rgba(34,211,238,0.18) 0%, rgba(34,211,238,0.04) 50%, transparent 75%)"
        : `radial-gradient(circle at 50% 50%, rgba(34,211,238,${0.05 + energy * 0.18}) 0%, transparent 65%)`,
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

  // Each face's transform — isometric exposing front + top + left
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
      {/* Front face */}
      <div
        style={{
          ...faceBase,
          transform: `translateZ(${half}px)`,
        }}
      >
        <div style={innerGlow} />
        <div style={turbulence} />
        <div style={rim} />
      </div>
      {/* Back face — minimal, just for solidity */}
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
      {/* Left face */}
      <div
        style={{
          ...faceBase,
          transform: `translateX(${-half}px) rotateY(-90deg)`,
          filter:
            surface === "glass"
              ? "brightness(0.92)"
              : "brightness(0.78) contrast(1.05)",
        }}
      >
        <div style={turbulence} />
        <div style={rim} />
      </div>
      {/* Right face */}
      <div
        style={{
          ...faceBase,
          transform: `translateX(${half}px) rotateY(90deg)`,
          filter:
            surface === "glass"
              ? "brightness(0.96)"
              : "brightness(0.84) contrast(1.05)",
        }}
      >
        <div style={turbulence} />
        <div style={rim} />
      </div>
      {/* Top face */}
      <div
        style={{
          ...faceBase,
          transform: `translateY(${-half}px) rotateX(90deg)`,
          filter:
            surface === "glass"
              ? "brightness(1.12)"
              : "brightness(1.08) contrast(1.05)",
        }}
      >
        <div style={turbulence} />
        <div style={rim} />
      </div>
      {/* Bottom face */}
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
