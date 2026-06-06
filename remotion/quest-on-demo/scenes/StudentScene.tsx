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
  BrowserFrame,
  Callout,
  GradientMesh,
  Kicker,
  Parallax,
  PerspectiveStage,
  SceneShell,
  TitleBlock,
} from "../components";
import { scenes } from "../script";

const DURATION = SCENE_DURATIONS.student; // 330f / 11s
const WORKING_START = 100;
const CLOSEUP_START = 230;
const SETTLE_START = 310;

// Per-message reveal timing
const MESSAGE_TIMING: Array<{
  start: number;
  duration: number;
}> = [
  { start: 110, duration: 36 },
  { start: 168, duration: 36 },
  { start: 224, duration: 36 },
];

interface ChatBubbleProps {
  role: "student" | "ai";
  text: string;
  start: number;
  duration: number;
  depth?: number;
}

function TypingDots({
  startFrame,
  endFrame,
  color,
}: {
  startFrame: number;
  endFrame: number;
  color: string;
}): ReactElement {
  const frame = useCurrentFrame();
  const visible = frame >= startFrame && frame < endFrame;

  // Each dot pulses at 200ms offset
  const dot = (offset: number): number => {
    const t = (frame - startFrame - offset) / 6;
    const pulse = (Math.sin(t) + 1) / 2;
    return 0.35 + pulse * 0.55;
  };

  if (!visible) {
    return <div style={{ height: 14 }} />;
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, height: 14 }}>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          style={{
            width: 8,
            height: 8,
            borderRadius: 999,
            background: color,
            opacity: dot(i * 2),
          }}
        />
      ))}
    </div>
  );
}

function ChatBubble({
  role,
  text,
  start,
  duration,
  depth = 0,
}: ChatBubbleProps): ReactElement {
  const frame = useCurrentFrame();
  const isStudent = role === "student";
  const tint = isStudent ? COLORS.blue : COLORS.mint;

  // Bubble container appears with the typing dots
  const bubbleStart = start - 14;
  const enter = interpolate(
    frame,
    [bubbleStart, bubbleStart + 14],
    [0, 1],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: EASING.smoothOut,
    },
  );
  const lift = (1 - enter) * 14;
  const bubbleScale = 0.9 + 0.1 * enter;

  // Typewriter via string slice (Korean-safe)
  const reveal = interpolate(frame, [start, start + duration], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASING.cubicOut,
  });
  const cutoff = Math.floor(reveal * text.length);
  const visibleText = text.slice(0, cutoff);
  const dotsActive = frame >= bubbleStart && frame < start;
  const showCursor =
    frame >= start && cutoff > 0 && cutoff < text.length;

  return (
    <div
      style={{
        marginTop: 16,
        padding: "16px 18px",
        borderRadius: 16,
        background: isStudent
          ? "rgba(59,130,246,0.18)"
          : "rgba(52,211,153,0.15)",
        border: `1px solid ${tint}55`,
        color: isStudent ? COLORS.ink : "#d1fae5",
        fontSize: 19,
        lineHeight: 1.45,
        minHeight: 76,
        opacity: enter,
        transform: `translate3d(0, ${lift}px, 0) translateZ(${depth}px) scale(${bubbleScale})`,
        transformStyle: "preserve-3d",
        willChange: "transform, opacity",
        letterSpacing: TYPO.letterSpacingBody,
      }}
    >
      <div
        style={{
          color: tint,
          fontSize: 14,
          fontWeight: 900,
          marginBottom: 6,
          letterSpacing: TYPO.letterSpacingTight,
        }}
      >
        {isStudent ? "STUDENT" : "AI TUTOR"}
      </div>
      {dotsActive ? (
        <TypingDots
          startFrame={bubbleStart}
          endFrame={start}
          color={tint}
        />
      ) : (
        <span>
          {visibleText}
          {showCursor ? (
            <span style={{ opacity: 0.7 }}> |</span>
          ) : null}
        </span>
      )}
    </div>
  );
}

export const StudentScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Scene fade
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

  // Header timing
  const headerEnter = spring({
    frame: frame - 8,
    fps,
    config: SPRINGS.smooth,
  });
  const headerOpacity = interpolate(headerEnter, [0, 1], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const headerLift = interpolate(headerEnter, [0, 1], [22, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const frameEnter = spring({
    frame: frame - 14,
    fps,
    config: SPRINGS.gentle,
  });
  const frameOpacity = interpolate(frameEnter, [0, 1], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const frameLift = interpolate(frameEnter, [0, 1], [40, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // CloseUp scale: 1.0 -> 1.15 from 230, then settle back to ~1.02 from 310
  const closeUpScale = interpolate(
    frame,
    [CLOSEUP_START, SETTLE_START, DURATION],
    [1.0, 1.15, 1.02],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: EASING.cubicOut,
    },
  );
  // Vignette dim ramps up during CloseUp, eases off in Settle
  const vignetteOpacity = interpolate(
    frame,
    [CLOSEUP_START, SETTLE_START, DURATION],
    [0, 0.55, 0.18],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: EASING.cubicOut,
    },
  );
  const vignetteBlur = interpolate(
    frame,
    [CLOSEUP_START, SETTLE_START, DURATION],
    [0, 6, 1.5],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: EASING.cubicOut,
    },
  );

  // Callout appears mid CloseUp
  const showCallout = frame >= 250;

  return (
    <SceneShell variant="dark" showProgress>
      <AbsoluteFill style={{ pointerEvents: "none" }}>
        <GradientMesh tone="cool" intensity={0.85} />
      </AbsoluteFill>

      {/* Custom CloseUp framing — center on the right-side chat panel */}
      <AbsoluteFill style={{ opacity: sceneOpacity, overflow: "hidden" }}>
        <div
          style={{
            position: "relative",
            width: "100%",
            height: "100%",
          }}
        >
          <div
            style={{
              width: "100%",
              height: "100%",
              transform: `scale(${closeUpScale})`,
              transformOrigin: "76% 50%",
              willChange: "transform",
            }}
          >
            <Parallax
              startFrame={0}
              durationFrames={WORKING_START + 130}
              fromScale={1.0}
              toScale={1.04}
            >
              <AbsoluteFill>
                {/* Left text column */}
                <div
                  style={{
                    position: "absolute",
                    left: 120,
                    top: 130,
                    width: 560,
                    opacity: headerOpacity,
                    transform: `translate3d(0, ${headerLift}px, 0)`,
                  }}
                >
                  <Kicker color={COLORS.cyan}>
                    {scenes.student.kicker}
                  </Kicker>
                  <TitleBlock
                    title={scenes.student.title}
                    highlight={scenes.student.highlight}
                    subtitle={scenes.student.subtitle}
                    size="lg"
                    align="left"
                  />
                </div>

                {/* Right browser */}
                <div
                  style={{
                    position: "absolute",
                    right: 100,
                    top: 130,
                    width: 1080,
                    opacity: frameOpacity,
                    transform: `translate3d(0, ${frameLift}px, 0)`,
                  }}
                >
                  <BrowserFrame title="student / active exam">
                    <div
                      style={{
                        position: "relative",
                        display: "grid",
                        gridTemplateColumns: "1fr 420px",
                        minHeight: 700,
                      }}
                    >
                      {/* Question + answer draft */}
                      <div
                        style={{
                          padding: 32,
                          borderRight: `1px solid ${COLORS.line}`,
                        }}
                      >
                        <div
                          style={{
                            color: COLORS.muted,
                            fontSize: 18,
                            fontWeight: 800,
                            letterSpacing: TYPO.letterSpacingTight,
                          }}
                        >
                          QUESTION 2
                        </div>
                        <div
                          style={{
                            marginTop: 16,
                            fontSize: 30,
                            lineHeight: 1.32,
                            fontWeight: 900,
                            color: COLORS.ink,
                            letterSpacing: TYPO.letterSpacingTight,
                          }}
                        >
                          {scenes.student.question}
                        </div>
                        <div
                          style={{
                            marginTop: 28,
                            padding: 22,
                            borderRadius: 18,
                            background: "rgba(255,255,255,0.05)",
                            border: `1px solid ${COLORS.lineSoft}`,
                            color: COLORS.muted,
                            fontSize: 21,
                            lineHeight: 1.5,
                            opacity: 0.78,
                            letterSpacing: TYPO.letterSpacingBody,
                          }}
                        >
                          {scenes.student.answerDraft}
                        </div>
                      </div>

                      {/* Right: AI tutor chat */}
                      <div
                        style={{
                          position: "relative",
                          minHeight: 660,
                        }}
                      >
                        <PerspectiveStage
                          perspective={1100}
                          originX="50%"
                          originY="50%"
                        >
                          <div
                            style={{
                              padding: 22,
                              transformStyle: "preserve-3d",
                            }}
                          >
                            <div
                              style={{
                                color: COLORS.cyan,
                                fontSize: 18,
                                fontWeight: 900,
                                letterSpacing: TYPO.letterSpacingTight,
                              }}
                            >
                              AI Tutor
                            </div>
                            {scenes.student.messages.map((message, index) => (
                              <ChatBubble
                                key={index}
                                role={message.role as "student" | "ai"}
                                text={message.text}
                                start={MESSAGE_TIMING[index].start}
                                duration={MESSAGE_TIMING[index].duration}
                                depth={(2 - index) * 44}
                              />
                            ))}
                          </div>
                        </PerspectiveStage>
                      </div>

                      {showCallout ? (
                        <Callout
                          label={scenes.student.calloutLabel}
                          x={660}
                          y={120}
                          color={COLORS.cyan}
                        />
                      ) : null}
                    </div>
                  </BrowserFrame>
                </div>
              </AbsoluteFill>
            </Parallax>
          </div>

          {/* Vignette overlay for CloseUp dim/blur */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              pointerEvents: "none",
              background: `radial-gradient(circle at 76% 50%, transparent 26%, rgba(6,17,31,${vignetteOpacity}) 70%)`,
              backdropFilter: `blur(${vignetteBlur}px)`,
              WebkitBackdropFilter: `blur(${vignetteBlur}px)`,
            }}
          />
        </div>
      </AbsoluteFill>
    </SceneShell>
  );
};
