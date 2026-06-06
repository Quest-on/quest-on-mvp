import type { CSSProperties, ReactElement, ReactNode } from "react";
import {
  AbsoluteFill,
  interpolate,
  OffthreadVideo,
  Sequence,
  staticFile,
  useCurrentFrame,
} from "remotion";

import "../quest-on-demo/fonts";
import { InstructorGradeMock } from "../quest-on-v8/components/InstructorGradeMock";
import { QuestOnLogoV8 } from "../quest-on-v8/components/QuestOnLogoV8";
import { StudentExamMock } from "../quest-on-v8/components/StudentExamMock";
import { V8_PALETTE } from "../quest-on-v8/data";

export const HYBRID_FPS = 30;
export const HYBRID_WIDTH = 1920;
export const HYBRID_HEIGHT = 1080;
export const HYBRID_TOTAL_FRAMES = 63 * HYBRID_FPS;

const FONT =
  "Pretendard Variable, Pretendard, Inter, -apple-system, BlinkMacSystemFont, system-ui, sans-serif";

const copy = {
  cold: "AI는 이미 대학 시험 안에 들어왔습니다.",
  old: "금지하거나, 적발하거나.",
  problem: "문제는 AI 사용이 아니라, 과정이 보이지 않는다는 것.",
  turn: "Blackbox -> Glassbox",
  create: "교수 계정: AI와 함께 출제하고, 활용 범위를 설정합니다.",
  student: "학생 계정: AI와 대화하며 Case를 해결합니다.",
  trace: "질문, 근거, 수정 과정이 모두 기록됩니다.",
  grade: "AI 가채점 + 활용 과정 리포트 + 교수 최종 확정",
  proof: "현장에서 검증 중인 대학 평가 플랫폼",
  cta: "AI 시대 대학 시험의 새 기준",
  sub: "AI 사용을 막는 대신, 활용 과정을 평가합니다.",
} as const;

const video = {
  blackbox: "generated/happyhorse/01-blackbox-cube-v2.mp4",
  crack: "generated/happyhorse/02-crack-to-glassbox-v2.mp4",
  glassbox: "generated/happyhorse/03-glassbox-process-trace-v2.mp4",
} as const;

function seconds(n: number): number {
  return Math.round(n * HYBRID_FPS);
}

function easeInOut(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function Scene({
  children,
  style,
}: {
  children: ReactNode;
  style?: CSSProperties;
}): ReactElement {
  return (
    <AbsoluteFill
      style={{
        background:
          "radial-gradient(circle at 50% 20%, rgba(53,89,196,0.20), transparent 34%), #05070F",
        color: "#F8FAFC",
        fontFamily: FONT,
        overflow: "hidden",
        ...style,
      }}
    >
      {children}
    </AbsoluteFill>
  );
}

function CinematicShot({
  src,
  copyText,
  copyPosition = "bottom",
  dim = 0.18,
  startFrom = 0,
  label,
}: {
  src: string;
  copyText: string;
  copyPosition?: "center" | "bottom";
  dim?: number;
  startFrom?: number;
  label?: string;
}): ReactElement {
  const frame = useCurrentFrame();
  const fadeIn = interpolate(frame, [0, 18], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const y = interpolate(frame, [0, 24], [24, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <Scene>
      <OffthreadVideo
        src={staticFile(src)}
        startFrom={startFrom}
        muted
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
          filter: "saturate(0.9) contrast(1.04)",
        }}
      />
      <AbsoluteFill style={{ background: `rgba(5,7,15,${dim})` }} />
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "linear-gradient(180deg, rgba(5,7,15,0.18), transparent 42%, rgba(5,7,15,0.70))",
        }}
      />
      {label ? (
        <div
          style={{
            position: "absolute",
            top: 64,
            left: 72,
            color: V8_PALETTE.highlight,
            fontSize: 18,
            fontWeight: 650,
            letterSpacing: 0,
            opacity: 0.82,
          }}
        >
          {label}
        </div>
      ) : null}
      <div
        style={{
          position: "absolute",
          left: 96,
          right: 96,
          top: copyPosition === "center" ? 420 : undefined,
          bottom: copyPosition === "bottom" ? 96 : undefined,
          opacity: fadeIn,
          transform: `translateY(${y}px)`,
          fontSize: copyText.length > 34 ? 54 : 76,
          lineHeight: 1.12,
          fontWeight: 760,
          letterSpacing: 0,
          wordBreak: "keep-all",
          overflowWrap: "normal",
          textWrap: "balance",
          textShadow: "0 20px 60px rgba(0,0,0,0.65)",
          maxWidth: 1420,
        }}
      >
        {copyText}
      </div>
    </Scene>
  );
}

function ProductFrame({
  children,
  scale = 0.54,
}: {
  children: ReactNode;
  scale?: number;
}): ReactElement {
  const w = 1920 * scale;
  const h = 1080 * scale;
  return (
    <div
      style={{
        width: w,
        height: h,
        borderRadius: 18,
        overflow: "hidden",
        background: "#F8FAFB",
        boxShadow:
          "0 28px 90px rgba(0,0,0,0.36), 0 0 0 1px rgba(87,205,255,0.22)",
      }}
    >
      <div
        style={{
          width: 1920,
          height: 1080,
          transform: `scale(${scale})`,
          transformOrigin: "top left",
        }}
      >
        {children}
      </div>
    </div>
  );
}

function CaptionBand({
  kicker,
  title,
  body,
}: {
  kicker: string;
  title: string;
  body: string;
}): ReactElement {
  return (
    <div
      style={{
        width: 560,
        display: "flex",
        flexDirection: "column",
        gap: 24,
      }}
    >
      <div
        style={{
          color: V8_PALETTE.highlight,
          fontSize: 20,
          fontWeight: 720,
          letterSpacing: 0,
        }}
      >
        {kicker}
      </div>
      <div
        style={{
          color: "#F8FAFC",
          fontSize: 58,
          lineHeight: 1.08,
          fontWeight: 760,
          letterSpacing: 0,
          wordBreak: "keep-all",
          overflowWrap: "normal",
          textWrap: "balance",
        }}
      >
        {title}
      </div>
      <div
        style={{
          color: "rgba(226,232,240,0.82)",
          fontSize: 25,
          lineHeight: 1.52,
          fontWeight: 480,
          letterSpacing: 0,
          wordBreak: "keep-all",
          overflowWrap: "normal",
        }}
      >
        {body}
      </div>
    </div>
  );
}

function ProductScene({
  mode,
}: {
  mode: "create" | "student" | "trace" | "grade";
}): ReactElement {
  const frame = useCurrentFrame();
  const p = easeInOut(
    interpolate(frame, [0, 36], [0, 1], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    }),
  );
  const frameStyle: CSSProperties = {
    transform: `translateY(${(1 - p) * 32}px) scale(${0.965 + p * 0.035})`,
    opacity: p,
  };

  const titles = {
    create: {
      kicker: "Professor Account",
      title: "AI와 출제하고, 활용 범위를 설계합니다.",
      body: copy.create,
    },
    student: {
      kicker: "Student Account",
      title: "학생은 AI와 대화하며 답안을 발전시킵니다.",
      body: copy.student,
    },
    trace: {
      kicker: "Process Trace",
      title: "답안 너머의 사고 과정을 남깁니다.",
      body: copy.trace,
    },
    grade: {
      kicker: "Instructor Review",
      title: "교수자가 근거를 보고 최종 판단합니다.",
      body: copy.grade,
    },
  }[mode];

  return (
    <Scene>
      <Grid />
      <div
        style={{
          position: "absolute",
          inset: "110px 96px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 80,
        }}
      >
        <CaptionBand {...titles} />
        <div style={frameStyle}>
          <ProductFrame scale={mode === "trace" ? 0.5 : 0.53}>
            {mode === "create" ? (
              <InstructorCreateMock />
            ) : mode === "student" ? (
              <StudentExamMock compact streaming startFrame={-20} />
            ) : mode === "grade" ? (
              <InstructorGradeMock compact streaming startFrame={0} />
            ) : (
              <TraceMock />
            )}
          </ProductFrame>
        </div>
      </div>
    </Scene>
  );
}

function InstructorCreateMock(): ReactElement {
  const frame = useCurrentFrame();
  const steps = [
    ["강의자료 업로드", "조직행위 사례 PDF"],
    ["AI와 문제 생성", "Case 해결형 문항 초안"],
    ["활용 범위 설정", "AI 질문 8회 / 출처 표시"],
    ["평가 기준 설정", "근거, 판단, 수정 과정"],
  ];

  return (
    <div
      style={{
        width: 1920,
        height: 1080,
        background: "#F8FAFB",
        fontFamily: FONT,
        color: "#111827",
        padding: 56,
        display: "grid",
        gridTemplateRows: "72px 1fr",
        gap: 36,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          borderBottom: "1px solid #E5E7EB",
          paddingBottom: 20,
        }}
      >
        <div style={{ fontSize: 34, fontWeight: 760 }}>시험 만들기</div>
        <div
          style={{
            background: V8_PALETTE.primary,
            color: "#fff",
            borderRadius: 12,
            padding: "16px 24px",
            fontSize: 22,
            fontWeight: 720,
          }}
        >
          AI와 문제 생성
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 40 }}>
        <div
          style={{
            borderRadius: 22,
            background: "#fff",
            border: "1px solid #E5E7EB",
            padding: 34,
            display: "flex",
            flexDirection: "column",
            gap: 22,
          }}
        >
          <div style={{ fontSize: 24, color: "#6B7280", fontWeight: 680 }}>
            강의자료
          </div>
          <div
            style={{
              height: 250,
              borderRadius: 18,
              background:
                "linear-gradient(135deg, rgba(53,89,196,0.10), rgba(87,205,255,0.10))",
              border: "1px dashed rgba(53,89,196,0.38)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 32,
              fontWeight: 720,
              color: V8_PALETTE.primary,
            }}
          >
            조직행위 강의자료 업로드됨
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>
            {["90분", "AI 활용 허용", "Case형", "루브릭 평가"].map((item) => (
              <div
                key={item}
                style={{
                  borderRadius: 14,
                  background: "#F3F4F6",
                  padding: 18,
                  fontSize: 22,
                  fontWeight: 650,
                }}
              >
                {item}
              </div>
            ))}
          </div>
        </div>
        <div
          style={{
            borderRadius: 22,
            background: "#fff",
            border: "1px solid #E5E7EB",
            padding: 34,
            display: "flex",
            flexDirection: "column",
            gap: 20,
          }}
        >
          <div style={{ fontSize: 24, color: "#6B7280", fontWeight: 680 }}>
            생성 플로우
          </div>
          {steps.map(([title, body], index) => {
            const active = frame > index * 18;
            return (
              <div
                key={title}
                style={{
                  display: "flex",
                  gap: 18,
                  alignItems: "center",
                  opacity: active ? 1 : 0.35,
                  transform: `translateX(${active ? 0 : 18}px)`,
                }}
              >
                <div
                  style={{
                    width: 46,
                    height: 46,
                    borderRadius: 23,
                    background: active ? V8_PALETTE.primary : "#CBD5E1",
                    color: "#fff",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 22,
                    fontWeight: 800,
                  }}
                >
                  {index + 1}
                </div>
                <div>
                  <div style={{ fontSize: 28, fontWeight: 760 }}>{title}</div>
                  <div style={{ fontSize: 21, color: "#6B7280", marginTop: 6 }}>
                    {body}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function TraceMock(): ReactElement {
  const frame = useCurrentFrame();
  const items = ["질문", "근거 탐색", "답안 수정", "최종 판단", "루브릭"];
  return (
    <div
      style={{
        width: 1920,
        height: 1080,
        background: "#F8FAFB",
        fontFamily: FONT,
        color: "#111827",
        padding: 86,
      }}
    >
      <div style={{ fontSize: 42, fontWeight: 780, marginBottom: 54 }}>
        AI 활용 과정 리포트
      </div>
      <div
        style={{
          height: 640,
          borderRadius: 26,
          background: "#fff",
          border: "1px solid #E5E7EB",
          padding: 56,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        {items.map((item, index) => {
          const active = frame > 12 + index * 16;
          return (
            <div
              key={item}
              style={{
                width: 250,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 22,
                opacity: active ? 1 : 0.28,
              }}
            >
              <div
                style={{
                  width: 124,
                  height: 124,
                  borderRadius: 28,
                  background: active
                    ? "linear-gradient(135deg, #3559C4, #57CDFF)"
                    : "#CBD5E1",
                  boxShadow: active
                    ? "0 20px 48px rgba(53,89,196,0.30)"
                    : undefined,
                }}
              />
              <div style={{ fontSize: 30, fontWeight: 760 }}>{item}</div>
              <div
                style={{
                  width: 180,
                  height: 8,
                  borderRadius: 999,
                  background: active ? V8_PALETTE.highlight : "#E5E7EB",
                }}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ProofScene(): ReactElement {
  const cards = [
    ["동국대학교", "2개 강의 / 110명", "Case 해결형 시험 운영"],
    ["홍익대학교", "그레이딩 시간 약 80% 감소", "AI 부정행위 0건"],
    ["숙명여자대학교", "AI 시대 대학 평가 방식", "현장 강연"],
  ];
  return (
    <Scene>
      <Grid />
      <div
        style={{
          position: "absolute",
          top: 128,
          left: 120,
          right: 120,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "end",
        }}
      >
        <div>
          <div
            style={{
              color: V8_PALETTE.highlight,
              fontSize: 22,
              fontWeight: 720,
              marginBottom: 20,
            }}
          >
            Field Proof
          </div>
          <div
            style={{
              fontSize: 64,
              fontWeight: 800,
              wordBreak: "keep-all",
              overflowWrap: "normal",
            }}
          >
            {copy.proof}
          </div>
        </div>
      </div>
      <div
        style={{
          position: "absolute",
          left: 120,
          right: 120,
          top: 420,
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 28,
        }}
      >
        {cards.map(([school, metric, detail]) => (
          <div
            key={school}
            style={{
              minHeight: 310,
              borderRadius: 24,
              background: "rgba(248,250,252,0.08)",
              border: "1px solid rgba(87,205,255,0.26)",
              padding: 38,
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
              boxShadow: "0 24px 80px rgba(0,0,0,0.22)",
            }}
          >
            <div style={{ fontSize: 28, color: "#CBD5E1", fontWeight: 680 }}>
              {school}
            </div>
            <div
              style={{
                fontSize: metric.length > 14 ? 36 : 56,
                lineHeight: 1.12,
                color: "#fff",
                fontWeight: 820,
                letterSpacing: 0,
                wordBreak: "keep-all",
                overflowWrap: "normal",
              }}
            >
              {metric}
            </div>
            <div style={{ fontSize: 24, color: "rgba(226,232,240,0.78)" }}>
              {detail}
            </div>
          </div>
        ))}
      </div>
    </Scene>
  );
}

function CtaScene(): ReactElement {
  return (
    <Scene
      style={{
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Grid />
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
        <QuestOnLogoV8 height={188} />
        <div
          style={{
            marginTop: 42,
            fontSize: 76,
            fontWeight: 820,
            color: "#fff",
            letterSpacing: 0,
            wordBreak: "keep-all",
          }}
        >
          Quest-On
        </div>
        <div
          style={{
            marginTop: 20,
            fontSize: 42,
            color: "#E2E8F0",
            fontWeight: 680,
            letterSpacing: 0,
            wordBreak: "keep-all",
          }}
        >
          {copy.cta}
        </div>
        <div
          style={{
            marginTop: 22,
            fontSize: 28,
            color: "rgba(226,232,240,0.78)",
            fontWeight: 480,
            letterSpacing: 0,
            wordBreak: "keep-all",
          }}
        >
          {copy.sub}
        </div>
      </div>
    </Scene>
  );
}

function Grid(): ReactElement {
  return (
    <>
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage:
            "linear-gradient(rgba(87,205,255,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(87,205,255,0.06) 1px, transparent 1px)",
          backgroundSize: "84px 84px",
          maskImage: "radial-gradient(circle at 50% 50%, black, transparent 72%)",
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "linear-gradient(180deg, transparent 0%, rgba(5,7,15,0.28) 100%)",
        }}
      />
    </>
  );
}

export function HybridAd(): ReactElement {
  return (
    <AbsoluteFill style={{ background: V8_PALETTE.bg }}>
      <Sequence from={0} durationInFrames={seconds(4)}>
        <CinematicShot src={video.blackbox} copyText={copy.cold} dim={0.1} />
      </Sequence>
      <Sequence from={seconds(4)} durationInFrames={seconds(5)}>
        <CinematicShot
          src={video.blackbox}
          startFrom={seconds(1)}
          copyText={copy.old}
          copyPosition="center"
          dim={0.42}
        />
      </Sequence>
      <Sequence from={seconds(9)} durationInFrames={seconds(6)}>
        <CinematicShot
          src={video.blackbox}
          startFrom={seconds(2)}
          copyText={copy.problem}
          dim={0.34}
          label="Blackbox"
        />
      </Sequence>
      <Sequence from={seconds(15)} durationInFrames={seconds(6)}>
        <CinematicShot
          src={video.crack}
          copyText={copy.turn}
          copyPosition="center"
          dim={0.22}
        />
      </Sequence>
      <Sequence from={seconds(21)} durationInFrames={seconds(8)}>
        <ProductScene mode="create" />
      </Sequence>
      <Sequence from={seconds(29)} durationInFrames={seconds(8)}>
        <ProductScene mode="student" />
      </Sequence>
      <Sequence from={seconds(37)} durationInFrames={seconds(6)}>
        <CinematicShot
          src={video.glassbox}
          copyText={copy.trace}
          dim={0.2}
          label="Glassbox"
        />
      </Sequence>
      <Sequence from={seconds(43)} durationInFrames={seconds(8)}>
        <ProductScene mode="grade" />
      </Sequence>
      <Sequence from={seconds(51)} durationInFrames={seconds(6)}>
        <ProofScene />
      </Sequence>
      <Sequence from={seconds(57)} durationInFrames={seconds(6)}>
        <CtaScene />
      </Sequence>
    </AbsoluteFill>
  );
}
