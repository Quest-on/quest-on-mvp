/** Quest-On v7 — InstructorGradeMock. Full-fidelity instructor grading UI for pitch video. */
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
  streaming?: boolean;
  startFrame?: number;
}

const TIMINGS = {
  thinkingStart: 0,
  thinkingDuration: 18,
  summaryMount: 16,
  summaryStreamStart: 18,
  strengthsStart: 30,
  weaknessesStart: 38,
  scoreStart: 46,
  scoreDuration: 12,
  rubricStart: 46,
  rubricDuration: 18,
} as const;

export function InstructorGradeMock({
  compact = false,
  streaming = true,
  startFrame = 0,
}: InstructorGradeMockProps): ReactElement {
  const B = QUESTON_BRAND;
  const s = SEED;

  return (
    <div
      style={{
        width: 1920,
        height: 1080,
        background: "#FAFBFC",
        fontFamily: B.fontFamily,
        color: B.ink,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      {/* ── Header bar ── */}
      <Header compact={compact} />

      {/* ── Main 2-column layout ── */}
      <div
        style={{
          flex: 1,
          display: "flex",
          gap: 14,
          padding: "16px 20px",
          minHeight: 0,
        }}
      >
        {/* Left column 58% */}
        <LeftColumn />

        {/* Right column 42% */}
        <RightColumn streaming={streaming} startFrame={startFrame} />
      </div>
    </div>
  );
}

// ── Header ─────────────────────────────────────────────────────────────────

function Header({ compact }: { compact: boolean }): ReactElement {
  const B = QUESTON_BRAND;
  const s = SEED;

  const outlineBtn: CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    height: 34,
    padding: "0 14px",
    borderRadius: 7,
    border: `1.5px solid ${B.border}`,
    background: "#fff",
    color: B.ink,
    fontSize: 13,
    fontWeight: 500,
    fontFamily: B.fontFamily,
    letterSpacing: "-0.01em",
    cursor: "pointer",
    whiteSpace: "nowrap" as const,
  };

  const primaryBtn: CSSProperties = {
    ...outlineBtn,
    background: B.primary,
    border: `1.5px solid ${B.primary}`,
    color: "#fff",
    fontWeight: 600,
  };

  return (
    <div
      style={{
        height: 56,
        background: "#fff",
        borderBottom: "1px solid rgba(0,0,0,0.07)",
        display: "flex",
        alignItems: "center",
        padding: "0 24px",
        gap: 0,
        flexShrink: 0,
      }}
    >
      {/* Back nav */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          color: B.inkMuted,
          fontSize: 14,
          fontWeight: 500,
          cursor: "pointer",
          marginRight: 24,
        }}
      >
        <span style={{ fontSize: 16 }}>←</span>
        <span>채점 결과</span>
      </div>

      {/* Divider */}
      <div style={{ width: 1, height: 20, background: B.border, marginRight: 24 }} />

      {/* Student + exam info */}
      <div style={{ flex: 1, display: "flex", alignItems: "baseline", gap: 10 }}>
        <span style={{ fontSize: 17, fontWeight: 700, letterSpacing: "-0.02em" }}>
          {s.student.name}
        </span>
        <span
          style={{
            fontSize: 13,
            color: B.inkMuted,
            letterSpacing: "-0.01em",
          }}
        >
          {s.exam.title}
        </span>
        <span
          style={{
            fontSize: 12,
            color: B.inkMuted,
            fontFamily: B.fontFamilyMono,
            background: "#F4F4F5",
            padding: "2px 7px",
            borderRadius: 5,
          }}
        >
          {s.exam.code}
        </span>
      </div>

      {/* Actions */}
      <div style={{ display: "flex", gap: 8 }}>
        <div style={outlineBtn}>재채점</div>
        <div style={primaryBtn}>저장</div>
      </div>
    </div>
  );
}

// ── Left column ─────────────────────────────────────────────────────────────

function LeftColumn(): ReactElement {
  const B = QUESTON_BRAND;
  const s = SEED;

  const cardStyle: CSSProperties = {
    background: "#fff",
    border: "1px solid rgba(0,0,0,0.06)",
    borderRadius: 12,
    boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
    padding: "18px 20px",
  };

  const labelStyle: CSSProperties = {
    fontSize: 11,
    fontWeight: 600,
    textTransform: "uppercase" as const,
    letterSpacing: "0.07em",
    color: B.inkMuted,
    marginBottom: 10,
  };

  return (
    <div
      style={{
        flex: "0 0 58%",
        display: "flex",
        flexDirection: "column",
        gap: 10,
        minHeight: 0,
      }}
    >
      {/* Question card */}
      <div style={cardStyle}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
          <span
            style={{
              background: B.primary,
              color: "#fff",
              fontSize: 12,
              fontWeight: 700,
              padding: "3px 10px",
              borderRadius: 20,
              letterSpacing: "-0.01em",
            }}
          >
            문제 {s.question.number}
          </span>
          <span
            style={{
              fontSize: 12,
              color: B.inkMuted,
              fontWeight: 500,
            }}
          >
            {s.question.type} · 배점 {s.question.points}점
          </span>
        </div>
        <p
          style={{
            margin: 0,
            fontSize: 15,
            lineHeight: 1.65,
            color: B.ink,
            fontWeight: 500,
          }}
        >
          {s.question.text}
        </p>
      </div>

      {/* Student answer card */}
      <div style={{ ...cardStyle }}>
        <div style={labelStyle}>최종 답안</div>
        <p
          style={{
            margin: 0,
            fontSize: 14,
            lineHeight: 1.6,
            color: "#374151",
            whiteSpace: "pre-wrap",
          }}
        >
          {s.student.answer}
        </p>
      </div>

      {/* Highlight quotes card */}
      <div
        style={{
          background: "rgba(254,252,232,0.7)",
          border: "1px solid rgba(250,204,21,0.3)",
          borderLeft: "3px solid #F59E0B",
          borderRadius: 10,
          padding: "14px 16px",
        }}
      >
        <div
          style={{
            fontSize: 12,
            fontWeight: 700,
            color: "#92400E",
            marginBottom: 10,
            letterSpacing: "0.02em",
          }}
        >
          ❝ 핵심 인용구
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {s.aiSummary.quotes.map((q, i) => (
            <div
              key={i}
              style={{
                fontSize: 13,
                lineHeight: 1.6,
                color: "#78350F",
                fontStyle: "italic",
                paddingLeft: 2,
              }}
            >
              "{q}..."
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Right column ─────────────────────────────────────────────────────────────

interface RightColumnProps {
  streaming: boolean;
  startFrame: number;
}

function RightColumn({ streaming, startFrame }: RightColumnProps): ReactElement {
  const B = QUESTON_BRAND;
  const s = SEED;
  const frame = useCurrentFrame();
  const local = frame - startFrame;

  const cardStyle: CSSProperties = {
    background: "#fff",
    border: "1px solid rgba(0,0,0,0.06)",
    borderRadius: 12,
    boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
  };

  return (
    <div
      style={{
        flex: "0 0 42%",
        display: "flex",
        flexDirection: "column",
        gap: 10,
        minHeight: 0,
      }}
    >
      {/* AI Summary card */}
      <div
        style={{
          ...cardStyle,
          flex: 1,
          display: "flex",
          flexDirection: "column",
          minHeight: 0,
        }}
      >
        {/* Card header */}
        <div
          style={{
            padding: "14px 18px",
            borderBottom: "1px solid rgba(0,0,0,0.05)",
            display: "flex",
            alignItems: "center",
            gap: 8,
            flexShrink: 0,
          }}
        >
          <span style={{ fontSize: 16 }}>✨</span>
          <span
            style={{
              fontSize: 15,
              fontWeight: 700,
              letterSpacing: "-0.02em",
            }}
          >
            AI 종합 평가
          </span>
          {streaming && (
            <AIThinking
              startFrame={startFrame + TIMINGS.thinkingStart}
              durationFrames={TIMINGS.thinkingDuration + 6}
            />
          )}
        </div>

        {/* Summary body */}
        <div style={{ padding: "16px 18px", flex: 1, display: "flex", flexDirection: "column", gap: 14, minHeight: 0 }}>
          {/* Summary paragraph */}
          <SummaryParagraph streaming={streaming} startFrame={startFrame} />

          {/* Strengths / Weaknesses 2-col grid */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, flexShrink: 0 }}>
            <FadeBlock
              startFrame={startFrame + TIMINGS.strengthsStart}
              streaming={streaming}
              background="rgba(239,246,255,0.7)"
              border="1px solid rgba(191,219,254,0.8)"
              accentColor="#2563EB"
              label="+ 강점"
              items={s.aiSummary.strengths as readonly string[]}
              bulletColor="#3B82F6"
            />
            <FadeBlock
              startFrame={startFrame + TIMINGS.weaknessesStart}
              streaming={streaming}
              background="rgba(255,247,237,0.7)"
              border="1px solid rgba(253,186,116,0.4)"
              accentColor="#EA580C"
              label="− 개선점"
              items={s.aiSummary.weaknesses as readonly string[]}
              bulletColor="#F97316"
            />
          </div>
        </div>
      </div>

      {/* Rubric + score section */}
      <div style={{ ...cardStyle, padding: "16px 18px", flexShrink: 0 }}>
        <div
          style={{
            fontSize: 11,
            fontWeight: 700,
            textTransform: "uppercase" as const,
            letterSpacing: "0.07em",
            color: B.inkMuted,
            marginBottom: 14,
          }}
        >
          채점 결과
        </div>

        {/* Rubric rows */}
        <div style={{ display: "flex", flexDirection: "column", gap: 11, marginBottom: 16 }}>
          {s.rubric.map((r) => (
            <RubricRow
              key={r.area}
              area={r.area}
              score={r.score}
              streaming={streaming}
              startFrame={startFrame}
            />
          ))}
        </div>

        {/* Final score strip */}
        <FinalScoreStrip streaming={streaming} startFrame={startFrame} />
      </div>
    </div>
  );
}

// ── Summary paragraph ────────────────────────────────────────────────────────

function SummaryParagraph({ streaming, startFrame }: { streaming: boolean; startFrame: number }): ReactElement {
  const frame = useCurrentFrame();
  const local = frame - startFrame;

  const mountIn = streaming
    ? interpolate(local, [TIMINGS.summaryMount, TIMINGS.summaryMount + 6], [0, 1], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
        easing: EASING.smoothOut,
      })
    : 1;

  return (
    <div
      style={{
        opacity: mountIn,
        transform: `translateY(${(1 - mountIn) * 5}px)`,
        flexShrink: 0,
      }}
    >
      <div
        style={{
          fontSize: 11,
          fontWeight: 700,
          textTransform: "uppercase" as const,
          letterSpacing: "0.07em",
          color: QUESTON_BRAND.inkMuted,
          marginBottom: 8,
        }}
      >
        종합 의견
      </div>
      <p
        style={{
          margin: 0,
          fontSize: 14,
          lineHeight: 1.7,
          color: "#1F2937",
          minHeight: 72,
        }}
      >
        {streaming ? (
          <StreamingText
            text={SEED_AI_SUMMARY_FULL}
            startFrame={startFrame + TIMINGS.summaryStreamStart}
            charsPerSecond={42}
            cursorColor={QUESTON_BRAND.primary}
          />
        ) : (
          SEED_AI_SUMMARY_FULL
        )}
      </p>
    </div>
  );
}

// ── FadeBlock (strengths / weaknesses) ───────────────────────────────────────

interface FadeBlockProps {
  startFrame: number;
  streaming: boolean;
  background: string;
  border: string;
  accentColor: string;
  label: string;
  items: readonly string[];
  bulletColor: string;
}

function FadeBlock({
  startFrame,
  streaming,
  background,
  border,
  accentColor,
  label,
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
        padding: "12px 14px",
        opacity: mount,
        transform: `translateY(${(1 - mount) * 5}px)`,
      }}
    >
      <div
        style={{
          color: accentColor,
          fontWeight: 700,
          fontSize: 12,
          marginBottom: 8,
          letterSpacing: "0.01em",
        }}
      >
        {label}
      </div>
      {items.map((x, i) => {
        const itemMount = streaming
          ? interpolate(local, [6 + i * 5, 14 + i * 5], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: EASING.smoothOut,
            })
          : 1;
        return (
          <div
            key={i}
            style={{
              fontSize: 12,
              lineHeight: 1.55,
              marginBottom: i < items.length - 1 ? 5 : 0,
              opacity: itemMount,
              transform: `translateX(${(1 - itemMount) * 5}px)`,
              color: "#374151",
              display: "flex",
              alignItems: "flex-start",
              gap: 6,
            }}
          >
            <span style={{ color: bulletColor, marginTop: 2, flexShrink: 0 }}>•</span>
            <span>{x}</span>
          </div>
        );
      })}
    </div>
  );
}

// ── Rubric row ───────────────────────────────────────────────────────────────

interface RubricRowProps {
  area: string;
  score: number;
  streaming: boolean;
  startFrame: number;
}

function RubricRow({ area, score, streaming, startFrame }: RubricRowProps): ReactElement {
  const B = QUESTON_BRAND;

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "90px 1fr 44px",
        gap: 10,
        alignItems: "center",
      }}
    >
      <span
        style={{
          fontSize: 13,
          fontWeight: 500,
          color: B.ink,
          whiteSpace: "nowrap" as const,
        }}
      >
        {area}
      </span>

      {streaming ? (
        <ProgressBarFill
          startFrame={startFrame + TIMINGS.rubricStart}
          durationFrames={TIMINGS.rubricDuration}
          targetPercent={score}
          height={8}
        />
      ) : (
        <div
          style={{
            height: 8,
            background: "#F1F5F9",
            borderRadius: 4,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              width: `${score}%`,
              height: "100%",
              background: B.brandGradient,
              borderRadius: 4,
            }}
          />
        </div>
      )}

      <span
        style={{
          fontSize: 13,
          fontWeight: 700,
          color: B.ink,
          textAlign: "right" as const,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {streaming ? (
          <ScoreCounter
            startFrame={startFrame + TIMINGS.rubricStart}
            durationFrames={TIMINGS.rubricDuration}
            targetValue={score}
            fontSize={13}
            fontWeight={700}
          />
        ) : (
          score
        )}
      </span>
    </div>
  );
}

// ── Final score strip ────────────────────────────────────────────────────────

function FinalScoreStrip({ streaming, startFrame }: { streaming: boolean; startFrame: number }): ReactElement {
  const B = QUESTON_BRAND;
  const s = SEED;
  const frame = useCurrentFrame();
  const local = frame - startFrame;

  const scoreMount = streaming
    ? interpolate(local, [TIMINGS.scoreStart, TIMINGS.scoreStart + 6], [0, 1], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
        easing: EASING.smoothOut,
      })
    : 1;

  return (
    <div
      style={{
        background: B.primary,
        borderRadius: 10,
        padding: "12px 18px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        opacity: scoreMount,
        transform: `translateY(${(1 - scoreMount) * 4}px)`,
      }}
    >
      <span
        style={{
          fontSize: 13,
          fontWeight: 600,
          color: "rgba(255,255,255,0.80)",
          letterSpacing: "-0.01em",
        }}
      >
        최종 점수
      </span>

      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          gap: 4,
        }}
      >
        <span
          style={{
            color: "#fff",
            fontVariantNumeric: "tabular-nums",
            lineHeight: 1,
          }}
        >
          {streaming ? (
            <ScoreCounter
              startFrame={startFrame + TIMINGS.scoreStart}
              durationFrames={TIMINGS.scoreDuration}
              targetValue={s.finalScore}
              fontSize={36}
              fontWeight={800}
            />
          ) : (
            <span style={{ fontSize: 36, fontWeight: 800 }}>{s.finalScore}</span>
          )}
        </span>
        <span style={{ fontSize: 14, fontWeight: 500, color: "rgba(255,255,255,0.65)" }}>
          / 100
        </span>
      </div>
    </div>
  );
}
