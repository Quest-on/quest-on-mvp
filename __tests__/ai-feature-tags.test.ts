import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { AI_FEATURES, type AiFeature } from "@/lib/ai-pricing";

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");

/**
 * AI 호출의 feature 태그 계약. (#181)
 *
 * 벌크 채점 워커가 `bulk_grading_chat` 으로 태깅하고 있었다. 그런데 그
 * 워커는 채팅이 아니라 점수를 만든다. 기준 토론 라우트가 같은 태그를 쓰므로
 * `ai_events` 기반 비용·지연 분석에서 "교수와의 기준 토론" 과 "실제 채점
 * 실행" 이 한 덩어리로 뭉쳐 구분되지 않았다.
 */
describe("벌크 채점 feature 태그 분리", () => {
  it("실행 경로가 채팅 태그를 쓰지 않는다", () => {
    // 이게 핵심이다. 되돌아오면 비용 분석이 다시 뭉갠다.
    const worker = read("app/api/internal/bulk-grade-worker/route.ts");
    expect(worker).not.toMatch(/feature: "bulk_grading_chat"/);
    expect(worker).toMatch(/feature: "bulk_grading_execute"/);
  });

  it("점수 재보정도 자기 태그를 쓴다", () => {
    const cluster = read("lib/bulk-grade-score-cluster.ts");
    expect(cluster).not.toMatch(/feature: "bulk_grading_chat"/);
    expect(cluster).toMatch(/feature: "bulk_grading_score_cluster"/);
  });

  it("기준 토론 라우트는 채팅 태그를 유지한다", () => {
    // 이쪽은 실제로 채팅이다. 같이 바꾸면 반대 방향으로 뭉갠다.
    expect(read("app/api/exam/[examId]/bulk-grade/chat/route.ts")).toMatch(
      /feature: "bulk_grading_chat"/
    );
    expect(read("app/api/exam/[examId]/bulk-grade/chat-options/route.ts")).toMatch(
      /feature: "bulk_grading_chat_options"/
    );
  });
});

describe("AiFeature 값 보존", () => {
  it("과거 값을 지우거나 이름을 바꾸지 않는다", () => {
    // 과거 ai_events 행이 이 문자열을 참조한다. 제거하면 그 행들이 미아가 된다.
    const legacy: AiFeature[] = [
      "bulk_grading_chat",
      "bulk_grading_chat_options",
      "bulk_grading_criteria_extract",
      "student_chat",
      "instructor_chat",
      "auto_grading_question",
      "embedding",
    ];
    for (const f of legacy) {
      expect(AI_FEATURES, `${f} 가 사라졌다`).toContain(f);
    }
  });

  it("새 값이 유니온과 배열 양쪽에 있다", () => {
    // 한쪽만 추가하면 타입은 통과하는데 런타임 목록에서 빠지거나 그 반대다.
    const source = read("lib/ai-pricing.ts");
    for (const f of ["bulk_grading_execute", "bulk_grading_score_cluster"]) {
      expect(source, `${f} 유니온 누락`).toContain(`| "${f}"`);
      expect(AI_FEATURES, `${f} 배열 누락`).toContain(f as AiFeature);
    }
  });

  it("배열에 중복이 없다", () => {
    expect(new Set(AI_FEATURES).size).toBe(AI_FEATURES.length);
  });
});
