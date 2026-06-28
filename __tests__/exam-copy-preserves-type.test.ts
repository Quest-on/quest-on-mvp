/**
 * 복사본 type 보존 회귀 가드
 *
 * 버그: 과제 복사본이 시험으로 생성되어, 편집 시 시험 편집기로 라우팅됐다.
 * 루트 코즈: copyExam 페이로드가 원본 `type`(및 과제 정체성 필드)을 보존하지 않았다.
 * 이 테스트는 buildCopiedExamPayload가 type/assignment_prompt/initial_state/canvas_config를
 * 보존하고, deadline은 복사하지 않음을 잠근다.
 */
import { describe, expect, it } from "vitest";
import { buildCopiedExamPayload } from "@/lib/exam-copy";

const OPTS = { code: "NEWCODE", instructorId: "instructor-1", now: "2026-06-22T00:00:00.000Z" };

describe("buildCopiedExamPayload — 복사본 type 보존", () => {
  it("과제(report) 복사 시 type을 'report'로 보존한다", () => {
    const payload = buildCopiedExamPayload(
      {
        title: "조직행동론",
        type: "report",
        assignment_prompt: "리서치 과제 안내",
        initial_state: { foo: 1 },
        canvas_config: { bar: 2 },
        questions: [],
      },
      OPTS,
    );
    expect(payload.type).toBe("report");
    expect(payload.assignment_prompt).toBe("리서치 과제 안내");
    expect(payload.initial_state).toEqual({ foo: 1 });
    expect(payload.canvas_config).toEqual({ bar: 2 });
  });

  it("다양한 과제 타입(code/erd/mindmap/assignment)에서도 type을 그대로 보존한다", () => {
    for (const t of ["assignment", "code", "erd", "mindmap"]) {
      const payload = buildCopiedExamPayload({ title: "T", type: t, questions: [] }, OPTS);
      expect(payload.type).toBe(t);
      // type !== "exam" 이어야 대시보드가 과제 편집기로 라우팅한다
      expect(payload.type).not.toBe("exam");
    }
  });

  it("시험(exam) 복사는 회귀 없이 type을 보존한다", () => {
    expect(buildCopiedExamPayload({ title: "T", type: "exam", questions: [] }, OPTS).type).toBe("exam");
    // type이 없던(null) 시험도 그대로 null 유지
    expect(buildCopiedExamPayload({ title: "T", questions: [] }, OPTS).type).toBeNull();
  });

  it("deadline/close_at은 복사하지 않는다 (복사본은 draft)", () => {
    const payload = buildCopiedExamPayload(
      { title: "T", type: "report", questions: [] },
      OPTS,
    ) as Record<string, unknown>;
    expect(payload).not.toHaveProperty("deadline");
    expect(payload).not.toHaveProperty("close_at");
    expect(payload.status).toBe("draft");
  });

  it("제목에 (복사본) 접미, 코드/강사/시각이 옵션값으로 설정된다", () => {
    const payload = buildCopiedExamPayload({ title: "원본제목", type: "report", questions: [] }, OPTS);
    expect(payload.title).toBe("원본제목 (복사본)");
    expect(payload.code).toBe("NEWCODE");
    expect(payload.instructor_id).toBe("instructor-1");
    expect(payload.created_at).toBe(OPTS.now);
    expect(payload.updated_at).toBe(OPTS.now);
  });

  it("문항의 core_ability는 제거한다", () => {
    const payload = buildCopiedExamPayload(
      {
        title: "T",
        type: "report",
        questions: [{ id: "q1", text: "문항", core_ability: "민감필드" }],
      },
      OPTS,
    );
    const q = (payload.questions as Array<Record<string, unknown>>)[0];
    expect(q).not.toHaveProperty("core_ability");
    expect(q.id).toBe("q1");
  });
});
