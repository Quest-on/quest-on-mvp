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
  CloseUp,
  GradientMesh,
  Kicker,
  Parallax,
  PerspectiveStage,
  SceneShell,
  TitleBlock,
} from "../components";
import { scenes } from "../script";

const DURATION = SCENE_DURATIONS.instructor; // 330f / 11s
const WIDE_END = 110;
const WORKING_END = 240;

interface InstructorCardProps {
  label: string;
  title: string;
  body: string;
  color: string;
  startFrame: number;
  depth: number;
}

function InstructorCard({
  label,
  title,
  body,
  color,
  startFrame,
  depth,
}: InstructorCardProps): ReactElement {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const enter = spring({
    frame: frame - startFrame,
    fps,
    config: SPRINGS.smooth,
  });
  const opacity = interpolate(enter, [0, 1], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const lift = interpolate(enter, [0, 1], [34, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const scale = interpolate(enter, [0, 1], [0.88, 1.0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "84px 1fr",
        gap: 22,
        marginBottom: 20,
        padding: 26,
        borderRadius: 22,
        border: `1px solid ${COLORS.line}`,
        background: "rgba(255,255,255,0.05)",
        opacity,
        transform: `translate3d(0, ${lift}px, 0) translateZ(${depth}px) scale(${scale})`,
        transformStyle: "preserve-3d",
        willChange: "transform, opacity",
      }}
    >
      <div
        style={{
          width: 64,
          height: 64,
          borderRadius: 18,
          display: "grid",
          placeItems: "center",
          color,
          background: `${color}22`,
          fontSize: 26,
          fontWeight: 950,
          letterSpacing: TYPO.letterSpacingTight,
        }}
      >
        {label}
      </div>
      <div>
        <div
          style={{
            fontSize: 30,
            fontWeight: 900,
            color: COLORS.ink,
            letterSpacing: TYPO.letterSpacingTight,
          }}
        >
          {title}
        </div>
        <div
          style={{
            marginTop: 10,
            color: COLORS.muted,
            fontSize: 22,
            lineHeight: 1.4,
            letterSpacing: TYPO.letterSpacingBody,
          }}
        >
          {body}
        </div>
      </div>
    </div>
  );
}

export const InstructorScene: React.FC = () => {
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

  // Wide phase: text panel slides in
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

  // Browser frame entrance
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

  return (
    <SceneShell variant="dark" showProgress>
      <AbsoluteFill style={{ pointerEvents: "none" }}>
        <GradientMesh tone="cool" intensity={0.85} />
      </AbsoluteFill>

      {/* CloseUp wraps the entire scene; before its startFrame it's transparent */}
      <AbsoluteFill style={{ opacity: sceneOpacity }}>
        <CloseUp
          startFrame={WORKING_END}
          durationFrames={32}
          cropX={66}
          cropY={48}
          fromScale={1.0}
          toScale={1.18}
          blur={6}
        >
          {/* Slow Wide-phase parallax across full duration */}
          <Parallax
            startFrame={0}
            durationFrames={DURATION}
            fromScale={1.0}
            toScale={1.05}
          >
            <AbsoluteFill>
              {/* Left text column — wider so the Korean headline drops 4-line → 3-line */}
              <div
                style={{
                  position: "absolute",
                  left: 120,
                  top: 130,
                  width: 720,
                  opacity: headerOpacity,
                  transform: `translate3d(0, ${headerLift}px, 0)`,
                }}
              >
                <Kicker color={COLORS.violet}>
                  {scenes.instructor.kicker}
                </Kicker>
                <TitleBlock
                  title={scenes.instructor.title}
                  highlight={scenes.instructor.highlight}
                  subtitle={scenes.instructor.subtitle}
                  size="lg"
                  align="left"
                />
              </div>

              {/* Right browser column (~2/3 width) — wrapped in PerspectiveStage so cards can z-stack */}
              <PerspectiveStage
                perspective={1100}
                originX="50%"
                originY="50%"
              >
                <div
                  style={{
                    position: "absolute",
                    right: 100,
                    top: 130,
                    width: 1080,
                    opacity: frameOpacity,
                    transform: `translate3d(0, ${frameLift}px, 0)`,
                    transformStyle: "preserve-3d",
                  }}
                >
                  <BrowserFrame
                    title="instructor / new exam"
                    style={{ transformStyle: "preserve-3d" }}
                  >
                    <div
                      style={{
                        position: "relative",
                        padding: 32,
                        transformStyle: "preserve-3d",
                      }}
                    >
                      {scenes.instructor.cards.map((card, index) => (
                        <InstructorCard
                          key={card.title}
                          label={card.label}
                          title={card.title}
                          body={card.body}
                          color={card.color}
                          startFrame={120 + index * 20}
                          depth={(2 - index) * 56}
                        />
                      ))}
                      {/* Callouts appear during Working phase to mark key moments */}
                      {frame >= 200 ? (
                        <Callout
                          label={scenes.instructor.detail}
                          x={520}
                          y={210}
                          color={COLORS.violet}
                        />
                      ) : null}
                      {frame >= 220 ? (
                        <Callout
                          label={scenes.instructor.detail2}
                          x={520}
                          y={420}
                          color={COLORS.mint}
                        />
                      ) : null}
                    </div>
                  </BrowserFrame>
                </div>
              </PerspectiveStage>
            </AbsoluteFill>
          </Parallax>
        </CloseUp>
      </AbsoluteFill>
    </SceneShell>
  );
};
