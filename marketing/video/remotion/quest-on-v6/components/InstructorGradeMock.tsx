import type { CSSProperties, ReactElement } from "react";
import { QUESTON_BRAND } from "../brand";
import { SEED } from "../seed";

export interface InstructorGradeMockProps {
  compact?: boolean;
}

// Inline JSX recreation of app/(app)/instructor/[examId]/grade/[studentId]/page.tsx
// + AIOverallSummary.tsx. Card stack: header, AI summary card, rubric+score.
// 1920×1080 canvas.
export function InstructorGradeMock({
  compact = false,
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
        background: "#FAFAFA",
        padding: padOuter,
        fontFamily: B.fontFamily,
        color: B.ink,
        display: "flex",
        flexDirection: "column",
        gap: 24,
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
      <div
        style={{
          background: "#fff",
          border: "2px solid rgba(53,89,196,0.10)",
          borderRadius: 14,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            background: "rgba(245,245,245,0.4)",
            padding: "16px 24px",
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <span style={{ color: "#9333EA", fontSize: 20 }}>✨</span>
          <span style={{ fontSize: 18, fontWeight: 600 }}>AI 종합 평가</span>
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
          <div
            style={{ display: "grid", gridTemplateRows: "1fr 1fr", gap: 16 }}
          >
            <div
              style={{
                background: "rgba(239,246,255,0.5)",
                border: "1px solid #DBEAFE",
                borderRadius: 10,
                padding: 16,
              }}
            >
              <div
                style={{
                  color: "#1D4ED8",
                  fontWeight: 600,
                  fontSize: 14,
                  marginBottom: 10,
                }}
              >
                + 강점
              </div>
              {s.aiSummary.strengths.map((x, i) => (
                <div key={i} style={{ fontSize: 13, marginBottom: 4 }}>
                  <span style={{ color: "#60A5FA", marginRight: 6 }}>•</span>
                  {x}
                </div>
              ))}
            </div>
            <div
              style={{
                background: "rgba(255,247,237,0.5)",
                border: "1px solid #FFEDD5",
                borderRadius: 10,
                padding: 16,
              }}
            >
              <div
                style={{
                  color: "#C2410C",
                  fontWeight: 600,
                  fontSize: 14,
                  marginBottom: 10,
                }}
              >
                − 개선점
              </div>
              {s.aiSummary.weaknesses.map((x, i) => (
                <div key={i} style={{ fontSize: 13, marginBottom: 4 }}>
                  <span style={{ color: "#FB923C", marginRight: 6 }}>•</span>
                  {x}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Rubric + final score card */}
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
              <span
                style={{
                  fontSize: 14,
                  fontWeight: 600,
                  textAlign: "right",
                }}
              >
                {r.score}
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
            {s.finalScore}
          </div>
          <div style={{ fontSize: 12, opacity: 0.8 }}>/ 100</div>
        </div>
      </div>
    </div>
  );
}
