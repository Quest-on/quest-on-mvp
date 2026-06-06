import type { CSSProperties, ReactElement } from "react";
import { interpolate, useCurrentFrame } from "remotion";
import { EASING } from "../../quest-on-demo/constants";
import { QUESTON_BRAND } from "../brand";
import { SEED, SEED_AI_SUMMARY_FULL } from "../seed";
import { AIThinking } from "./AIThinking";
import { ProgressBarFill } from "./ProgressBarFill";
import { ScoreCounter } from "./ScoreCounter";
import { StreamingText } from "./StreamingText";

export interface InstructorGradeMockProps {
  compact?: boolean;
  // When true, the AI summary, score, and rubric all animate in as if AI is
  // computing them live. Default true. Set false in static contexts (UIMontage).
  streaming?: boolean;
  // Master frame offset; lets the parent caller delay the entire sequence.
  startFrame?: number;
}

// Scripted timeline (frames are local to this mock):
//   0   : header only, AI 분석 중 visible.
//   30  : summary card mounts, "종합 의견" typewriter starts.
//   45  : strengths card fades in (item-by-item stagger).
//   55  : weaknesses card fades in.
//   65  : final score 0 → target count-up (15 frames).
//   65  : rubric bars 0 → target fill (24 frames).
//   85+ : hold + subtle breathing.
const TIMINGS = {
  thinkingStart: 0,
  thinkingDuration: 30,
  summaryMount: 30,
  summaryStreamStart: 32,
  strengthsStart: 45,
  weaknessesStart: 55,
  scoreStart: 65,
  scoreDuration: 15,
  rubricStart: 65,
  rubricDuration: 24,
} as const;

// Inline JSX recreation of app/(app)/instructor/[examId]/grade/[studentId]/page.tsx
// + AIOverallSummary.tsx. v7 layers a "live AI grading" sequence on top of the
// v6 layout: thinking label → streaming summary → strengths/weaknesses fade-in →
// score count-up → rubric bar fill.
export function InstructorGradeMock({
  compact = false,
  streaming = true,
  startFrame = 0,
}: InstructorGradeMockProps): ReactElement {
  const B = QUESTON_BRAND;
  const s = SEED;
  const padOuter = compact ? 36 : 48;

  const primaryBtn: CSSProperties = {
    background: B.primary,
    color: "#fff",
    border: "none",
    height: 36,
    padding: "0 14px",
    borderRadius: 8,
    fontSize: 13,
    fontWeight: 600,
    fontFamily: B.fontFamily,
  };
  const outlineBtn: CSSProperties = {
    background: "#fff",
    color: B.ink,
    border: `1px solid ${B.border}`,
    height: 36,
    padding: "0 14px",
    borderRadius: 8,
    fontSize: 13,
    fontWeight: 500,
    fontFamily: B.fontFamily,
  };

  return (
    <div
      style={{
        width: 1920,
        height: 1080,
        background: compact ? "#F8FAFB" : "#FAFAFA",
        padding: padOuter,
        fontFamily: B.fontFamily,
        color: B.ink,
        display: "flex",
        flexDirection: "column",
        gap: 24,
        boxShadow: compact
          ? "inset 0 0 0 1px rgba(15,23,42,0.05)"
          : undefined,
      }}
    >
      {/* Grade header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 700, margin: 0 }}>
            채점: {s.student.name}
          </h1>
          <p style={{ color: B.inkMuted, fontSize: 14, marginTop: 4 }}>
            {s.exam.title} · 시험 코드{" "}
            <span style={{ fontFamily: B.fontFamilyMono }}>{s.exam.code}</span>
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button style={outlineBtn}>재채점</button>
          <button style={primaryBtn}>저장</button>
        </div>
      </div>

      {/* AI 종합 평가 card */}
      <SummaryCard
        streaming={streaming}
        startFrame={startFrame}
      />

      {/* Rubric + final score card */}
      <RubricScoreCard
        streaming={streaming}
        startFrame={startFrame}
      />
    </div>
  );
}

interface SectionProps {
  streaming: boolean;
  startFrame: number;
}

function SummaryCard({ streaming, startFrame }: SectionProps): ReactElement {
  const B = QUESTON_BRAND;
  const s = SEED;
  const frame = useCurrentFrame();
  const local = frame - startFrame;

  // Subtle iridescent border ramp while AI is thinking.
  const borderGlow = streaming
    ? interpolate(local, [0, TIMINGS.thinkingDuration], [0.45, 0.10], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      })
    : 0.10;

  // Strengths & weaknesses items use staggered fade-ins.
  const strengthsItems = s.aiSummary.strengths;
  const weaknessesItems = s.aiSummary.weaknesses;

  return (
    <div
      style={{
        background: "#fff",
        border: "2px solid rgba(53,89,196,0.10)",
        borderRadius: 14,
        overflow: "hidden",
        boxShadow: streaming
          ? `0 0 0 1px rgba(53,89,196,${borderGlow.toFixed(3)})`
          : undefined,
      }}
    >
      <div
        style={{
          background: "rgba(245,245,245,0.4)",
          padding: "16px 24px",
          display: "flex",
          alignItems: "center",
          gap: 12,
        }}
      >
        <span style={{ fontSize: 18, fontWeight: 600 }}>AI 종합 평가</span>
        {streaming ? (
          <AIThinking
            startFrame={startFrame + TIMINGS.thinkingStart}
            durationFrames={TIMINGS.thinkingDuration + 6}
          />
        ) : null}
      </div>
      <div
        style={{
          padding: 24,
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 24,
        }}
      >
        <div>
          <div
            style={{
              fontSize: 12,
              color: B.inkMuted,
              textTransform: "uppercase",
              letterSpacing: 1,
              fontWeight: 600,
              marginBottom: 8,
            }}
          >
            종합 의견
          </div>
          {streaming ? (
            <SummaryParagraph startFrame={startFrame} />
          ) : (
            <p
              style={{
                fontSize: 15,
                lineHeight: 1.625,
                color: "#1F2937",
                margin: 0,
              }}
            >
              {s.aiSummary.summary}
            </p>
          )}
          <div
            style={{
              marginTop: 20,
              background: "rgba(254,252,232,0.5)",
              border: "1px solid #FEF9C3",
              borderRadius: 10,
              padding: 16,
            }}
          >
            <div
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: "#A16207",
                marginBottom: 10,
              }}
            >
              ❝ 핵심 인용구 (Highlight)
            </div>
            {s.aiSummary.quotes.map((q, i) => (
              <div
                key={i}
                style={{
                  fontStyle: "italic",
                  color: "#374151",
                  paddingLeft: 12,
                  fontSize: 14,
                  lineHeight: 1.6,
                  marginBottom: 6,
                }}
              >
                <span style={{ color: "#FACC15", fontSize: 22 }}>“</span>
                {q}
                <span style={{ color: "#FACC15", fontSize: 22 }}>”</span>
              </div>
            ))}
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateRows: "1fr 1fr", gap: 16 }}>
          <FadeBlock
            startFrame={startFrame + TIMINGS.strengthsStart}
            streaming={streaming}
            background="rgba(239,246,255,0.5)"
            border="1px solid #DBEAFE"
            label="+ 강점"
            labelColor="#1D4ED8"
            items={strengthsItems as readonly string[]}
            bulletColor="#60A5FA"
          />
          <FadeBlock
            startFrame={startFrame + TIMINGS.weaknessesStart}
            streaming={streaming}
            background="rgba(255,247,237,0.5)"
            border="1px solid #FFEDD5"
            label="− 개선점"
            labelColor="#C2410C"
            items={weaknessesItems as readonly string[]}
            bulletColor="#FB923C"
          />
        </div>
      </div>
    </div>
  );
}

function SummaryParagraph({ startFrame }: { startFrame: number }): ReactElement {
  const frame = useCurrentFrame();
  const local = frame - startFrame;
  const mountIn = interpolate(
    local,
    [TIMINGS.summaryMount, TIMINGS.summaryMount + 6],
    [0, 1],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: EASING.smoothOut,
    },
  );
  return (
    <p
      style={{
        fontSize: 15,
        lineHeight: 1.625,
        color: "#1F2937",
        margin: 0,
        opacity: mountIn,
        transform: `translateY(${(1 - mountIn) * 6}px)`,
        minHeight: 96,
      }}
    >
      <StreamingText
        text={SEED_AI_SUMMARY_FULL}
        startFrame={startFrame + TIMINGS.summaryStreamStart}
        charsPerSecond={42}
        cursorColor={QUESTON_BRAND.primary}
      />
    </p>
  );
}

interface FadeBlockProps {
  startFrame: number;
  streaming: boolean;
  background: string;
  border: string;
  label: string;
  labelColor: string;
  items: readonly string[];
  bulletColor: string;
}

function FadeBlock({
  startFrame,
  streaming,
  background,
  border,
  label,
  labelColor,
  items,
  bulletColor,
}: FadeBlockProps): ReactElement {
  const frame = useCurrentFrame();
  const local = frame - startFrame;
  const mount = streaming
    ? interpolate(local, [0, 8], [0, 1], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
        easing: EASING.smoothOut,
      })
    : 1;

  return (
    <div
      style={{
        background,
        border,
        borderRadius: 10,
        padding: 16,
        opacity: mount,
        transform: `translateY(${(1 - mount) * 6}px)`,
      }}
    >
      <div
        style={{
          color: labelColor,
          fontWeight: 600,
          fontSize: 14,
          marginBottom: 10,
        }}
      >
        {label}
      </div>
      {items.map((x, i) => {
        const itemMount = streaming
          ? interpolate(local, [6 + i * 6, 14 + i * 6], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: EASING.smoothOut,
            })
          : 1;
        return (
          <div
            key={i}
            style={{
              fontSize: 13,
              marginBottom: 4,
              opacity: itemMount,
              transform: `translateX(${(1 - itemMount) * 6}px)`,
            }}
          >
            <span style={{ color: bulletColor, marginRight: 6 }}>•</span>
            {x}
          </div>
        );
      })}
    </div>
  );
}

function RubricScoreCard({
  streaming,
  startFrame,
}: SectionProps): ReactElement {
  const B = QUESTON_BRAND;
  const s = SEED;
  return (
    <div
      style={{
        background: "#fff",
        border: `1px solid ${B.border}`,
        borderRadius: 14,
        padding: 24,
        display: "flex",
        gap: 32,
        alignItems: "center",
      }}
    >
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          gap: 14,
        }}
      >
        {s.rubric.map((r) => (
          <div
            key={r.area}
            style={{
              display: "grid",
              gridTemplateColumns: "120px 1fr 60px",
              gap: 12,
              alignItems: "center",
            }}
          >
            <span style={{ fontSize: 14, fontWeight: 500 }}>{r.area}</span>
            {streaming ? (
              <ProgressBarFill
                startFrame={startFrame + TIMINGS.rubricStart}
                durationFrames={TIMINGS.rubricDuration}
                targetPercent={r.score}
              />
            ) : (
              <div
                style={{
                  height: 10,
                  background: "#F1F5F9",
                  borderRadius: 5,
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    width: `${r.score}%`,
                    height: "100%",
                    background: B.brandGradient,
                    borderRadius: 5,
                  }}
                />
              </div>
            )}
            <span
              style={{
                fontSize: 14,
                fontWeight: 600,
                textAlign: "right",
              }}
            >
              {streaming ? (
                <ScoreCounter
                  startFrame={startFrame + TIMINGS.rubricStart}
                  durationFrames={TIMINGS.rubricDuration}
                  targetValue={r.score}
                  fontSize={14}
                  fontWeight={600}
                />
              ) : (
                r.score
              )}
            </span>
          </div>
        ))}
      </div>
      <div
        style={{
          background: B.primary,
          color: "#fff",
          padding: "16px 24px",
          borderRadius: 12,
          textAlign: "center",
          minWidth: 160,
        }}
      >
        <div style={{ fontSize: 12, opacity: 0.8 }}>최종 점수</div>
        <div style={{ fontSize: 38, fontWeight: 800, lineHeight: 1 }}>
          {streaming ? (
            <ScoreCounter
              startFrame={startFrame + TIMINGS.scoreStart}
              durationFrames={TIMINGS.scoreDuration}
              targetValue={s.finalScore}
              fontSize={38}
              fontWeight={800}
            />
          ) : (
            s.finalScore
          )}
        </div>
        <div style={{ fontSize: 12, opacity: 0.8 }}>/ 100</div>
      </div>
    </div>
  );
}
