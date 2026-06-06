import type { ReactElement } from "react";
import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { COLORS, EASING, SCENE_DURATIONS, SPRINGS, TYPO } from "../constants";
import {
  GodRay,
  GradientMesh,
  Kicker,
  Parallax,
  SceneShell,
  StaggeredWords,
} from "../components";
import { scenes } from "../script";

const DURATION = SCENE_DURATIONS.hook; // 240f / 8s

// Minimal background dot field — quieter than the legacy SignalField so the
// foreground typography owns the frame.
function MinimalSignals(): ReactElement {
  const frame = useCurrentFrame();
  const dots = Array.from({ length: 10 }, (_, index) => {
    const angle = (index / 10) * Math.PI * 2 + frame * 0.0035;
    const radius = 380 + (index % 3) * 110;
    const color = [COLORS.blue, COLORS.cyan, COLORS.mint][index % 3];
    return {
      x: Math.cos(angle) * radius,
      y: Math.sin(angle) * radius * 0.42,
      size: 5 + (index % 3) * 2,
      color,
    };
  });

  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      {dots.map((dot, index) => (
        <div
          key={index}
          style={{
            position: "absolute",
            left: 960 + dot.x,
            top: 540 + dot.y,
            width: dot.size,
            height: dot.size,
            borderRadius: 999,
            background: dot.color,
            boxShadow: `0 0 22px ${dot.color}`,
            opacity: 0.32,
          }}
        />
      ))}
    </AbsoluteFill>
  );
}

export const HookScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Scene-level fade in (0→14) and gentle fade-out (last 14f -> 0.94)
  const fadeIn = interpolate(frame, [0, 14], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASING.smoothOut,
  });
  const fadeOut = interpolate(
    frame,
    [DURATION - 14, DURATION],
    [1, 0.94],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: EASING.smoothOut,
    },
  );
  const sceneOpacity = fadeIn * fadeOut;

  // Kicker enters first
  const kickerSpring = spring({
    frame: frame - 8,
    fps,
    config: SPRINGS.smooth,
  });
  const kickerOpacity = interpolate(kickerSpring, [0, 1], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const kickerLift = interpolate(kickerSpring, [0, 1], [16, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Subtitle fade+up at frame 60-118 (earlier start so f60 isn't dead air)
  const subtitleProgress = interpolate(frame, [60, 118], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASING.smoothOut,
  });

  // Promise pill at frame 130-150
  const promiseProgress = interpolate(frame, [130, 150], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASING.smoothOut,
  });

  return (
    <SceneShell variant="dark" showProgress={false}>
      {/* Override default mesh with a stronger cool tone for cinematic depth */}
      <AbsoluteFill style={{ pointerEvents: "none" }}>
        <GradientMesh tone="cool" intensity={1} />
      </AbsoluteFill>
      <GodRay startFrame={80} durationFrames={140} />
      <MinimalSignals />

      {/* Subtle 30f scale-up parallax over the whole composition */}
      <AbsoluteFill style={{ opacity: sceneOpacity }}>
        <Parallax
          startFrame={DURATION - 60}
          durationFrames={60}
          fromScale={1.0}
          toScale={1.04}
        >
          <AbsoluteFill
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <div style={{ textAlign: "center", maxWidth: 1480 }}>
              {/* Kicker */}
              <div
                style={{
                  display: "flex",
                  justifyContent: "center",
                  opacity: kickerOpacity,
                  transform: `translateY(${kickerLift}px)`,
                }}
              >
                <Kicker color={COLORS.cyan}>{scenes.hook.kicker}</Kicker>
              </div>

              {/*
                Title — per-word inline gradient (white→cyan) so the title
                has its own subtle gradient pass that complements (not
                duplicates) the highlight's primary gradient.
              */}
              <h1
                style={{
                  margin: "34px 0 0",
                  fontSize: 110,
                  lineHeight: TYPO.lineHeightTitle,
                  fontWeight: 950,
                  letterSpacing: TYPO.letterSpacingTight,
                }}
              >
                {scenes.hook.title.split(/(\s+)/).map((word, idx) => {
                  if (/^\s+$/.test(word)) {
                    return <span key={idx}>{word}</span>;
                  }
                  const localStart = 22 + idx * 3;
                  const progress = interpolate(
                    frame,
                    [localStart, localStart + 14],
                    [0, 1],
                    {
                      extrapolateLeft: "clamp",
                      extrapolateRight: "clamp",
                      easing: EASING.smoothOut,
                    },
                  );
                  return (
                    <span
                      key={idx}
                      style={{
                        display: "inline-block",
                        background:
                          "linear-gradient(180deg, #f8fafc 0%, #cffafe 100%)",
                        WebkitBackgroundClip: "text",
                        color: "transparent",
                        opacity: progress,
                        transform: `translateY(${(1 - progress) * 22}px)`,
                        willChange: "transform, opacity",
                      }}
                    >
                      {word}
                    </span>
                  );
                })}
              </h1>

              {/*
                Highlight — gradient text, per-word stagger. The gradient lives on
                each word's own inline-block instead of the parent <h1>, so each
                word self-clips its own gradient. This sidesteps the inline-block ×
                background-clip:text conflict that made the headline invisible
                in iter 7.
              */}
              <h1
                style={{
                  margin: "10px 0 0",
                  fontSize: 110,
                  lineHeight: TYPO.lineHeightTitle,
                  fontWeight: 950,
                  letterSpacing: TYPO.letterSpacingTight,
                }}
              >
                {scenes.hook.highlight
                  .split(/(\s+)/)
                  .map((word, idx) => {
                    if (/^\s+$/.test(word)) {
                      return <span key={idx}>{word}</span>;
                    }
                    const localStart = 50 + idx * 3;
                    const progress = interpolate(
                      frame,
                      [localStart, localStart + 14],
                      [0, 1],
                      {
                        extrapolateLeft: "clamp",
                        extrapolateRight: "clamp",
                        easing: EASING.smoothOut,
                      },
                    );
                    return (
                      <span
                        key={idx}
                        style={{
                          display: "inline-block",
                          background: COLORS.gradientPrimary,
                          WebkitBackgroundClip: "text",
                          color: "transparent",
                          opacity: progress,
                          transform: `translateY(${(1 - progress) * 22}px)`,
                          willChange: "transform, opacity",
                        }}
                      >
                        {word}
                      </span>
                    );
                  })}
              </h1>

              {/* Subtitle */}
              <p
                style={{
                  margin: "38px auto 0",
                  maxWidth: 1180,
                  color: COLORS.muted,
                  fontSize: 34,
                  lineHeight: 1.4,
                  fontWeight: 650,
                  letterSpacing: TYPO.letterSpacingBody,
                  opacity: subtitleProgress,
                  transform: `translateY(${(1 - subtitleProgress) * 18}px)`,
                }}
              >
                {scenes.hook.subtitle}
              </p>

              {/* Promise pill */}
              <div
                style={{
                  display: "flex",
                  justifyContent: "center",
                  marginTop: 40,
                  opacity: promiseProgress,
                  transform: `translateY(${(1 - promiseProgress) * 14}px)`,
                }}
              >
                <div
                  style={{
                    padding: "16px 26px",
                    borderRadius: 999,
                    border: `1px solid ${COLORS.line}`,
                    background: "rgba(15,23,42,0.72)",
                    color: COLORS.muted,
                    fontSize: 24,
                    fontWeight: 800,
                    letterSpacing: TYPO.letterSpacingBody,
                  }}
                >
                  {scenes.hook.promise}
                </div>
              </div>
            </div>
          </AbsoluteFill>
        </Parallax>
      </AbsoluteFill>
    </SceneShell>
  );
};
