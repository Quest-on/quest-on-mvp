import type { ReactElement } from "react";
import {
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import {
  GradientMesh,
  Kicker,
  Parallax,
  PerspectiveStage,
  SceneShell,
  TitleBlock,
} from "../components";
import { COLORS, EASING, SCENE_DURATIONS, SPRINGS } from "../constants";
import { scenes } from "../script";

const PANEL_START_FRAMES = [28, 48, 68];

export const EvidenceScene: React.FC = (): ReactElement => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const duration = SCENE_DURATIONS.evidence;

  // Title block: gentle fade+up in the first 24 frames.
  const titleEnter = interpolate(frame, [0, 24], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASING.smoothOut,
  });

  // Final pulse window (last 40 frames) for accent dots.
  const pulseLocal = Math.max(0, frame - (duration - 40));
  const pulse = interpolate(
    Math.sin((pulseLocal / 40) * Math.PI * 2 * 1.5),
    [-1, 1],
    [0.7, 1.0],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    },
  );

  return (
    <SceneShell variant="dark" showProgress>
      <GradientMesh tone="cool" intensity={0.7} />
      <Parallax
        startFrame={0}
        durationFrames={duration}
        fromScale={1.0}
        toScale={1.02}
      >
        <div
          style={{
            position: "absolute",
            left: 120,
            top: 108,
            opacity: titleEnter,
            transform: `translateY(${(1 - titleEnter) * 24}px)`,
          }}
        >
          <Kicker>{scenes.evidence.kicker}</Kicker>
          <TitleBlock
            title={scenes.evidence.title}
            highlight={scenes.evidence.highlight}
            size="lg"
            align="left"
          />
        </div>

        <div
          style={{
            position: "absolute",
            left: 116,
            right: 116,
            bottom: 118,
            // Pull grid below the headline so the centred z=80 panel can't
            // poke into "답안 뒤의 과정을 남깁니다".
            top: 420,
          }}
        >
          <PerspectiveStage
            perspective={1100}
            originX="50%"
            originY="50%"
          >
            <div
              style={{
                position: "absolute",
                inset: 0,
                display: "grid",
                gridTemplateColumns: "repeat(3, 1fr)",
                gap: 28,
                transformStyle: "preserve-3d",
              }}
            >
              {scenes.evidence.panels.map((panel, index) => {
            const panelStart = PANEL_START_FRAMES[index] ?? 28;
            const panelEnter = spring({
              frame: frame - panelStart,
              fps,
              config: SPRINGS.smooth,
            });
            const panelOpacity = interpolate(
              frame,
              [panelStart, panelStart + 18],
              [0, 1],
              {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
                easing: EASING.smoothOut,
              },
            );
            const panelTranslate = (1 - panelEnter) * 60;
            const panelScale = interpolate(panelEnter, [0, 1], [0.86, 1.0], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            });
            const panelDepth = index === 1 ? 80 : 0;

            // Pulse only in final 40f, scoped to this panel's accent.
            const accentOpacity =
              frame >= duration - 40 ? pulse : 1;

            return (
              <div
                key={panel.title}
                style={{
                  minHeight: 410,
                  padding: 34,
                  borderRadius: 26,
                  border: `1px solid ${panel.color}66`,
                  // Glass depth + per-panel hue tint so each card has its own identity.
                  background: `linear-gradient(to bottom, ${panel.color}14 0%, ${panel.color}06 50%, rgba(255,255,255,0.0) 100%), rgba(15,23,42,0.86)`,
                  boxShadow: `0 24px 80px rgba(0,0,0,0.36), inset 0 1px 0 rgba(255,255,255,0.12), 0 0 0 1px ${panel.color}10`,
                  opacity: panelOpacity,
                  transform: `translateY(${panelTranslate}px) translateZ(${panelDepth}px) scale(${panelScale})`,
                  transformStyle: "preserve-3d",
                  willChange: "transform, opacity",
                }}
              >
                <div
                  style={{
                    color: panel.color,
                    fontSize: 24,
                    fontWeight: 950,
                    letterSpacing: "-0.01em",
                    opacity: accentOpacity,
                  }}
                >
                  {panel.metric}
                </div>
                <div
                  style={{
                    marginTop: 26,
                    fontSize: 42,
                    fontWeight: 950,
                    lineHeight: 1.1,
                    color: COLORS.ink,
                    letterSpacing: "-0.02em",
                  }}
                >
                  {panel.title}
                </div>
                <div
                  style={{
                    marginTop: 18,
                    color: COLORS.muted,
                    fontSize: 27,
                    lineHeight: 1.4,
                    fontWeight: 650,
                  }}
                >
                  {panel.body}
                </div>
                <div style={{ marginTop: 34 }}>
                  {panel.preview.map((line, previewIndex) => {
                    const lineStart = panelStart + 22 + previewIndex * 14;
                    const lineProgress = interpolate(
                      frame,
                      [lineStart, lineStart + 18],
                      [0, 1],
                      {
                        extrapolateLeft: "clamp",
                        extrapolateRight: "clamp",
                        easing: EASING.smoothOut,
                      },
                    );
                    const lineOpacity = 0.52 + lineProgress * 0.48;
                    const lineTranslate = (1 - lineProgress) * 22;
                    const isFirst = previewIndex === 0;

                    return (
                      <div
                        key={line}
                        style={{
                          marginBottom: 14,
                          padding: "14px 16px",
                          borderRadius: 14,
                          border: `1px solid ${panel.color}44`,
                          background: `${panel.color}16`,
                          color: isFirst ? COLORS.ink : COLORS.muted,
                          fontSize: 20,
                          fontWeight: 800,
                          lineHeight: 1.4,
                          opacity: lineOpacity,
                          transform: `translateX(${lineTranslate}px)`,
                          willChange: "transform, opacity",
                        }}
                      >
                        <span
                          style={{
                            color: panel.color,
                            marginRight: 10,
                            opacity: accentOpacity,
                          }}
                        >
                          •
                        </span>
                        {line}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
            </div>
          </PerspectiveStage>
        </div>
      </Parallax>
    </SceneShell>
  );
};
