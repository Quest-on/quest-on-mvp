import type { ReactElement } from "react";
import {
  AbsoluteFill,
  Easing,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import {
  BrowserFrame,
  GradientMesh,
  Kicker,
  MaskReveal,
  PerspectiveStage,
  SceneShell,
  ScoreReveal,
  StaggeredWords,
  TitleBlock,
} from "../components";
import { COLORS, EASING, SCENE_DURATIONS, SPRINGS } from "../constants";
import { scenes } from "../script";

// Sound cue: sub-bass impact at frame 50
const REVEAL_FRAME = 28;
const REVEAL_DURATION = 22; // tighter mask reveal — punchier
const SCORE_FRAME = 50;
const BURST_PEAK = 56;
const RUBRIC_START_FRAMES = [96, 116, 136];
const STRENGTH_FRAME = 162;
const CTA_FRAME = 184;
const IMPACT_LINE_FRAME = 206;

export const WowScene: React.FC = (): ReactElement => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const duration = SCENE_DURATIONS.wow;

  // Setup: title + kicker fade in (frame 0-25).
  const titleEnter = interpolate(frame, [0, 25], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASING.smoothOut,
  });

  // BrowserFrame container fades on at REVEAL_FRAME along with the mask.
  const browserOpacity = interpolate(
    frame,
    [REVEAL_FRAME - 2, REVEAL_FRAME + 2],
    [0, 1],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    },
  );

  // Light leak: stronger bloom around the impact, longer tail for residue glow.
  const lightLeak = interpolate(
    frame,
    [SCORE_FRAME - 10, SCORE_FRAME + 4, SCORE_FRAME + 36],
    [0, 1, 0.18],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: EASING.cubicOut,
    },
  );

  // Radial burst expands then fades — the visual "boom" of the impact.
  const burstScale = interpolate(
    frame,
    [SCORE_FRAME - 4, BURST_PEAK + 6],
    [0.5, 2.4],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: EASING.cubicOut,
    },
  );
  const burstOpacity = interpolate(
    frame,
    [SCORE_FRAME - 4, SCORE_FRAME + 2, BURST_PEAK + 12],
    [0, 0.85, 0],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: EASING.cubicOut,
    },
  );

  // Background warmth flash — premium tone breaks the cool palette for 1 beat.
  const warmFlash = interpolate(
    frame,
    [SCORE_FRAME - 4, SCORE_FRAME + 6, SCORE_FRAME + 30],
    [0, 0.42, 0],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: EASING.cubicOut,
    },
  );

  // Micro-shake: ±3px sin wave during 50-58. Slightly stronger than before for punch.
  const shakeActive = frame >= SCORE_FRAME && frame <= SCORE_FRAME + 8;
  const shakeX = shakeActive ? Math.sin((frame - SCORE_FRAME) * 4.2) * 3 : 0;
  const shakeY = shakeActive ? Math.cos((frame - SCORE_FRAME) * 3.8) * 2.2 : 0;

  // Climax zoom-in over the last 30 frames.
  const climaxStart = duration - 30;
  const climaxScale = interpolate(
    frame,
    [climaxStart, duration],
    [1.0, 1.03],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: EASING.cubicOut,
    },
  );

  // Climax line opacity for outro words.
  const lineOpacity = interpolate(
    frame,
    [IMPACT_LINE_FRAME, IMPACT_LINE_FRAME + 18],
    [0, 1],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: EASING.smoothOut,
    },
  );

  // Strength box motion values (declared at top level for clarity).
  const strengthEnter = spring({
    frame: frame - STRENGTH_FRAME,
    fps,
    config: SPRINGS.smooth,
  });
  const strengthOpacity = interpolate(
    frame,
    [STRENGTH_FRAME, STRENGTH_FRAME + 18],
    [0, 1],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    },
  );

  // Z-pop: score card surges forward at impact, locked in afterwards.
  // Out-back (overshoot 1.05) drama paired with the ring sweep.
  const cardZ = interpolate(
    frame,
    [SCORE_FRAME - 4, SCORE_FRAME + 8],
    [0, 120],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: Easing.bezier(0.34, 1.56, 0.64, 1),
    },
  );

  // Punch: short overshoot scale on the BrowserFrame at SCORE_FRAME — 0.92→1.05→1.0.
  // Held at 1.0 before the punch window so the mask reveal lands at full size.
  const punchScale = interpolate(
    frame,
    [SCORE_FRAME - 6, SCORE_FRAME - 4, SCORE_FRAME + 4, SCORE_FRAME + 14],
    [1.0, 0.92, 1.05, 1.0],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: EASING.cubicOut,
    },
  );

  return (
    <SceneShell variant="dark" showProgress>
      <GradientMesh tone="warm" intensity={0.5} />

      {/* Warm flash — single beat of amber to break the cool palette */}
      <AbsoluteFill
        style={{
          pointerEvents: "none",
          background:
            "radial-gradient(ellipse at 70% 52%, rgba(251,191,36,0.55), rgba(167,139,250,0.18) 38%, transparent 62%)",
          opacity: warmFlash,
          mixBlendMode: "screen",
        }}
      />

      {/* Light leak — strong bloom centred on the BrowserFrame */}
      <AbsoluteFill
        style={{
          pointerEvents: "none",
          background:
            "radial-gradient(circle at 70% 50%, rgba(110,231,183,0.7) 0%, rgba(34,211,238,0.55) 22%, transparent 48%)",
          opacity: lightLeak,
          mixBlendMode: "screen",
        }}
      />

      {/* Radial burst — expanding ring of energy at impact frame */}
      <AbsoluteFill
        style={{
          pointerEvents: "none",
          mixBlendMode: "screen",
          opacity: burstOpacity,
        }}
      >
        <div
          style={{
            position: "absolute",
            left: "70%",
            top: "50%",
            width: 600,
            height: 600,
            marginLeft: -300,
            marginTop: -300,
            borderRadius: "50%",
            border: "3px solid rgba(110,231,183,0.85)",
            boxShadow:
              "0 0 80px rgba(34,211,238,0.7), inset 0 0 40px rgba(110,231,183,0.4)",
            transform: `scale(${burstScale})`,
            transformOrigin: "center",
            willChange: "transform",
          }}
        />
      </AbsoluteFill>

      <div
        style={{
          position: "absolute",
          inset: 0,
          transform: `translate3d(${shakeX}px, ${shakeY}px, 0) scale(${climaxScale})`,
          transformOrigin: "center center",
          willChange: "transform",
        }}
      >
        {/* LEFT: kicker + title */}
        <div
          style={{
            position: "absolute",
            left: 120,
            top: 132,
            width: 760,
            opacity: titleEnter,
            transform: `translateY(${(1 - titleEnter) * 26}px)`,
          }}
        >
          <Kicker>{scenes.wow.kicker}</Kicker>
          <TitleBlock
            title={scenes.wow.title}
            highlight={scenes.wow.highlight}
            subtitle={scenes.wow.subtitle}
            size="lg"
            align="left"
          />
        </div>

        {/* RIGHT: BrowserFrame with circle mask reveal */}
        <div
          style={{
            position: "absolute",
            right: 118,
            top: 156,
            width: 720,
            minHeight: 820,
            opacity: browserOpacity,
          }}
        >
          <PerspectiveStage
            perspective={1000}
            originX="50%"
            originY="50%"
          >
            <div
              style={{
                position: "absolute",
                inset: 0,
                transform: `translateZ(${cardZ}px) scale(${punchScale})`,
                transformOrigin: "center center",
                transformStyle: "preserve-3d",
                willChange: "transform",
              }}
            >
              <MaskReveal
                startFrame={REVEAL_FRAME}
                durationFrames={REVEAL_DURATION}
                shape="circle"
                from="center"
              >
                <BrowserFrame title="grade / instructor review">
              <div style={{ position: "relative", padding: 36 }}>
                {/* Score block */}
                <div
                  style={{
                    color: COLORS.muted,
                    fontSize: 22,
                    fontWeight: 800,
                    letterSpacing: "-0.01em",
                  }}
                >
                  Score
                </div>
                <div style={{ marginTop: 12 }}>
                  <ScoreReveal
                    targetScore={scenes.wow.targetScore}
                    startFrame={SCORE_FRAME}
                    size={236}
                    countUpFrames={10}
                  />
                </div>

                {/* Rubrics */}
                <div style={{ marginTop: 36 }}>
                  {scenes.wow.rubrics.map((rubric, index) => {
                    const rubricStart =
                      RUBRIC_START_FRAMES[index] ?? 100 + index * 20;
                    const rubricEnter = spring({
                      frame: frame - rubricStart,
                      fps,
                      config: SPRINGS.smooth,
                    });
                    const rubricOpacity = interpolate(
                      frame,
                      [rubricStart, rubricStart + 18],
                      [0, 1],
                      {
                        extrapolateLeft: "clamp",
                        extrapolateRight: "clamp",
                      },
                    );
                    const fillProgress = interpolate(
                      frame,
                      [rubricStart + 4, rubricStart + 4 + 16],
                      [0, 1],
                      {
                        extrapolateLeft: "clamp",
                        extrapolateRight: "clamp",
                        easing: EASING.cubicOut,
                      },
                    );
                    return (
                      <div
                        key={rubric.name}
                        style={{
                          marginBottom: 20,
                          opacity: rubricOpacity,
                          transform: `translateY(${(1 - rubricEnter) * 18}px)`,
                          willChange: "transform, opacity",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            fontSize: 22,
                            fontWeight: 850,
                          }}
                        >
                          <span style={{ color: COLORS.ink }}>
                            {rubric.name}
                          </span>
                          <span style={{ color: COLORS.cyan }}>
                            {rubric.score}
                          </span>
                        </div>
                        <div
                          style={{
                            marginTop: 10,
                            height: 12,
                            borderRadius: 999,
                            background: "rgba(255,255,255,0.10)",
                            overflow: "hidden",
                          }}
                        >
                          <div
                            style={{
                              width: `${rubric.score * fillProgress}%`,
                              height: "100%",
                              borderRadius: 999,
                              background: COLORS.gradientPrimary,
                            }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Strength box */}
                <div
                  style={{
                    marginTop: 22,
                    padding: 22,
                    borderRadius: 18,
                    background: "rgba(52,211,153,0.13)",
                    border: `1px solid ${COLORS.mint}55`,
                    color: "#d1fae5",
                    fontSize: 21,
                    lineHeight: 1.45,
                    fontWeight: 700,
                    opacity: strengthOpacity,
                    transform: `translateY(${(1 - strengthEnter) * 16}px)`,
                    willChange: "transform, opacity",
                  }}
                >
                  {scenes.wow.strength}
                </div>

                {/* CTA buttons */}
                <div
                  style={{
                    marginTop: 18,
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: 14,
                  }}
                >
                  {[
                    {
                      label: scenes.wow.reviewCta,
                      color: COLORS.cyan,
                      bg: "rgba(34,211,238,0.14)",
                    },
                    {
                      label: scenes.wow.confirmCta,
                      color: COLORS.mint,
                      bg: "rgba(52,211,153,0.16)",
                    },
                  ].map((btn, index) => {
                    const btnStart = CTA_FRAME + index * 8;
                    const btnEnter = spring({
                      frame: frame - btnStart,
                      fps,
                      config: SPRINGS.snappy,
                    });
                    const btnOpacity = interpolate(
                      frame,
                      [btnStart, btnStart + 14],
                      [0, 1],
                      {
                        extrapolateLeft: "clamp",
                        extrapolateRight: "clamp",
                      },
                    );
                    return (
                      <div
                        key={btn.label}
                        style={{
                          padding: "16px 18px",
                          borderRadius: 16,
                          textAlign: "center",
                          background: btn.bg,
                          border: `1px solid ${btn.color}66`,
                          color: btn.color,
                          fontSize: 22,
                          fontWeight: 950,
                          opacity: btnOpacity,
                          transform: `translateY(${(1 - btnEnter) * 14}px)`,
                          willChange: "transform, opacity",
                        }}
                      >
                        {btn.label}
                      </div>
                    );
                  })}
                </div>
              </div>
              </BrowserFrame>
            </MaskReveal>
            </div>
          </PerspectiveStage>
        </div>

        {/* CLIMAX LINE: bottom big stagger words */}
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 96,
            textAlign: "center",
            opacity: lineOpacity,
          }}
        >
          <div
            style={{
              display: "inline-block",
              fontSize: 64,
              fontWeight: 950,
              letterSpacing: "-0.025em",
              lineHeight: 1.1,
              background: COLORS.gradientPrimary,
              WebkitBackgroundClip: "text",
              color: "transparent",
            }}
          >
            <StaggeredWords
              text={scenes.wow.impactLine}
              startFrame={IMPACT_LINE_FRAME}
              perWord={16}
              staggerMs={110}
            />
          </div>
        </div>
      </div>
    </SceneShell>
  );
};
