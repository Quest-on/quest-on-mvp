import type { CSSProperties, ReactElement } from "react";
import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { COLORS, EASING, SCENE_DURATIONS, SPRINGS, TYPO } from "../constants";
import {
  GradientMesh,
  Kicker,
  PerspectiveStage,
  SceneShell,
  TitleBlock,
} from "../components";
import { scenes } from "../script";

const DURATION = SCENE_DURATIONS.problem; // 210f / 7s
const CLOSING_START = DURATION - 60; // 150
const CLOSING_FULL = DURATION - 30; // 180

interface ProblemCardProps {
  label: string;
  body: string;
  color: string;
  startFrame: number;
  fromX: number; // -80 left, +80 right
  dimAfter: number; // frame where dim begins (closing)
  depth: number; // translateZ — separates each bullet onto its own plane
}

function ProblemCard({
  label,
  body,
  color,
  startFrame,
  fromX,
  dimAfter,
  depth,
}: ProblemCardProps): ReactElement {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Slide-in spring
  const enter = spring({
    frame: frame - startFrame,
    fps,
    config: SPRINGS.smooth,
  });
  const x = interpolate(enter, [0, 1], [fromX, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const opacity = interpolate(enter, [0, 1], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const scale = interpolate(enter, [0, 1], [0.86, 1.0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Anticipation jitter — ±2px for ~12 frames after card lands
  const settleStart = startFrame + 14;
  const settleEnd = settleStart + 12;
  const jitterPhase = interpolate(
    frame,
    [settleStart, settleEnd],
    [0, Math.PI * 2.4],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    },
  );
  const jitterEnvelope = interpolate(
    frame,
    [settleStart, settleEnd],
    [1, 0],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: EASING.smoothOut,
    },
  );
  const jitter = Math.sin(jitterPhase) * 2 * jitterEnvelope;

  // Dim during closing
  const dim = interpolate(frame, [dimAfter, dimAfter + 30], [1, 0.6], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASING.smoothOut,
  });

  const style: CSSProperties = {
    flex: 1,
    padding: "44px 42px",
    borderRadius: 26,
    border: `1px solid ${color}55`,
    background: `${color}15`,
    boxShadow: `0 24px 70px rgba(0,0,0,0.30)`,
    opacity: opacity * dim,
    transform: `translate3d(${x + jitter}px, 0, 0) translateZ(${depth}px) scale(${scale})`,
    transformStyle: "preserve-3d",
    willChange: "transform, opacity",
    minHeight: 320,
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
  };

  return (
    <div style={style}>
      <div
        style={{
          display: "inline-flex",
          width: "fit-content",
          padding: "8px 14px",
          borderRadius: 999,
          background: `${color}25`,
          border: `1px solid ${color}66`,
          color,
          fontSize: 22,
          fontWeight: 900,
          letterSpacing: TYPO.letterSpacingBody,
        }}
      >
        {label}
      </div>
      <div
        style={{
          marginTop: 24,
          fontSize: 38,
          lineHeight: 1.32,
          fontWeight: 900,
          color: COLORS.ink,
          letterSpacing: TYPO.letterSpacingTight,
        }}
      >
        {body}
      </div>
    </div>
  );
}

function CollisionDivider(): ReactElement {
  const frame = useCurrentFrame();
  // Fade in at frame 80 (after both cards have landed), fade out at CLOSING_START.
  const fadeIn = interpolate(frame, [80, 100], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASING.smoothOut,
  });
  const fadeOut = interpolate(
    frame,
    [CLOSING_START, CLOSING_START + 24],
    [1, 0],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: EASING.smoothOut,
    },
  );

  return (
    <div
      style={{
        width: 1,
        alignSelf: "stretch",
        margin: "0 14px",
        background:
          "linear-gradient(180deg, transparent 0%, rgba(255,255,255,0.18) 50%, transparent 100%)",
        opacity: fadeIn * fadeOut,
      }}
    />
  );
}

export const ProblemScene: React.FC = () => {
  const frame = useCurrentFrame();

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
  const kickerProgress = interpolate(frame, [6, 22], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASING.smoothOut,
  });
  const titleProgress = interpolate(frame, [12, 32], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASING.smoothOut,
  });

  // Closing line
  const closingProgress = interpolate(
    frame,
    [CLOSING_START, CLOSING_FULL],
    [0, 0.95],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: EASING.smoothOut,
    },
  );

  return (
    <SceneShell variant="dark" showProgress>
      <AbsoluteFill style={{ pointerEvents: "none" }}>
        <GradientMesh tone="cool" intensity={0.6} />
      </AbsoluteFill>

      <AbsoluteFill style={{ opacity: sceneOpacity }}>
        {/* Top: kicker + title centered */}
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: 110,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            textAlign: "center",
          }}
        >
          <div
            style={{
              opacity: kickerProgress,
              transform: `translateY(${(1 - kickerProgress) * 14}px)`,
            }}
          >
            <Kicker color={COLORS.amber}>{scenes.problem.kicker}</Kicker>
          </div>
          <div
            style={{
              opacity: titleProgress,
              transform: `translateY(${(1 - titleProgress) * 18}px)`,
            }}
          >
            <TitleBlock
              title={scenes.problem.title}
              highlight={scenes.problem.highlight}
              size="lg"
              align="center"
            />
          </div>
        </div>

        {/* Two cards with collision divider — wrapped in PerspectiveStage so
            the bullets sit on different Z planes (paradigm match w/ other scenes). */}
        <div
          style={{
            position: "absolute",
            left: 132,
            right: 132,
            top: 470,
            bottom: 200,
          }}
        >
          <PerspectiveStage perspective={1100} originX="50%" originY="50%">
            <div
              style={{
                position: "absolute",
                inset: 0,
                display: "flex",
                alignItems: "stretch",
                transformStyle: "preserve-3d",
              }}
            >
              <ProblemCard
                label={scenes.problem.bulletA.label}
                body={scenes.problem.bulletA.body}
                color={scenes.problem.bulletA.color}
                startFrame={26}
                fromX={-80}
                dimAfter={CLOSING_START}
                depth={40}
              />
              <CollisionDivider />
              <ProblemCard
                label={scenes.problem.bulletB.label}
                body={scenes.problem.bulletB.body}
                color={scenes.problem.bulletB.color}
                startFrame={36}
                fromX={80}
                dimAfter={CLOSING_START}
                depth={-20}
              />
            </div>
          </PerspectiveStage>
        </div>

        {/* Closing line floating above the cards */}
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: 850,
            textAlign: "center",
            color: COLORS.ink,
            fontSize: 50,
            fontWeight: 950,
            letterSpacing: TYPO.letterSpacingTight,
            opacity: closingProgress,
            transform: `translateY(${(1 - closingProgress) * 14}px)`,
            textShadow: "0 4px 40px rgba(6,17,31,0.65)",
          }}
        >
          {scenes.problem.closing}
        </div>
      </AbsoluteFill>
    </SceneShell>
  );
};
