/**
 * 분석 턴 화면 배선 (이슈 #545)
 *
 * 이 저장소의 vitest 는 node 환경이라 컴포넌트를 렌더하지 않는다. 대신 배선이 끊기지 않았는지 소스와 순수 함수로
 * 지킨다(화면 동작은 스테이징에서 확인한다).
 *   - 학생 채팅: 분석 파트너 문항은 `/api/chat/analysis` 로 보내고(타임아웃 300초), 409 면 `/api/chat` 으로 다시 보낸다.
 *     진행 표시와 셀 블록이 사이드바에 붙어 있다.
 *   - 교수 채점 화면: 같은 셀 블록이 대화 카드에 읽기 전용으로 붙어 있다.
 *   - 화면 이벤트 파서와 문구(ko/en 같은 키, 합니다체, 가운뎃점과 낫표 없음).
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parseAnalysisStreamEvent } from "@/lib/analysis-exec/client-events";
import { ANALYSIS_CLIENT_TIMEOUT_MS } from "@/lib/analysis-exec/limits";
import { errorCodeNoticeKey, outcomeNoticeKey } from "@/components/chat/AnalysisTurnBlock";

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");

describe("학생 채팅 배선", () => {
  const hook = read("hooks/useExamChat.ts");
  const sidebar = read("components/exam/ExamChatSidebar.tsx");
  const page = read("app/(app)/exam/[code]/page.tsx");

  it("분석 파트너 문항은 분석 라우트로 보내고, 대상이 아니면(409) 기존 라우트로 다시 보낸다", () => {
    expect(hook).toContain('ai_role === "analysis_partner"');
    expect(hook).toContain('fetch("/api/chat/analysis"');
    expect(hook).toContain("ANALYSIS_UNAVAILABLE_ERROR");
    expect(hook).toContain('fetch("/api/chat"');
    expect(hook.indexOf('fetch("/api/chat/analysis"')).toBeLessThan(hook.indexOf('fetch("/api/chat",'));
  });

  it("분석 턴의 클라이언트 타임아웃은 서버 함수 시간(300초)보다 10초 길다(서버가 저장을 마칠 때까지 기다린다)", () => {
    expect(ANALYSIS_CLIENT_TIMEOUT_MS).toBe(310_000);
    expect(hook).toContain("ANALYSIS_CLIENT_TIMEOUT_MS");
  });

  it("새로고침 뒤 셀 블록을 다시 붙이려고 세션 분석 기록을 읽는다", () => {
    expect(hook).toContain("/api/session/${sessionId}/analysis");
  });

  it("사이드바가 진행 표시와 셀 블록을 그린다", () => {
    expect(sidebar).toContain("<AnalysisProgressIndicator");
    expect(sidebar).toContain("<AnalysisTurnBlock");
    expect(sidebar).toContain("<AnalysisErrorNotice");
    expect(page).toContain("analysisProgress={examChat.analysisProgress}");
  });
});

describe("교수 채점 화면 배선", () => {
  it("대화 카드에 분석 기록을 넘기고 카드가 셀 블록을 읽기 전용으로 그린다", () => {
    const grade = read("app/(app)/instructor/[examId]/grade/[studentId]/page.tsx");
    const card = read("components/instructor/AIConversationsCard.tsx");
    expect(grade).toContain("qk.session.analysis(resolvedParams.studentId)");
    expect(grade).toContain("analysisByMessageId={analysisTurns}");
    expect(card).toContain("<AnalysisTurnBlock analysis={analysisByMessageId[message.id]} />");
  });
});

describe("화면 이벤트 파서", () => {
  it("알려진 이벤트만 모양을 확인해 돌려준다", () => {
    expect(parseAnalysisStreamEvent("status", '{"phase":"running","cell":3}')).toEqual({
      event: "status",
      data: { phase: "running", cell: 3 },
    });
    expect(parseAnalysisStreamEvent("status", '{"phase":"nope"}')).toBeNull();
    expect(parseAnalysisStreamEvent("text", '{"delta":"가"}')).toEqual({ event: "text", data: { delta: "가" } });
    expect(parseAnalysisStreamEvent("error", '{"code":"quota_exhausted"}')).toEqual({
      event: "error",
      data: { code: "quota_exhausted" },
    });
    expect(parseAnalysisStreamEvent("error", '{"code":"made_up"}')).toBeNull();
    expect(parseAnalysisStreamEvent("done", '{"message":{"content":"x"}}')).toBeNull();
    expect(parseAnalysisStreamEvent("done", "not json")).toBeNull();
    expect(parseAnalysisStreamEvent(null, '{"phase":"running"}')).toBeNull();
  });

  it("오류 코드와 턴 결과를 안내 문구 키로 바꾼다", () => {
    expect(errorCodeNoticeKey("limit_exceeded")).toBe("errors.limitExceeded");
    expect(errorCodeNoticeKey("quota_exhausted")).toBe("errors.quotaExhausted");
    expect(errorCodeNoticeKey("timeout")).toBe("errors.timeout");
    expect(outcomeNoticeKey("time_limit")).toBe("errors.limitExceeded");
    expect(outcomeNoticeKey("completed")).toBeNull();
  });
});

describe("문구", () => {
  const ko = JSON.parse(read("messages/ko/exam.json")).analysis as Record<string, unknown>;
  const en = JSON.parse(read("messages/en/exam.json")).analysis as Record<string, unknown>;
  const flatten = (obj: Record<string, unknown>, prefix = ""): Array<[string, string]> =>
    Object.entries(obj).flatMap(([k, v]) =>
      typeof v === "string" ? [[`${prefix}${k}`, v] as [string, string]] : flatten(v as Record<string, unknown>, `${prefix}${k}.`)
    );

  it("ko 와 en 의 키가 같다", () => {
    expect(flatten(ko).map(([k]) => k).sort()).toEqual(flatten(en).map(([k]) => k).sort());
  });

  it("소유자가 정한 안내 문장이 그대로 있다", () => {
    const map = Object.fromEntries(flatten(ko));
    expect(map.environmentRestarted).toBe("분석 환경이 다시 시작되어 이전 단계를 다시 실행했습니다.");
    expect(map["errors.limitExceeded"]).toBe("분석이 너무 길어 중단했습니다. 단계를 나눠 다시 요청해 주세요.");
    expect(map["errors.quotaExhausted"]).toBe("AI 분석을 잠시 사용할 수 없습니다. 감독자에게 알려 주세요.");
    expect(map.runningCode).toBe("코드 실행 중 ({count}회째)");
  });

  it("가운뎃점과 낫표를 쓰지 않는다", () => {
    for (const [key, value] of flatten(ko)) {
      expect(value, key).not.toMatch(/[·「」『』]/);
    }
  });

  it("셀 블록 컴포넌트가 쓰는 키가 모두 있다", () => {
    const source = read("components/chat/AnalysisTurnBlock.tsx") + read("components/exam/AnalysisProgressIndicator.tsx");
    const used = [...source.matchAll(/t\("analysis\.([A-Za-z.]+)"/g)].map((m) => m[1]);
    const keys = new Set(flatten(ko).map(([k]) => k));
    for (const key of used) expect(keys.has(key), key).toBe(true);
    expect(used.length).toBeGreaterThan(10);
  });
});
