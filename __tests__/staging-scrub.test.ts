import { describe, it, expect } from "vitest";
import {
  fakeEmail,
  fakeName,
  fakeStudentNumber,
  mapId,
  scrubJsonDeep,
  scrubValue,
  scrubRow,
  assertAllColumnsClassified,
  findPiiLeaks,
  SCRUB_ALLOWLIST,
  type ColumnRule,
} from "@/lib/staging/scrub";

describe("결정적 가짜값", () => {
  it("같은 입력 → 같은 출력, 다른 입력 → 다른 출력", () => {
    expect(fakeEmail("a@x.com")).toBe(fakeEmail("a@x.com"));
    expect(fakeEmail("a@x.com")).not.toBe(fakeEmail("b@x.com"));
    expect(fakeEmail("seed")).toMatch(/^user_[0-9a-f]{12}@staging\.invalid$/);
    expect(mapId("real-id-1")).toBe(mapId("real-id-1"));
    expect(mapId("real-id-1")).not.toBe(mapId("real-id-2"));
    expect(fakeStudentNumber("s1")).toMatch(/^\d{10}$/);
    expect(fakeName("n1")).toBe(fakeName("n1"));
  });
});

describe("scrubJsonDeep", () => {
  it("중첩 PII key 는 redact, 안전 값은 보존", () => {
    const input = {
      tokens: 123,
      status: "ok",
      content: "학생 답안 본문",
      nested: { email: "a@b.com", answer: "정답", score: 5 },
      arr: [{ comment: "민감" }, { count: 2 }],
    };
    const out = scrubJsonDeep(input) as Record<string, unknown>;
    expect(out.tokens).toBe(123);
    expect(out.status).toBe("ok");
    expect(out.content).toBe("[redacted]");
    expect((out.nested as Record<string, unknown>).email).toBe("[redacted]");
    expect((out.nested as Record<string, unknown>).answer).toBe("[redacted]");
    expect((out.nested as Record<string, unknown>).score).toBe(5);
    expect((out.arr as Record<string, unknown>[])[0].comment).toBe("[redacted]");
    expect((out.arr as Record<string, unknown>[])[1].count).toBe(2);
  });
});

describe("scrubValue", () => {
  it("규칙별 처리", () => {
    expect(scrubValue("keep", 5, "s")).toBe(5);
    expect(scrubValue("null", "x", "s")).toBeNull();
    expect(scrubValue("redact", "민감", "s")).toBe("[redacted]");
    expect(scrubValue("redact", null, "s")).toBeNull();
    expect(scrubValue("fake-email", "a@b.com", "s")).toMatch(/@staging\.invalid$/);
    expect(scrubValue("id-map", "real", "s")).toMatch(/^id_/);
  });
});

describe("assertAllColumnsClassified (drift fail-close)", () => {
  it("미분류 column 이 있으면 throw", () => {
    const allow: Record<string, ColumnRule> = { id: "id-map", name: "fake-name" };
    expect(() => assertAllColumnsClassified("t", ["id", "name", "secret_new_col"], allow)).toThrow(
      /secret_new_col/
    );
  });
  it("모두 분류되면 통과", () => {
    const allow: Record<string, ColumnRule> = { id: "id-map", name: "fake-name" };
    expect(() => assertAllColumnsClassified("t", ["id", "name"], allow)).not.toThrow();
  });
});

describe("scrubRow + raw/compressed mirror", () => {
  it("messages: content redact + compressed_content null 동시 처리, 안전값 보존", () => {
    const row = {
      id: "m1",
      session_id: "sess1",
      q_idx: 0,
      role: "user",
      content: "실명 홍길동이 보낸 질문",
      created_at: "2026-01-01",
      compressed_content: "BASE64COMPRESSED",
      compression_metadata: { algorithm: "lz", content: "민감" },
      response_id: "resp_abc",
      message_type: "concept",
      tokens_used: 42,
      metadata: { prompt: "민감 프롬프트", input_tokens: 10 },
    };
    const out = scrubRow("messages", row, SCRUB_ALLOWLIST.messages, "seed");
    expect(out.content).toBe("[redacted]");
    expect(out.compressed_content).toBeNull(); // raw 와 mirror 둘 다 처리됨
    expect(out.response_id).toBeNull();
    expect(out.q_idx).toBe(0);
    expect(out.tokens_used).toBe(42);
    expect(out.id).toMatch(/^id_/);
    expect((out.compression_metadata as Record<string, unknown>).algorithm).toBe("lz");
    expect((out.compression_metadata as Record<string, unknown>).content).toBe("[redacted]");
    expect((out.metadata as Record<string, unknown>).prompt).toBe("[redacted]");
    expect((out.metadata as Record<string, unknown>).input_tokens).toBe(10);
  });

  it("submissions: answer/compressed_answer_data 쌍 처리", () => {
    const row = {
      id: "sub1",
      session_id: "s1",
      q_idx: 1,
      answer: "학생 서술 답안",
      created_at: "x",
      updated_at: "y",
      answer_history: [{ text: "이전답안", timestamp: "t" }],
      edit_count: 3,
      compressed_answer_data: "ZIPPED",
      compression_metadata: {},
      workspace_state: { code: "print('hi')", notes: "메모" },
    };
    const out = scrubRow("submissions", row, SCRUB_ALLOWLIST.submissions, "seed");
    expect(out.answer).toBe("[redacted]");
    expect(out.compressed_answer_data).toBeNull();
    expect((out.answer_history as Record<string, unknown>[])[0].text).toBe("[redacted]");
    expect(out.edit_count).toBe(3);
  });
});

describe("findPiiLeaks (PII scan)", () => {
  it("실제 PII 패턴 탐지", () => {
    expect(findPiiLeaks("연락처 hong@gmail.com 입니다")).toContain("email");
    expect(findPiiLeaks("010-1234-5678")).toContain("korean-phone");
    expect(findPiiLeaks("ref=fmhpwotcfshoqpdhzqqj")).toContain("prod-ref");
    expect(
      findPiiLeaks(
        "key eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyZWYiOiJ4In0.aGVsbG93b3JsZHNpZw"
      )
    ).toContain("supabase-service-jwt");
    expect(findPiiLeaks("https://x.supabase.co/file/a.pdf")).toContain("file-url");
  });
  it("스크럽된/안전 텍스트는 통과(staging.invalid 이메일 비탐지)", () => {
    expect(findPiiLeaks("user_abcdef012345@staging.invalid 내용 [redacted]")).toEqual([]);
    expect(findPiiLeaks("점수 5, 상태 ok")).toEqual([]);
  });
});
