/** Quest-On student exam-taking UI mock — v7 redesign. */
import type { ReactElement } from "react";
import { useCurrentFrame } from "remotion";
import { QUESTON_BRAND } from "../brand";
import { SEED, SEED_STUDENT_TYPING_ANSWER } from "../seed";
import { StreamingText } from "./StreamingText";

export interface StudentExamMockProps {
  compact?: boolean;
  visibleChatCount?: number;
  streaming?: boolean;
  startFrame?: number;
  showAnswerTyping?: boolean;
}

// Local frame offsets for the scripted chat sequence
const T = {
  studentMsg1: 8,
  aiMount: 22,
  aiStream: 28,
  studentMsg2: 60,
  aiMount2: 72,
  aiStream2: 76,
  studentMsg3: 96,
  answerStart: 40,
  answerCps: 26,
  aiCps: 60,
} as const;

export function StudentExamMock({
  compact = false,
  visibleChatCount,
  streaming = true,
  startFrame = 0,
  showAnswerTyping,
}: StudentExamMockProps): ReactElement {
  const B = QUESTON_BRAND;
  const s = SEED;
  const frame = useCurrentFrame();
  const local = frame - startFrame;
  const cap = Math.min(s.chat.length, visibleChatCount ?? s.chat.length);
  const useAnswerTyping = showAnswerTyping ?? streaming;

  // Gentle pulse on the live dot
  const liveDotOpacity = 1;

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
      {/* ── Header ─────────────────────────────────────────────── */}
      <div
        style={{
          height: 52,
          flexShrink: 0,
          background: "#FFFFFF",
          borderBottom: "1px solid #E5E7EB",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 28px",
        }}
      >
        {/* Logo */}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span
            style={{
              width: 10,
              height: 10,
              borderRadius: "50%",
              background: B.brandGradient,
              flexShrink: 0,
            }}
          />
          <span
            style={{
              fontSize: 16,
              fontWeight: 700,
              color: B.primary,
              letterSpacing: "-0.3px",
            }}
          >
            Quest-On
          </span>
        </div>

        {/* Center cluster */}
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          {/* Timer pill */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              background: "#EFF6FF",
              border: "1px solid #BFDBFE",
              borderRadius: 999,
              padding: "5px 14px",
              fontSize: 14,
              fontWeight: 600,
              color: "#1D4ED8",
              fontFamily: B.fontFamilyMono,
            }}
          >
            <span style={{ fontSize: 13 }}>⏱</span>
            {s.exam.timeRemaining}
          </div>

          {/* Divider */}
          <span style={{ color: "#D1D5DB", fontSize: 16 }}>·</span>

          {/* Exam code */}
          <span style={{ fontSize: 13, color: B.inkMuted }}>
            시험 코드{" "}
            <span
              style={{
                fontFamily: B.fontFamilyMono,
                color: "#374151",
                fontWeight: 600,
                letterSpacing: "0.04em",
              }}
            >
              {s.exam.code}
            </span>
          </span>
        </div>

        {/* Submit button */}
        <button
          style={{
            background: B.primary,
            color: "#fff",
            border: "none",
            borderRadius: 8,
            padding: "8px 22px",
            fontSize: 14,
            fontWeight: 600,
            cursor: "pointer",
            letterSpacing: "0.01em",
            boxShadow: "0 1px 3px rgba(53,89,196,0.30)",
          }}
        >
          제출
        </button>
      </div>

      {/* ── Body: left 57% | right 43% ─────────────────────────── */}
      <div
        style={{
          flex: 1,
          display: "flex",
          minHeight: 0,
        }}
      >
        {/* ── LEFT PANEL ─────────────────────────────────────────── */}
        <div
          style={{
            width: "57%",
            flexShrink: 0,
            borderRight: "1px solid #E5E7EB",
            display: "flex",
            flexDirection: "column",
            padding: compact ? "16px 18px" : "20px 24px",
            gap: 14,
          }}
        >
          {/* Question header row */}
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span
              style={{
                background: "#EEF2FF",
                color: B.primary,
                border: "1px solid #C7D2FE",
                borderRadius: 999,
                padding: "4px 14px",
                fontSize: 13,
                fontWeight: 700,
                letterSpacing: "0.02em",
              }}
            >
              문제 {s.question.number}
            </span>
            <span style={{ fontSize: 13, color: B.inkMuted }}>
              {s.question.type} · 배점{" "}
              <span style={{ color: "#374151", fontWeight: 600 }}>
                {s.question.points}점
              </span>
            </span>
          </div>

          {/* Question card */}
          <div
            style={{
              background: "#FFFFFF",
              border: "1px solid #E5E7EB",
              borderRadius: 12,
              padding: "20px 22px",
              boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
              flexShrink: 0,
            }}
          >
            <p
              style={{
                margin: 0,
                fontSize: 16,
                lineHeight: 1.7,
                color: B.ink,
                fontWeight: 400,
              }}
            >
              {s.question.text}
            </p>
          </div>

          {/* Divider — dashed, light */}
          <div
            style={{
              borderTop: "1px dashed #D1D5DB",
              flexShrink: 0,
            }}
          />

          {/* Answer section label */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              flexShrink: 0,
            }}
          >
            <span
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: B.inkMuted,
                letterSpacing: "0.01em",
              }}
            >
              답안 작성
            </span>
          </div>

          {/* Answer card */}
          <div
            style={{
              background: "#FFFFFF",
              border: "1px solid #E5E7EB",
              borderRadius: 12,
              boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
              flex: 1,
              padding: "20px 22px",
              overflow: "hidden",
              position: "relative",
            }}
          >
            <p
              style={{
                margin: 0,
                fontSize: 15,
                lineHeight: 1.6,
                color: B.ink,
                whiteSpace: "pre-wrap",
              }}
            >
              {streaming && useAnswerTyping ? (
                <StreamingText
                  text={SEED_STUDENT_TYPING_ANSWER}
                  startFrame={startFrame + T.answerStart}
                  charsPerSecond={T.answerCps}
                  cursorColor={B.primary}
                />
              ) : useAnswerTyping ? (
                <StreamingText
                  text={SEED_STUDENT_TYPING_ANSWER}
                  startFrame={startFrame + T.answerStart}
                  charsPerSecond={T.answerCps}
                  cursorColor={B.primary}
                />
              ) : (
                s.student.answer
              )}
            </p>
          </div>
        </div>

        {/* ── RIGHT PANEL: AI chat ────────────────────────────────── */}
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            background: "#FFFFFF",
          }}
        >
          {/* Chat panel header */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "14px 20px",
              borderBottom: "1px solid #F3F4F6",
              background: "#FAFAFA",
              flexShrink: 0,
            }}
          >
            <span style={{ fontSize: 16 }}>💬</span>
            <span
              style={{
                fontSize: 15,
                fontWeight: 600,
                color: "#111827",
                letterSpacing: "-0.2px",
              }}
            >
              AI 도우미
            </span>
            {streaming && (
              <span
                style={{
                  marginLeft: "auto",
                  display: "flex",
                  alignItems: "center",
                  gap: 5,
                  fontSize: 12,
                  color: B.inkMuted,
                }}
              >
                <span
                  style={{
                    width: 7,
                    height: 7,
                    borderRadius: "50%",
                    background: "#22C55E",
                    boxShadow: "0 0 6px rgba(34,197,94,0.55)",
                    opacity: liveDotOpacity,
                  }}
                />
                연결됨
              </span>
            )}
          </div>

          {/* Messages area */}
          <div
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              gap: 10,
              padding: "16px 20px 8px",
            }}
          >
            {streaming
              ? renderStreamingMessages({ cap, local, startFrame, B })
              : renderStaticMessages({ cap, B })}
          </div>

          {/* Input bar */}
          <div
            style={{
              padding: "12px 20px 16px",
              flexShrink: 0,
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                background: "#F3F4F6",
                borderRadius: 999,
                padding: "10px 14px 10px 18px",
              }}
            >
              <span style={{ flex: 1, fontSize: 14, color: "#9CA3AF" }}>
                메시지 입력...
              </span>
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: "50%",
                  background: B.primary,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                  boxShadow: "0 2px 6px rgba(53,89,196,0.30)",
                }}
              >
                <span style={{ color: "#fff", fontSize: 14, lineHeight: 1 }}>
                  ▶
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Static message rendering (streaming=false) ───────────────────────────────

function renderStaticMessages({
  cap,
  B,
}: {
  cap: number;
  B: typeof QUESTON_BRAND;
}): ReactElement[] {
  return SEED.chat.slice(0, cap).map((m, i) =>
    m.role === "student" ? (
      <StudentBubble key={i} text={m.text} time={m.time} B={B} />
    ) : (
      <AIBubble key={i} text={m.text} time={m.time} B={B} />
    ),
  );
}

// ── Streaming message rendering (scripted timeline) ──────────────────────────

function renderStreamingMessages({
  cap,
  local,
  startFrame,
  B,
}: {
  cap: number;
  local: number;
  startFrame: number;
  B: typeof QUESTON_BRAND;
}): ReactElement[] {
  const messages = SEED.chat.slice(0, cap);
  const result: ReactElement[] = [];

  // Message 0: student — pops at T.studentMsg1
  if (messages[0] && local >= T.studentMsg1) {
    result.push(
      <StudentBubble key={0} text={messages[0].text} time={messages[0].time} B={B} />,
    );
  }

  // Message 1: AI — mounts at T.aiMount, streams from T.aiStream
  if (messages[1] && local >= T.aiMount) {
    const aiStreaming = local < T.aiMount + 6;
    if (aiStreaming) {
      result.push(
        <TypingDotsRow key={1} B={B} />,
      );
    } else {
      result.push(
        <AIBubble
          key={1}
          text={messages[1].text}
          time={messages[1].time}
          B={B}
          streamStartFrame={startFrame + T.aiStream}
          cps={T.aiCps}
        />,
      );
    }
  }

  // Message 2: student — pops at T.studentMsg2
  if (messages[2] && local >= T.studentMsg2) {
    result.push(
      <StudentBubble key={2} text={messages[2].text} time={messages[2].time} B={B} />,
    );
  }

  // Message 3: AI — mounts at T.aiMount2, streams from T.aiStream2
  if (messages[3] && local >= T.aiMount2) {
    const aiStreaming2 = local < T.aiMount2 + 4;
    if (aiStreaming2) {
      result.push(<TypingDotsRow key={3} B={B} />);
    } else {
      result.push(
        <AIBubble
          key={3}
          text={messages[3].text}
          time={messages[3].time}
          B={B}
          streamStartFrame={startFrame + T.aiStream2}
          cps={T.aiCps}
        />,
      );
    }
  }

  // Message 4: student — pops at T.studentMsg3
  if (messages[4] && local >= T.studentMsg3) {
    result.push(
      <StudentBubble key={4} text={messages[4].text} time={messages[4].time} B={B} />,
    );
  }

  return result;
}

// ── Bubble sub-components ────────────────────────────────────────────────────

function StudentBubble({
  text,
  time,
  B,
}: {
  text: string;
  time: string;
  B: typeof QUESTON_BRAND;
}): ReactElement {
  return (
    <div style={{ display: "flex", justifyContent: "flex-end" }}>
      <div
        style={{
          background: B.primary,
          color: "#FFFFFF",
          maxWidth: "80%",
          borderRadius: 16,
          borderBottomRightRadius: 4,
          padding: "12px 16px",
          fontSize: 14,
          lineHeight: 1.6,
          boxShadow: "0 2px 8px rgba(53,89,196,0.22)",
        }}
      >
        <span>{text}</span>
        <div
          style={{
            fontSize: 11,
            opacity: 0.7,
            marginTop: 6,
            textAlign: "right",
            fontFamily: B.fontFamilyMono,
          }}
        >
          {time}
        </div>
      </div>
    </div>
  );
}

function AIBubble({
  text,
  time,
  B,
  streamStartFrame,
  cps,
}: {
  text: string;
  time: string;
  B: typeof QUESTON_BRAND;
  streamStartFrame?: number;
  cps?: number;
}): ReactElement {
  return (
    <div style={{ display: "flex", justifyContent: "flex-start" }}>
      <div
        style={{
          background: "#F3F4F6",
          color: "#111827",
          maxWidth: "82%",
          borderRadius: 16,
          borderBottomLeftRadius: 4,
          padding: "12px 16px",
          fontSize: 14,
          lineHeight: 1.6,
          border: "1px solid #E5E7EB",
        }}
      >
        <div
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: B.primary,
            marginBottom: 6,
            letterSpacing: "0.03em",
          }}
        >
          AI
        </div>
        {streamStartFrame != null && cps != null ? (
          <StreamingText
            text={text}
            startFrame={streamStartFrame}
            charsPerSecond={cps}
            cursorColor={B.primary}
          />
        ) : (
          <span>{text}</span>
        )}
        <div
          style={{
            fontSize: 11,
            color: B.inkMuted,
            marginTop: 6,
            fontFamily: B.fontFamilyMono,
          }}
        >
          {time}
        </div>
      </div>
    </div>
  );
}

function TypingDotsRow({
  B,
}: {
  B: typeof QUESTON_BRAND;
}): ReactElement {
  const frame = useCurrentFrame();
  const dots = [0, 1, 2].map((i) => {
    const phase = Math.sin((frame * 0.35) - i * 1.1);
    const opacity = 0.35 + (phase + 1) * 0.325;
    const translateY = (phase + 1) * -2;
    return (
      <span
        key={i}
        style={{
          display: "inline-block",
          width: 7,
          height: 7,
          borderRadius: "50%",
          background: B.inkMuted,
          opacity,
          transform: `translateY(${translateY}px)`,
          transition: "none",
        }}
      />
    );
  });

  return (
    <div style={{ display: "flex", justifyContent: "flex-start" }}>
      <div
        style={{
          background: "#F3F4F6",
          border: "1px solid #E5E7EB",
          borderRadius: 16,
          borderBottomLeftRadius: 4,
          padding: "14px 18px",
          display: "flex",
          alignItems: "center",
          gap: 5,
        }}
      >
        {dots}
      </div>
    </div>
  );
}
