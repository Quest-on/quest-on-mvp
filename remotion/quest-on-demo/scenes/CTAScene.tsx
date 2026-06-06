import type { ReactElement } from "react";
import {
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import {
  GradientMesh,
  SceneShell,
  StaggeredWords,
} from "../components";
import { COLORS, EASING, SCENE_DURATIONS, SPRINGS, TYPO } from "../constants";
import { scenes } from "../script";

const LOGO_FRAME = 0;
const SUBTITLE_FRAME = 22;
const TAGLINE_FRAME = 50;
const FOOTER_FRAME = 80;
const GLOW_START = 30;
const GLOW_DURATION = 120; // frame 30-150

export const CTAScene: React.FC = (): ReactElement => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const duration = SCENE_DURATIONS.cta;

  // Logo: anticipation pulse via snappy spring → scale 0.94 → 1.04 → 1.0.
  const logoSpring = spring({
    frame: frame - LOGO_FRAME,
    fps,
    config: SPRINGS.snappy,
  });
  // Map [0..1] to a triangle that goes 0.94 → 1.04 → 1.0 to feel like an anticipation kick.
  let logoScale: number;
  if (logoSpring < 0.6) {
    logoScale = interpolate(logoSpring, [0, 0.6], [0.94, 1.04], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    });
  } else {
    logoScale = interpolate(logoSpring, [0.6, 1], [1.04, 1.0], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    });
  }
  const logoOpacity = interpolate(frame, [0, 14], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASING.smoothOut,
  });

  // Subtitle (frame 22-50): fade + small up.
  const subtitleProgress = interpolate(
    frame,
    [SUBTITLE_FRAME, SUBTITLE_FRAME + 20],
    [0, 1],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: EASING.smoothOut,
    },
  );

  // Tagline (frame 50-80): rendered via StaggeredWords; container fade.
  const taglineOpacity = interpolate(
    frame,
    [TAGLINE_FRAME, TAGLINE_FRAME + 14],
    [0, 1],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    },
  );

  // Footer pill (frame 80-110).
  const footerEnter = spring({
    frame: frame - FOOTER_FRAME,
    fps,
    config: SPRINGS.gentle,
  });
  const footerOpacity = interpolate(
    frame,
    [FOOTER_FRAME, FOOTER_FRAME + 18],
    [0, 1],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    },
  );

  // Underline glow line: width 0 → 620 across frame 30-150.
  const glowWidth = interpolate(
    frame,
    [GLOW_START, GLOW_START + GLOW_DURATION],
    [0, 620],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: EASING.cubicOut,
    },
  );
  const glowOpacity = interpolate(
    frame,
    [GLOW_START, GLOW_START + 24, GLOW_START + GLOW_DURATION - 20, GLOW_START + GLOW_DURATION],
    [0, 1, 1, 0.6],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    },
  );

  // Final 30 frames: gentle opacity fade 1 → 0.96.
  const outroOpacity = interpolate(
    frame,
    [duration - 30, duration],
    [1, 0.96],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: EASING.smoothOut,
    },
  );

  return (
    <SceneShell variant="dark" showProgress={false}>
      <GradientMesh tone="cool" intensity={1.2} />
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          opacity: outroOpacity,
        }}
      >
        <div style={{ textAlign: "center" }}>
          {/* Logo */}
          <div
            style={{
              fontSize: 160,
              fontWeight: 950,
              letterSpacing: TYPO.letterSpacingTight,
              lineHeight: 1,
              background: COLORS.gradientPrimary,
              WebkitBackgroundClip: "text",
              color: "transparent",
              transform: `scale(${logoScale})`,
              opacity: logoOpacity,
              transformOrigin: "center center",
              willChange: "transform, opacity",
            }}
          >
            {scenes.cta.title}
          </div>

          {/* Glow line — dashboard-tone, not gaming HUD */}
          <div
            style={{
              margin: "26px auto 0",
              height: 4,
              width: glowWidth,
              borderRadius: 999,
              background: COLORS.gradientPrimary,
              boxShadow: `0 0 18px ${COLORS.cyan}55`,
              opacity: glowOpacity,
            }}
          />

          {/* Subtitle */}
          <div
            style={{
              marginTop: 36,
              color: COLORS.muted,
              fontSize: 38,
              fontWeight: 700,
              letterSpacing: TYPO.letterSpacingBody,
              opacity: subtitleProgress,
              transform: `translateY(${(1 - subtitleProgress) * 16}px)`,
            }}
          >
            {scenes.cta.subtitle}
          </div>

          {/* Tagline (StaggeredWords) */}
          <div
            style={{
              marginTop: 22,
              fontSize: 24,
              fontWeight: 900,
              color: COLORS.cyan,
              letterSpacing: TYPO.letterSpacingBody,
              opacity: taglineOpacity,
            }}
          >
            <StaggeredWords
              text={scenes.cta.tagline}
              startFrame={TAGLINE_FRAME}
              perWord={14}
              staggerMs={80}
            />
          </div>

          {/* Footer pill */}
          <div
            style={{
              marginTop: 50,
              display: "flex",
              justifyContent: "center",
              opacity: footerOpacity,
              transform: `translateY(${(1 - footerEnter) * 14}px)`,
            }}
          >
            <div
              style={{
                padding: "12px 22px",
                borderRadius: 999,
                border: `1px solid ${COLORS.line}`,
                background: "rgba(15,23,42,0.72)",
                color: COLORS.muted,
                fontSize: 22,
                fontWeight: 800,
                letterSpacing: TYPO.letterSpacingBody,
              }}
            >
              {scenes.cta.footer}
            </div>
          </div>
        </div>
      </div>
    </SceneShell>
  );
};
