import type { ReactElement } from "react";
import { interpolate, useCurrentFrame } from "remotion";
import { EASING } from "../../quest-on-demo/constants";
import { QUESTON_BRAND } from "../brand";

export interface ProductMockupSurfaceProps {
  // 0..1 reveal progress.
  startFrame?: number;
  // Use simplified CSS render (default) — Option B from spec.
  // Cinematic, brand-consistent, lighter-weight than PNG embedding.
  variant?: "student-exam" | "instructor-grade";
}

// Simplified Quest-On UI surface — designed to live on the front face of a 3D cube
// or expand to full-screen via the parent's transform.
// Variant `student-exam`: left answer area + right AI chat panel (matches §3.2 of product map).
// Variant `instructor-grade`: card stack (problem nav -> grading panel -> AI summary).
export function ProductMockupSurface({
  startFrame = 0,
  variant = "student-exam",
}: ProductMockupSurfaceProps): ReactElement {
  const frame = useCurrentFrame();
  const local = Math.max(0, frame - startFrame);

  // Each major UI block reveals on its own stagger.
  const headerT = interpolate(local, [0, 14], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASING.smoothOut,
  });
  const leftT = interpolate(local, [4, 22], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASING.smoothOut,
  });
  const rightT = interpolate(local, [10, 30], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASING.smoothOut,
  });

  // Chat-bubble cascade.
  const bubble1 = interpolate(local, [16, 26], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const bubble2 = interpolate(local, [24, 36], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const bubble3 = interpolate(local, [34, 46], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  if (variant === "instructor-grade") {
    return <InstructorMockup local={local} />;
  }

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        background: "#FFFFFF",
        fontFamily: QUESTON_BRAND.fontFamily,
        color: QUESTON_BRAND.ink,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      {/* Header — exam code + countdown + avatar */}
      <div
        style={{
          height: 56,
          padding: "0 28px",
          borderBottom: `1px solid ${QUESTON_BRAND.border}`,
          background: "#FCFCFD",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          opacity: headerT,
          transform: `translateY(${(1 - headerT) * -8}px)`,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div
            style={{
              width: 22,
              height: 22,
              borderRadius: 6,
              background: QUESTON_BRAND.brandGradient,
            }}
          />
          <span
            style={{
              fontSize: 14,
              fontWeight: 600,
              color: QUESTON_BRAND.ink,
              letterSpacing: "-0.01em",
            }}
          >
            Quest-On
          </span>
          <span
            style={{
              fontSize: 12,
              fontWeight: 500,
              color: QUESTON_BRAND.inkMuted,
              fontFamily: QUESTON_BRAND.fontFamilyMono,
            }}
          >
            QUEST1
          </span>
        </div>
        <div
          style={{
            fontFamily: QUESTON_BRAND.fontFamilyMono,
            fontSize: 18,
            fontWeight: 700,
            color: QUESTON_BRAND.ink,
            letterSpacing: "-0.02em",
          }}
        >
          00:42:13
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: "50%",
              background: QUESTON_BRAND.surfaceMuted,
              border: `1px solid ${QUESTON_BRAND.border}`,
            }}
          />
        </div>
      </div>

      {/* Progress bar */}
      <div
        style={{
          height: 3,
          width: "100%",
          background: QUESTON_BRAND.surfaceMuted,
          opacity: headerT,
          position: "relative",
        }}
      >
        <div
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            bottom: 0,
            width: "32%",
            background: QUESTON_BRAND.brandGradient,
          }}
        />
      </div>

      {/* Body: 65% answer, 35% chat */}
      <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
        {/* Left: question + answer */}
        <div
          style={{
            flex: "0 0 65%",
            padding: 22,
            display: "flex",
            flexDirection: "column",
            gap: 14,
            opacity: leftT,
            transform: `translateX(${(1 - leftT) * -16}px)`,
          }}
        >
          {/* Problem card */}
          <div
            style={{
              border: `1px solid ${QUESTON_BRAND.border}`,
              borderRadius: 10,
              padding: "14px 18px",
              display: "flex",
              flexDirection: "column",
              gap: 8,
              background: "#fff",
              boxShadow: "0 1px 2px rgba(15,23,42,0.04)",
            }}
          >
            <span
              style={{
                fontSize: 11,
                fontWeight: 600,
                padding: "3px 9px",
                borderRadius: 999,
                background: "rgba(53,89,196,0.10)",
                color: QUESTON_BRAND.primary,
                alignSelf: "flex-start",
              }}
            >
              문제 1
            </span>
            <span style={{ fontSize: 13, color: QUESTON_BRAND.ink, lineHeight: 1.5 }}>
              마이클 포터의 5 Forces 모델을 적용하여 스트리밍 산업의
              경쟁 환경을 분석하고, 신규 진입자 위협을 평가하시오.
            </span>
          </div>
          {/* Answer A4 area */}
          <div
            style={{
              flex: 1,
              border: `1px solid ${QUESTON_BRAND.border}`,
              borderRadius: 4,
              padding: 18,
              background: "#fff",
              fontSize: 12,
              lineHeight: 1.7,
              color: QUESTON_BRAND.ink,
              position: "relative",
              boxShadow: "0 1px 2px rgba(15,23,42,0.04)",
            }}
          >
            <TypingAnswer local={local} />
            {/* Save indicator */}
            <div
              style={{
                position: "absolute",
                top: 12,
                right: 16,
                fontSize: 10,
                color: QUESTON_BRAND.inkMuted,
                fontFamily: QUESTON_BRAND.fontFamilyMono,
              }}
            >
              방금 저장됨 · Cmd+S
            </div>
          </div>
        </div>

        {/* Right: AI chat sidebar */}
        <div
          style={{
            flex: "0 0 35%",
            padding: "22px 22px 22px 0",
            display: "flex",
            flexDirection: "column",
            opacity: rightT,
            transform: `translateX(${(1 - rightT) * 16}px)`,
            minHeight: 0,
          }}
        >
          <div
            style={{
              flex: 1,
              border: `1px solid ${QUESTON_BRAND.border}`,
              borderRadius: 14,
              background: "#FAFAFB",
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
              boxShadow: "0 4px 18px rgba(15,23,42,0.05)",
            }}
          >
            {/* Header */}
            <div
              style={{
                padding: "12px 16px",
                display: "flex",
                alignItems: "center",
                gap: 8,
                borderBottom: `1px solid ${QUESTON_BRAND.border}`,
              }}
            >
              <div
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: 999,
                  background: QUESTON_BRAND.brandGradient,
                }}
              />
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  padding: "2px 8px",
                  borderRadius: 999,
                  background: "rgba(53,89,196,0.10)",
                  color: QUESTON_BRAND.primary,
                }}
              >
                AI 도우미
              </span>
              <span
                style={{
                  fontSize: 10,
                  color: QUESTON_BRAND.inkMuted,
                }}
              >
                문제 1 관련 대화
              </span>
            </div>

            {/* Messages */}
            <div
              style={{
                flex: 1,
                padding: "14px 16px",
                display: "flex",
                flexDirection: "column",
                gap: 12,
                overflow: "hidden",
              }}
            >
              <ChatBubble
                role="student"
                text="5 Forces 중 신규 진입자 위협이 핵심인가요?"
                t={bubble1}
              />
              <ChatBubble
                role="ai"
                text="산업별로 다릅니다. 어떤 산업을 분석 중인가요?"
                t={bubble2}
              />
              <ChatBubble
                role="student"
                text="스트리밍 산업이요. 진입 장벽이 낮아진 것 같아서요."
                t={bubble3}
              />
            </div>

            {/* Input */}
            <div
              style={{
                padding: 12,
                borderTop: `1px solid ${QUESTON_BRAND.border}`,
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              <div
                style={{
                  flex: 1,
                  height: 32,
                  borderRadius: 10,
                  background: "#fff",
                  border: `1px solid ${QUESTON_BRAND.border}`,
                  padding: "0 12px",
                  display: "flex",
                  alignItems: "center",
                  fontSize: 11,
                  color: QUESTON_BRAND.inkMuted,
                }}
              >
                AI에게 질문하기...
              </div>
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: "50%",
                  background: QUESTON_BRAND.primary,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#fff",
                  fontSize: 14,
                  fontWeight: 700,
                }}
              >
                ↑
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function TypingAnswer({ local }: { local: number }): ReactElement {
  const text =
    "기업의 경쟁 환경을 분석할 때, 5 Forces 모델은 다섯 가지 압력을 동시에 평가한다. 스트리밍 산업의 경우 신규 진입자 위협은 콘텐츠 라이선스 비용과 사용자 충성도 두 축에서 결정된다.";
  const charsRevealed = Math.floor(
    interpolate(local, [10, 60], [0, text.length], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    }),
  );
  return (
    <span style={{ color: QUESTON_BRAND.ink }}>
      {text.slice(0, charsRevealed)}
      <span
        style={{
          display: "inline-block",
          width: 1,
          height: 13,
          background: QUESTON_BRAND.primary,
          verticalAlign: "middle",
          marginLeft: 1,
          opacity: Math.floor(local / 8) % 2 === 0 ? 1 : 0,
        }}
      />
    </span>
  );
}

function ChatBubble({
  role,
  text,
  t,
}: {
  role: "student" | "ai";
  text: string;
  t: number;
}): ReactElement {
  const isStudent = role === "student";
  return (
    <div
      style={{
        display: "flex",
        justifyContent: isStudent ? "flex-end" : "flex-start",
        opacity: t,
        transform: `translateY(${(1 - t) * 6}px)`,
      }}
    >
      <div
        style={{
          maxWidth: "82%",
          padding: "8px 12px",
          fontSize: 11,
          lineHeight: 1.45,
          background: isStudent ? QUESTON_BRAND.primary : "#FFFFFF",
          color: isStudent ? "#fff" : QUESTON_BRAND.ink,
          borderRadius: isStudent ? "14px 14px 4px 14px" : "14px 14px 14px 4px",
          border: isStudent ? "none" : `1px solid ${QUESTON_BRAND.border}`,
          boxShadow: isStudent
            ? "0 6px 18px -8px rgba(53,89,196,0.55)"
            : "0 2px 6px rgba(15,23,42,0.04)",
        }}
      >
        {text}
      </div>
    </div>
  );
}

function InstructorMockup({ local }: { local: number }): ReactElement {
  const headerT = interpolate(local, [0, 14], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASING.smoothOut,
  });
  const c1 = interpolate(local, [6, 22], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASING.smoothOut,
  });
  const c2 = interpolate(local, [14, 32], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASING.smoothOut,
  });
  const c3 = interpolate(local, [22, 42], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASING.smoothOut,
  });
  const c4 = interpolate(local, [30, 52], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASING.smoothOut,
  });

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        background: "linear-gradient(180deg, #F8FAFC 0%, #FFFFFF 60%)",
        fontFamily: QUESTON_BRAND.fontFamily,
        color: QUESTON_BRAND.ink,
        padding: 32,
        display: "flex",
        flexDirection: "column",
        gap: 14,
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          opacity: headerT,
          transform: `translateY(${(1 - headerT) * -8}px)`,
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <span style={{ fontSize: 11, color: QUESTON_BRAND.inkMuted, fontWeight: 500 }}>
            강사 평가 · 학생 #03
          </span>
          <span style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-0.02em" }}>
            5 Forces 응용 평가
          </span>
        </div>
        <div
          style={{
            display: "flex",
            gap: 10,
            alignItems: "center",
          }}
        >
          {[1, 2, 3, 4, 5].map((n, i) => (
            <div
              key={n}
              style={{
                fontSize: 12,
                fontWeight: 600,
                padding: "6px 12px",
                borderRadius: 999,
                background: i === 0 ? QUESTON_BRAND.primary : "#fff",
                color: i === 0 ? "#fff" : QUESTON_BRAND.ink,
                border: `1px solid ${i === 0 ? QUESTON_BRAND.primary : QUESTON_BRAND.border}`,
              }}
            >
              문제 {n}
            </div>
          ))}
        </div>
      </div>

      {/* Card 1 — score panel */}
      <Card t={c1}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <YellowStar />
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontSize: 14, fontWeight: 600 }}>문제 1 채점</span>
            <span style={{ fontSize: 11, color: QUESTON_BRAND.inkMuted }}>
              AI 가채점 완료. 점수와 피드백을 수정할 수 있습니다.
            </span>
          </div>
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 18 }}>
            <span
              style={{
                fontFamily: QUESTON_BRAND.fontFamilyMono,
                fontSize: 44,
                fontWeight: 700,
                color: QUESTON_BRAND.primary,
                letterSpacing: "-0.04em",
              }}
            >
              87
            </span>
            <span style={{ fontSize: 14, color: QUESTON_BRAND.inkMuted, fontWeight: 500 }}>/ 100</span>
            <div
              style={{
                width: 240,
                height: 8,
                borderRadius: 999,
                background: QUESTON_BRAND.surfaceMuted,
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  width: "87%",
                  height: "100%",
                  background: QUESTON_BRAND.brandGradient,
                }}
              />
            </div>
          </div>
        </div>
      </Card>

      {/* Card 2 — AI conversation summary */}
      <Card t={c2}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <Dot color={QUESTON_BRAND.primary} />
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontSize: 14, fontWeight: 600 }}>AI와의 대화 기록 12회</span>
            <span style={{ fontSize: 11, color: QUESTON_BRAND.inkMuted }}>
              학생이 AI 도우미와 어떻게 사고를 발전시켰는지 추적
            </span>
          </div>
          <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((i) => (
              <div
                key={i}
                style={{
                  width: 5,
                  height: 22 + (i % 4) * 6,
                  borderRadius: 2,
                  background:
                    i % 3 === 0
                      ? QUESTON_BRAND.primary
                      : QUESTON_BRAND.primaryLight,
                  opacity: 0.4 + (i % 4) * 0.15,
                }}
              />
            ))}
          </div>
        </div>
      </Card>

      {/* Card 3 — overall AI summary (strengths / improvements) */}
      <Card t={c3}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <Dot color="#A78BFA" />
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontSize: 14, fontWeight: 600 }}>AI 종합 평가</span>
            <span style={{ fontSize: 11, color: QUESTON_BRAND.inkMuted }}>
              강점 3 · 개선점 2 · 핵심 인용구 1
            </span>
          </div>
          <div style={{ marginLeft: "auto", display: "flex", gap: 14, alignItems: "center" }}>
            <Pill label="강점 3" tint="#16A34A" />
            <Pill label="개선점 2" tint="#DC2626" />
            <Pill label="인용 1" tint="#FACC15" />
          </div>
        </div>
      </Card>

      {/* Card 4 — paste / activity */}
      <Card t={c4} accent>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <Dot color="#DC2626" />
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontSize: 14, fontWeight: 600 }}>활동 신호</span>
            <span style={{ fontSize: 11, color: QUESTON_BRAND.inkMuted }}>
              외부 복사-붙여넣기 1건 · 12분간 사고 흐름 단절 없음
            </span>
          </div>
          <div
            style={{
              marginLeft: "auto",
              fontSize: 12,
              color: "#DC2626",
              fontWeight: 600,
            }}
          >
            검토 필요
          </div>
        </div>
      </Card>
    </div>
  );
}

function Card({
  children,
  t,
  accent = false,
}: {
  children: ReactElement;
  t: number;
  accent?: boolean;
}): ReactElement {
  return (
    <div
      style={{
        background: "#fff",
        border: `1px solid ${accent ? "#FECACA" : QUESTON_BRAND.border}`,
        borderRadius: 14,
        padding: "16px 22px",
        boxShadow: "0 6px 18px rgba(15,23,42,0.04)",
        opacity: t,
        transform: `translateY(${(1 - t) * 12}px)`,
      }}
    >
      {children}
    </div>
  );
}

function Dot({ color }: { color: string }): ReactElement {
  return (
    <div
      style={{
        width: 38,
        height: 38,
        borderRadius: 12,
        background: color + "22",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flex: "0 0 auto",
      }}
    >
      <div
        style={{
          width: 10,
          height: 10,
          borderRadius: "50%",
          background: color,
        }}
      />
    </div>
  );
}

function YellowStar(): ReactElement {
  return (
    <div
      style={{
        width: 38,
        height: 38,
        borderRadius: 12,
        background: "rgba(250,204,21,0.18)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flex: "0 0 auto",
        color: "#CA8A04",
        fontSize: 18,
      }}
    >
      ★
    </div>
  );
}

function Pill({ label, tint }: { label: string; tint: string }): ReactElement {
  return (
    <div
      style={{
        padding: "4px 10px",
        borderRadius: 999,
        fontSize: 11,
        fontWeight: 600,
        color: tint,
        background: tint + "1F",
        border: `1px solid ${tint}33`,
      }}
    >
      {label}
    </div>
  );
}
