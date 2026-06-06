import type { CSSProperties, ReactElement } from "react";
import { QUESTON_BRAND } from "../brand";
import { SEED } from "../seed";

export interface InstructorExamMockProps {
  compact?: boolean;
}

// Inline JSX recreation of app/(app)/instructor/[examId]/page.tsx — exam detail
// dashboard. KPI grid + student roster.
// 1920×1080 canvas.
export function InstructorExamMock({
  compact = false,
}: InstructorExamMockProps): ReactElement {
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
        fontFamily: B.fontFamily,
        color: B.ink,
        padding: padOuter,
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          marginBottom: 24,
        }}
      >
        <div>
          <h1 style={{ fontSize: 30, fontWeight: 700, margin: 0 }}>
            {s.exam.title}
          </h1>
          <p style={{ color: B.inkMuted, fontSize: 14, marginTop: 6 }}>
            시험 코드:{" "}
            <span
              style={{
                fontFamily: B.fontFamilyMono,
                color: B.primary,
                fontWeight: 600,
              }}
            >
              {s.exam.code}
            </span>
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button style={{ ...primaryBtn, background: "#059669" }}>
            📥 Excel 다운로드
          </button>
          <button style={outlineBtn}>대시보드</button>
          <button style={primaryBtn}>시험 편집</button>
        </div>
      </div>

      {/* Collapsible info bars */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 12,
          marginBottom: 24,
        }}
      >
        {[
          {
            label: "시험 정보",
            meta: `${s.exam.durationMinutes}분 · 시험 코드 ${s.exam.code}`,
          },
          { label: "문제 보기", meta: `${s.exam.questionCount}개 문제` },
        ].map((row) => (
          <div
            key={row.label}
            style={{
              border: `1px solid ${B.border}`,
              borderRadius: 10,
              background: "#fff",
              padding: 16,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ fontWeight: 600 }}>{row.label}</span>
              <span style={{ fontSize: 13, color: B.inkMuted }}>
                {row.meta}
              </span>
            </div>
            <span style={{ color: B.inkMuted }}>▾</span>
          </div>
        ))}
      </div>

      {/* Grid: charts | students */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 480px",
          gap: 24,
        }}
      >
        {/* KPI + bar chart */}
        <div
          style={{
            background: "#fff",
            border: `1px solid ${B.border}`,
            borderRadius: 14,
            padding: 24,
            height: 480,
          }}
        >
          <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>
            학생 평균 분석
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 16,
            }}
          >
            {s.kpis.map((kpi) => (
              <div
                key={kpi.label}
                style={{
                  background: "#F8FAFC",
                  borderRadius: 10,
                  padding: 16,
                }}
              >
                <div style={{ fontSize: 12, color: B.inkMuted }}>
                  {kpi.label}
                </div>
                <div
                  style={{
                    fontSize: 28,
                    fontWeight: 700,
                    color: B.primary,
                  }}
                >
                  {kpi.value}
                  <span
                    style={{
                      fontSize: 14,
                      color: B.inkMuted,
                      marginLeft: 4,
                    }}
                  >
                    {kpi.suffix}
                  </span>
                </div>
              </div>
            ))}
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "flex-end",
              gap: 8,
              height: 140,
              marginTop: 24,
              paddingLeft: 8,
            }}
          >
            {[12, 24, 38, 52, 68, 76, 60, 44, 30, 18].map((h, i) => (
              <div
                key={i}
                style={{
                  flex: 1,
                  height: h * 1.6,
                  background: B.brandGradient,
                  borderRadius: 4,
                  opacity: 0.85,
                }}
              />
            ))}
          </div>
        </div>

        {/* Student roster */}
        <div
          style={{
            background: "#fff",
            border: `1px solid ${B.border}`,
            borderRadius: 14,
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
          }}
        >
          <div
            style={{
              padding: 16,
              borderBottom: `1px solid ${B.border}`,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <span style={{ fontWeight: 600 }}>
              학생 목록 ({s.exam.studentCount}명)
            </span>
            <span style={{ fontSize: 12, color: B.inkMuted }}>
              가채점 순 ▾
            </span>
          </div>
          <div
            style={{ padding: "8px 16px", borderBottom: `1px solid ${B.border}` }}
          >
            <div
              style={{
                background: "#F1F5F9",
                borderRadius: 8,
                padding: "8px 12px",
                fontSize: 13,
                color: B.inkMuted,
              }}
            >
              🔍 학생 이름, 이메일, 학번으로 검색…
            </div>
          </div>
          {s.studentRoster.map((st) => (
            <div
              key={st.id}
              style={{
                padding: "12px 16px",
                display: "flex",
                alignItems: "center",
                gap: 12,
                borderBottom: `1px solid ${B.border}`,
              }}
            >
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 999,
                  background: "rgba(53,89,196,0.10)",
                  color: B.primary,
                  fontWeight: 600,
                  fontSize: 13,
                  display: "grid",
                  placeItems: "center",
                }}
              >
                {st.id}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{ display: "flex", gap: 8, alignItems: "center" }}
                >
                  <span style={{ fontSize: 14, fontWeight: 500 }}>
                    {st.name}
                  </span>
                  <span
                    style={{
                      fontSize: 11,
                      padding: "2px 8px",
                      borderRadius: 999,
                      background:
                        st.status === "completed"
                          ? "#DCFCE7"
                          : st.status === "in-progress"
                            ? "#FEF9C3"
                            : "#F3F4F6",
                      color:
                        st.status === "completed"
                          ? "#166534"
                          : st.status === "in-progress"
                            ? "#854D0E"
                            : "#374151",
                    }}
                  >
                    {st.status === "completed"
                      ? "완료"
                      : st.status === "in-progress"
                        ? "● 진행 중"
                        : "시작 안함"}
                  </span>
                </div>
                <div
                  style={{
                    fontSize: 11,
                    color: B.inkMuted,
                    marginTop: 2,
                  }}
                >
                  {st.sub}
                </div>
              </div>
              <div style={{ minWidth: 80, textAlign: "right" }}>
                {st.score != null ? (
                  <>
                    <div style={{ fontSize: 16, fontWeight: 700 }}>
                      {st.score}점
                    </div>
                    <div style={{ fontSize: 10, color: B.inkMuted }}>
                      가채점
                    </div>
                  </>
                ) : (
                  <div style={{ fontSize: 11, color: B.inkMuted }}>
                    채점 중…
                  </div>
                )}
              </div>
              <button
                style={{
                  background: "#fff",
                  border: `1px solid ${
                    st.status === "completed" ? "#2563EB" : "#16A34A"
                  }`,
                  color: st.status === "completed" ? "#2563EB" : "#16A34A",
                  fontSize: 12,
                  fontWeight: 500,
                  padding: "6px 10px",
                  borderRadius: 6,
                  fontFamily: B.fontFamily,
                }}
              >
                {st.status === "completed" ? "📋 채점" : "📡 보기"}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
