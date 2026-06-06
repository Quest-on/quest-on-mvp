import type { ReactElement } from "react";
import { QUESTON_BRAND } from "../brand";
import { SEED } from "../seed";

export interface JoinCodeMockProps {
  focusIndex?: number;
  compact?: boolean;
}

// Inline JSX recreation of app/(app)/join/page.tsx — OTP-style join card.
// 1920×1080 canvas, card centered.
export function JoinCodeMock({
  focusIndex = 5,
  compact = false,
}: JoinCodeMockProps): ReactElement {
  const B = QUESTON_BRAND;
  const code = SEED.exam.code;

  const card = (
    <div
      style={{
        width: compact ? 480 : 540,
        background: "#fff",
        borderRadius: 16,
        boxShadow:
          "0 4px 6px -1px rgba(0,0,0,0.05), 0 25px 50px -12px rgba(0,0,0,0.12)",
        padding: compact ? "28px 32px 24px" : "40px 40px 32px",
        textAlign: "center",
        position: "relative",
      }}
    >
      <div
        style={{
          width: compact ? 56 : 72,
          height: compact ? 56 : 72,
          borderRadius: 999,
          background: B.primary,
          display: "grid",
          placeItems: "center",
          margin: "0 auto 16px",
          color: "#fff",
          fontSize: compact ? 24 : 30,
        }}
      >
        📄
      </div>
      <h2
        style={{
          fontSize: compact ? 22 : 26,
          fontWeight: 700,
          margin: 0,
          color: B.ink,
        }}
      >
        코드 입력
      </h2>
      <p
        style={{
          color: B.inkMuted,
          fontSize: compact ? 14 : 15,
          marginTop: 6,
          marginBottom: compact ? 20 : 32,
        }}
      >
        강사가 제공한 코드를 입력하세요
      </p>
      <div
        style={{
          display: "flex",
          gap: 6,
          justifyContent: "center",
          marginBottom: 14,
        }}
      >
        {code.split("").map((c, i) => (
          <div
            key={i}
            style={{
              width: compact ? 48 : 56,
              height: compact ? 48 : 56,
              border: `1px solid ${B.border}`,
              borderRadius: 8,
              fontSize: compact ? 20 : 22,
              fontWeight: 600,
              color: B.ink,
              fontFamily: B.fontFamilyMono,
              display: "grid",
              placeItems: "center",
              background: "#fff",
              boxShadow:
                i === focusIndex ? `0 0 0 2px ${B.primary}` : "none",
            }}
          >
            {c}
          </div>
        ))}
      </div>
      <p style={{ color: B.inkMuted, fontSize: 12, marginBottom: compact ? 16 : 28 }}>
        영문자와 숫자만 입력 가능합니다
      </p>
      <button
        style={{
          width: "100%",
          height: compact ? 42 : 48,
          background: B.primary,
          color: "#fff",
          border: "none",
          borderRadius: 10,
          fontSize: compact ? 15 : 16,
          fontWeight: 600,
          cursor: "pointer",
          fontFamily: B.fontFamily,
          boxShadow: `0 4px 14px ${B.primary}33`,
        }}
      >
        입장
      </button>
      <p
        style={{
          color: B.inkMuted,
          fontSize: 13,
          marginTop: 12,
          opacity: 0.7,
        }}
      >
        {SEED.exam.title}
      </p>
    </div>
  );

  return (
    <div
      style={{
        width: 1920,
        height: 1080,
        background:
          "linear-gradient(180deg,#F8FAFC 0%,#FFFFFF 40%,#F1F5F9 100%)",
        fontFamily: B.fontFamily,
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Header bar */}
      <div
        style={{
          height: 56,
          display: "flex",
          alignItems: "center",
          padding: "0 32px",
          background: "rgba(255,255,255,0.95)",
          borderBottom: `1px solid ${B.border}`,
          flexShrink: 0,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: 6,
              background: B.primary,
              display: "grid",
              placeItems: "center",
              color: "#fff",
              fontSize: 14,
              fontWeight: 700,
            }}
          >
            Q
          </div>
          <span
            style={{ fontSize: 16, fontWeight: 700, color: B.ink }}
          >
            Quest-On
          </span>
        </div>
      </div>

      {/* Body */}
      <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
        {/* Sidebar — only shown in compact mode for density */}
        {compact && (
          <div
            style={{
              width: 260,
              flexShrink: 0,
              borderRight: `1px solid ${B.border}`,
              background: "#FAFBFC",
              padding: "24px 20px",
              display: "flex",
              flexDirection: "column",
              gap: 6,
            }}
          >
            <div
              style={{
                fontSize: 11,
                fontWeight: 700,
                textTransform: "uppercase" as const,
                letterSpacing: "0.07em",
                color: B.inkMuted,
                marginBottom: 8,
              }}
            >
              시험 정보
            </div>
            {[
              { label: "시험명", value: SEED.exam.title },
              { label: "시간", value: `${SEED.exam.durationMinutes}분` },
              { label: "문항 수", value: `${SEED.exam.questionCount}문항` },
              {
                label: "접속 학생",
                value: `${SEED.exam.studentCount}명`,
              },
            ].map((item, i) => (
              <div
                key={i}
                style={{
                  background: "#fff",
                  border: `1px solid ${B.border}`,
                  borderRadius: 8,
                  padding: "10px 14px",
                }}
              >
                <div
                  style={{
                    fontSize: 11,
                    color: B.inkMuted,
                    marginBottom: 4,
                  }}
                >
                  {item.label}
                </div>
                <div
                  style={{
                    fontSize: 14,
                    fontWeight: 600,
                    color: B.ink,
                  }}
                >
                  {item.value}
                </div>
              </div>
            ))}
            <div style={{ flex: 1 }} />
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                fontSize: 12,
                color: B.inkMuted,
                padding: "8px 0",
              }}
            >
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background: "#22C55E",
                }}
              />
              대기 중
            </div>
          </div>
        )}

        {/* Center area */}
        <div
          style={{
            flex: 1,
            display: "grid",
            placeItems: "center",
            position: "relative",
          }}
        >
          {!compact && (
            <>
              <div
                style={{
                  position: "absolute",
                  left: "12%",
                  bottom: "8%",
                  width: 400,
                  height: 400,
                  borderRadius: "50%",
                  background: `radial-gradient(circle, ${B.primary}08 0%, transparent 70%)`,
                  filter: "blur(40px)",
                  pointerEvents: "none",
                }}
              />
              <div
                style={{
                  position: "absolute",
                  right: "10%",
                  top: "15%",
                  width: 300,
                  height: 300,
                  borderRadius: "50%",
                  background: `radial-gradient(circle, ${B.primaryLight}06 0%, transparent 70%)`,
                  filter: "blur(40px)",
                  pointerEvents: "none",
                }}
              />
            </>
          )}
          {card}
        </div>
      </div>
    </div>
  );
}
