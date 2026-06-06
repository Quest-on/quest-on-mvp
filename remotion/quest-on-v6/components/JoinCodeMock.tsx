import type { ReactElement } from "react";
import { QUESTON_BRAND } from "../brand";
import { SEED } from "../seed";

export interface JoinCodeMockProps {
  // Highlight index of the OTP slot (0-5). Defaults to last slot focused.
  focusIndex?: number;
}

// Inline JSX recreation of app/(app)/join/page.tsx — OTP-style join card.
// 1920×1080 canvas, card centered.
export function JoinCodeMock({
  focusIndex = 5,
}: JoinCodeMockProps): ReactElement {
  const B = QUESTON_BRAND;
  const code = SEED.exam.code;
  return (
    <div
      style={{
        width: 1920,
        height: 1080,
        background: "linear-gradient(135deg,#F8FAFC,#FFFFFF)",
        fontFamily: B.fontFamily,
        display: "grid",
        placeItems: "center",
      }}
    >
      <div
        style={{
          width: 540,
          background: "#fff",
          borderRadius: 16,
          boxShadow: "0 25px 50px -12px rgba(0,0,0,0.18)",
          padding: "40px 40px 32px",
          textAlign: "center",
        }}
      >
        <div
          style={{
            width: 72,
            height: 72,
            borderRadius: 999,
            background: B.primary,
            display: "grid",
            placeItems: "center",
            margin: "0 auto 20px",
            color: "#fff",
            fontSize: 30,
          }}
        >
          📄
        </div>
        <h2 style={{ fontSize: 26, fontWeight: 700, margin: 0, color: B.ink }}>
          코드 입력
        </h2>
        <p
          style={{
            color: B.inkMuted,
            fontSize: 15,
            marginTop: 8,
            marginBottom: 32,
          }}
        >
          강사가 제공한 코드를 입력하여 시험 또는 과제를 시작합니다
        </p>
        <div
          style={{
            display: "flex",
            gap: 6,
            justifyContent: "center",
            marginBottom: 16,
          }}
        >
          {code.split("").map((c, i) => (
            <div
              key={i}
              style={{
                width: 56,
                height: 56,
                border: `1px solid ${B.border}`,
                borderRadius: 8,
                fontSize: 22,
                fontWeight: 600,
                color: B.ink,
                fontFamily: B.fontFamilyMono,
                display: "grid",
                placeItems: "center",
                background: "#fff",
                boxShadow: i === focusIndex ? `0 0 0 2px ${B.primary}` : "none",
              }}
            >
              {c}
            </div>
          ))}
        </div>
        <p style={{ color: B.inkMuted, fontSize: 13, marginBottom: 28 }}>
          영문자와 숫자만 입력 가능합니다 (예: MATH01)
        </p>
        <button
          style={{
            width: "100%",
            height: 44,
            background: B.primary,
            color: "#fff",
            border: "none",
            borderRadius: 8,
            fontSize: 15,
            fontWeight: 600,
            cursor: "pointer",
            fontFamily: B.fontFamily,
          }}
        >
          입장
        </button>
      </div>
    </div>
  );
}
