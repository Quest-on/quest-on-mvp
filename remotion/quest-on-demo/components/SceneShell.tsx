import type { ReactElement, ReactNode } from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { COLORS, TYPO } from "../constants";
import { AnimatedGrid } from "./AnimatedGrid";
import { GradientMesh } from "./GradientMesh";

export interface SceneShellProps {
  children: ReactNode;
  variant?: "dark" | "light";
  showProgress?: boolean;
  tone?: "cool" | "warm";
}

// Off-center cinematic lighting — top-left key light + bottom-right rim light.
// Base is near-black navy to break the "Linux wallpaper" feel.
const DARK_BG =
  "radial-gradient(ellipse 60% 50% at 12% 8%, rgba(59,130,246,0.22), transparent 70%), radial-gradient(ellipse 50% 40% at 92% 96%, rgba(167,139,250,0.16), transparent 70%), linear-gradient(160deg, #03060f 0%, #060c1c 50%, #050a18 100%)";

// Static noise grain — breaks gradient uniformity, adds film texture.
const GRAIN_SVG =
  "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='240' height='240'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' seed='3' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 1 0'/></filter><rect width='240' height='240' filter='url(%23n)' opacity='1'/></svg>\")";

const LIGHT_BG =
  "radial-gradient(circle at 22% 18%, rgba(34,211,238,0.18), transparent 32%), radial-gradient(circle at 78% 82%, rgba(167,139,250,0.16), transparent 30%), linear-gradient(135deg, #f8fafc 0%, #eef2ff 60%, #e2e8f0 100%)";

export function SceneShell({
  children,
  variant = "dark",
  showProgress = false,
  tone = "cool",
}: SceneShellProps): ReactElement {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const progress = Math.max(0, Math.min(1, frame / durationInFrames));

  const isDark = variant === "dark";
  const textColor = isDark ? COLORS.ink : COLORS.bgDeep;

  return (
    <AbsoluteFill
      style={{
        fontFamily: TYPO.fontFamily,
        color: textColor,
        background: isDark ? DARK_BG : LIGHT_BG,
        overflow: "hidden",
      }}
    >
      <GradientMesh tone={tone} intensity={isDark ? 0.45 : 0.32} />
      <AnimatedGrid opacity={isDark ? 0.22 : 0.14} />
      {/* Vignette — strong cinematic frame edge, focus to centre */}
      <AbsoluteFill
        style={{
          pointerEvents: "none",
          background:
            "radial-gradient(ellipse 70% 80% at 50% 50%, transparent 32%, rgba(0,0,0,0.55) 100%)",
        }}
      />
      {/* Film grain — visible texture, soft-light blend feels filmic, not noisy */}
      <AbsoluteFill
        style={{
          pointerEvents: "none",
          backgroundImage: GRAIN_SVG,
          backgroundSize: "240px 240px",
          opacity: 0.12,
          mixBlendMode: "soft-light",
        }}
      />
      {showProgress ? (
        <div
          style={{
            position: "absolute",
            left: 72,
            right: 72,
            top: 42,
            height: 6,
            borderRadius: 999,
            background: "rgba(255,255,255,0.08)",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              width: `${progress * 100}%`,
              height: "100%",
              borderRadius: 999,
              background: COLORS.gradientPrimary,
            }}
          />
        </div>
      ) : null}
      {children}
    </AbsoluteFill>
  );
}
