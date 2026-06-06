import type { ReactElement } from "react";
import { useCurrentFrame } from "remotion";
import { QUESTON_BRAND } from "../brand";
import { SEED, SEED_STUDENT_TYPING_ANSWER } from "../seed";
import { AIChatBubble } from "./AIChatBubble";
import { StreamingText } from "./StreamingText";

export interface StudentExamMockProps {
  // When true, render at slightly tighter spacing for cube-face mounting.
  compact?: boolean;
  // Cap on how many chat messages render (still capped to 3 by SEED). Default 3.
  visibleChatCount?: number;
  // Drives the SSE chat sequence. When false, the original v6 static layout is
  // used (no streaming) — handy inside the UIMontage cycle where the slot is
  // visible only briefly.
  streaming?: boolean;
  // Master frame offset, lets a parent caller delay the entire sequence.
  startFrame?: number;
  // When true (default in streaming mode) the answer sheet types out a short
  // line as the student composes. The full SEED.student.answer is shown when
  // not streaming.
  showAnswerTyping?: boolean;
}

// Scripted SSE-style chat sequence (frames are local to this mock):
//   8   : student message #1 pops in (instant)
//   34  : AI bubble mounts → 18-frame typing indicator → typewriter
//        (text length × 30 / charsPerSecond ≈ 70 frames @ 36 cps)
//   130 : student message #2 pops in
//   148 : student answer-sheet typewriter starts (charsPerSecond 28)
const CHAT_TIMINGS = {
  studentMsg1: 8,
  aiMsgMount: 34,
  aiTypingFrames: 18,
  aiCharsPerSec: 36,
  studentMsg2: 130,
  answerStart: 148,
  answerCharsPerSec: 28,
} as const;

// Inline JSX recreation of the Quest-On student exam screen
// (app/(app)/exam/[code]/answer/page.tsx + ExamChatSidebar.tsx). v7 layers SSE
// streaming on top of the v6 layout so the cube-face transformation in Cut 11
// reveals an "AI is generating" feel instead of a frozen screenshot.
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
  const padOuter = compact ? 24 : 32;
  const padChat = compact ? 18 : 24;
  const cap = Math.min(s.chat.length, visibleChatCount ?? s.chat.length);

  // Background tint: slight off-white in compact mode prevents the cube-face
  // morph in Cut 11 from blowing out to pure #FFF.
  const surfaceBg = compact ? "#F8FAFB" : "#FAFAFA";
  const useAnswerTyping = showAnswerTyping ?? streaming;

  const headerPulse = streaming ? 0.85 + Math.sin(local * 0.12) * 0.15 : 1;
  const liveDotOpacity = streaming
    ? 0.6 + (Math.sin(local * 0.2) + 1) / 4
    : 1;

  return (
    <div
      style={{
        width: 1920,
        height: 1080,
        background: surfaceBg,
        fontFamily: B.fontFamily,
        color: B.ink,
        display: "flex",
        flexDirection: "column",
        boxShadow: compact
          ? "inset 0 0 0 1px rgba(15,23,42,0.05)"
          : undefined,
      }}
    >
      {/* ExamHeader — Quest-On logo + countdown pill + avatar */}
      <div
        style={{
          height: 56,
          padding: "8px 24px",
          background: "rgba(255,255,255,0.95)",
          borderBottom: `1px solid ${B.border}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div
            style={{
              fontWeight: 700,
              fontSize: 18,
              color: B.primary,
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <span
              style={{
                width: 14,
                height: 14,
                borderRadius: "50%",
                background: B.brandGradient,
                display: "inline-block",
              }}
            />
            Quest-On
          </div>
          <div
            style={{
              background: "#DBEAFE",
              color: "#1E40AF",
              padding: "6px 14px",
              borderRadius: 8,
              fontSize: 14,
              fontWeight: 600,
              fontFamily: B.fontFamilyMono,
            }}
          >
            ⏰ {s.exam.timeRemaining}
          </div>
          <div style={{ fontSize: 13, color: B.inkMuted }}>
            시험 코드 ·{" "}
            <span style={{ fontFamily: B.fontFamilyMono, color: B.ink }}>
              {s.exam.code}
            </span>
          </div>
        </div>
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: 999,
            background: B.primary,
            color: "#fff",
            display: "grid",
            placeItems: "center",
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          {s.student.initials}
        </div>
      </div>

      {/* Split layout 50/50 — left: question + answer, right: AI chat sidebar */}
      <div
        style={{
          flex: 1,
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          minHeight: 0,
        }}
      >
        {/* LEFT: question header + question card + A4 answer sheet */}
        <div
          style={{
            borderRight: `1px solid ${B.border}`,
            padding: padOuter,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              display: "flex",
              gap: 8,
              alignItems: "center",
              marginBottom: 16,
            }}
          >
            <span
              style={{
                background: "rgba(53,89,196,0.10)",
                color: B.primary,
                border: "1px solid rgba(53,89,196,0.20)",
                borderRadius: 999,
                padding: "6px 14px",
                fontSize: 14,
                fontWeight: 600,
              }}
            >
              문제 {s.question.number}
            </span>
            <span style={{ fontSize: 13, color: B.inkMuted }}>
              {s.question.type} 문제
            </span>
            <span style={{ fontSize: 13, color: B.inkMuted }}>
              · 배점: {s.question.points}점
            </span>
          </div>
          <div
            style={{
              background: "#fff",
              padding: 20,
              borderRadius: 10,
              border: `1px solid ${B.border}`,
              boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
              marginBottom: 24,
            }}
          >
            <p style={{ fontSize: 16, lineHeight: 1.625, margin: 0 }}>
              {s.question.text}
            </p>
          </div>
          {/* A4-flavoured answer sheet — typewriter or static */}
          <div
            style={{
              background: "#fff",
              border: "1px solid #D1D5DB",
              borderRadius: 4,
              boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
              padding: 32,
              height: 720,
              overflow: "hidden",
              position: "relative",
            }}
          >
            {streaming && useAnswerTyping ? (
              <p
                style={{
                  fontSize: 18,
                  lineHeight: 1.7,
                  margin: 0,
                  color: B.ink,
                  whiteSpace: "pre-wrap",
                }}
              >
                <StreamingText
                  text={SEED_STUDENT_TYPING_ANSWER}
                  startFrame={startFrame + CHAT_TIMINGS.answerStart}
                  charsPerSecond={CHAT_TIMINGS.answerCharsPerSec}
                  cursorColor={B.primary}
                />
              </p>
            ) : (
              <p
                style={{
                  fontSize: 18,
                  lineHeight: 1.7,
                  margin: 0,
                  color: B.ink,
                  whiteSpace: "pre-wrap",
                }}
              >
                {s.student.answer}
              </p>
            )}
            <div
              style={{
                position: "absolute",
                left: 0,
                right: 0,
                bottom: 0,
                height: 120,
                background:
                  "linear-gradient(to bottom, rgba(255,255,255,0), #ffffff)",
                pointerEvents: "none",
              }}
            />
          </div>
        </div>

        {/* RIGHT: AI 도우미 sidebar — pill header, message bubbles, input row */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            padding: padChat,
            gap: 24,
            background: "#FFFFFF",
          }}
        >
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <span
              style={{
                background: "rgba(53,89,196,0.10)",
                color: B.primary,
                border: "1px solid rgba(53,89,196,0.20)",
                borderRadius: 999,
                padding: "6px 14px",
                fontSize: 14,
                fontWeight: 600,
                opacity: headerPulse,
              }}
            >
              💬 AI 도우미
            </span>
            <span style={{ fontSize: 12, color: B.inkMuted }}>
              문제 {s.question.number} 관련 대화
            </span>
            {streaming ? (
              <span
                style={{
                  marginLeft: "auto",
                  display: "inline-flex",
                  gap: 6,
                  alignItems: "center",
                  fontSize: 11,
                  color: B.inkMuted,
                }}
              >
                <span
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: "50%",
                    background: "#22C55E",
                    boxShadow: "0 0 8px rgba(34,197,94,0.6)",
                    opacity: liveDotOpacity,
                  }}
                />
                LIVE
              </span>
            ) : null}
          </div>
          <div
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              gap: 24,
              overflow: "hidden",
            }}
          >
            {streaming
              ? renderStreamingChat({ cap, startFrame })
              : renderStaticChat({ cap })}
          </div>
          <div
            style={{
              background: "#fff",
              border: `1px solid ${B.border}`,
              borderRadius: 12,
              padding: "10px 14px",
              display: "flex",
              alignItems: "center",
              gap: 8,
              boxShadow: "0 4px 12px rgba(0,0,0,0.04)",
            }}
          >
            <span style={{ flex: 1, color: B.inkMuted, fontSize: 14 }}>
              AI에게 질문하기…
            </span>
            <div
              style={{
                width: 36,
                height: 36,
                background: B.primary,
                borderRadius: 999,
                display: "grid",
                placeItems: "center",
                color: "#fff",
                fontSize: 14,
              }}
            >
              ↑
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Static (v6) chat rendering — used when streaming=false (UIMontage etc.).
function renderStaticChat({ cap }: { cap: number }): ReactElement[] {
  const B = QUESTON_BRAND;
  return SEED.chat.slice(0, cap).map((m, i) => (
    <div
      key={i}
      style={{
        display: "flex",
        justifyContent: m.role === "student" ? "flex-end" : "flex-start",
      }}
    >
      {m.role === "student" ? (
        <div
          style={{
            background: B.primary,
            color: "#fff",
            maxWidth: "70%",
            borderRadius: 18,
            borderTopRightRadius: 6,
            padding: "14px 20px",
            boxShadow: "0 8px 24px rgba(53,89,196,0.20)",
            fontSize: 15,
            lineHeight: 1.55,
          }}
        >
          {m.text}
          <div
            style={{
              fontSize: 11,
              opacity: 0.8,
              marginTop: 8,
              textAlign: "right",
            }}
          >
            {m.time}
          </div>
        </div>
      ) : (
        <div
          style={{
            background: "#F5F5F5",
            color: B.ink,
            maxWidth: "78%",
            borderRadius: 22,
            borderTopLeftRadius: 8,
            padding: "12px 16px",
            border: "1px solid rgba(0,0,0,0.06)",
            fontSize: 15,
            lineHeight: 1.55,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              marginBottom: 4,
              fontSize: 12,
              color: B.primary,
              fontWeight: 600,
            }}
          >
            AI
          </div>
          {m.text}
          <div
            style={{
              fontSize: 11,
              color: B.inkMuted,
              marginTop: 6,
            }}
          >
            {m.time}
          </div>
        </div>
      )}
    </div>
  ));
}

// Streaming chat rendering — scripted three-message sequence.
function renderStreamingChat({
  cap,
  startFrame,
}: {
  cap: number;
  startFrame: number;
}): ReactElement[] {
  const messages = SEED.chat.slice(0, cap);
  const schedule = [
    { startOffset: CHAT_TIMINGS.studentMsg1, typing: 0 },
    {
      startOffset: CHAT_TIMINGS.aiMsgMount,
      typing: CHAT_TIMINGS.aiTypingFrames,
    },
    { startOffset: CHAT_TIMINGS.studentMsg2, typing: 0 },
  ];

  return messages.map((m, i) => {
    const sched = schedule[i] ?? { startOffset: 8 + i * 30, typing: 0 };
    if (m.role === "ai") {
      return (
        <AIChatBubble
          key={i}
          role="ai"
          text={m.text}
          startFrame={startFrame + sched.startOffset}
          time={m.time}
          typingFrames={sched.typing || CHAT_TIMINGS.aiTypingFrames}
          charsPerSecond={CHAT_TIMINGS.aiCharsPerSec}
        />
      );
    }
    return (
      <AIChatBubble
        key={i}
        role="student"
        text={m.text}
        startFrame={startFrame + sched.startOffset}
        time={m.time}
      />
    );
  });
}
