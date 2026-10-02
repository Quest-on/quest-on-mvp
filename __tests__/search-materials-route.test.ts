/**
 * POST /api/search-materials 접근 제어 (#506)
 *
 * 로그인만 하면 누구나, examId 를 비우면 모든 교수자의 수업 자료 조각 본문과 파일 주소를 받을
 * 수 있었다. 교수자 본인 시험에 한해서만 검색을 허용한다. 검색 함수는 모킹하고, 거부 경로에서
 * 호출되지 않는지를 확인한다.
 */
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { currentUserMock, searchMock, examResult } = vi.hoisted(() => ({
  currentUserMock: vi.fn(),
  searchMock: vi.fn(),
  examResult: { current: { data: null as any, error: null as any } },
}));

vi.mock("@/lib/get-current-user", () => ({ currentUser: currentUserMock }));
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimitAsync: async () => ({ allowed: true }),
  RATE_LIMITS: { general: { limit: 60, windowSec: 60 } },
}));
vi.mock("@/lib/search-chunks", () => ({
  searchMaterialChunks: searchMock,
  formatSearchResultsAsContext: () => "context",
}));
vi.mock("@/lib/supabase-server", () => ({
  getSupabaseServer: () => ({
    from: () => {
      const chain = {
        select: () => chain,
        eq: () => chain,
        maybeSingle: async () => examResult.current,
      };
      return chain;
    },
  }),
}));

import { POST } from "@/app/api/search-materials/route";

const EXAM_ID = "11111111-1111-4111-8111-111111111111";

function post(body: Record<string, unknown>) {
  return POST(
    new NextRequest("http://localhost/api/search-materials", {
      method: "POST",
      body: JSON.stringify(body),
    })
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  searchMock.mockResolvedValue([{ content: "chunk", fileUrl: "https://example.test/a.pdf" }]);
  currentUserMock.mockResolvedValue({ id: "instructor-1", role: "instructor" });
  examResult.current = { data: { id: EXAM_ID, instructor_id: "instructor-1" }, error: null };
});

describe("POST /api/search-materials", () => {
  it("로그인하지 않으면 401", async () => {
    currentUserMock.mockResolvedValue(null);
    const res = await post({ query: "q", examId: EXAM_ID });
    expect(res.status).toBe(401);
    expect(searchMock).not.toHaveBeenCalled();
  });

  it("학생은 403 이고 검색하지 않는다", async () => {
    currentUserMock.mockResolvedValue({ id: "student-1", role: "student" });
    const res = await post({ query: "q", examId: EXAM_ID });
    expect(res.status).toBe(403);
    expect(searchMock).not.toHaveBeenCalled();
  });

  it("examId 를 비우면 400 이다 (전체 시험 검색 금지)", async () => {
    const res = await post({ query: "q" });
    expect(res.status).toBe(400);
    expect(searchMock).not.toHaveBeenCalled();
  });

  it("UUID 가 아닌 examId 는 400", async () => {
    const res = await post({ query: "q", examId: "not-a-uuid" });
    expect(res.status).toBe(400);
    expect(searchMock).not.toHaveBeenCalled();
  });

  it("없는 시험은 404", async () => {
    examResult.current = { data: null, error: null };
    const res = await post({ query: "q", examId: EXAM_ID });
    expect(res.status).toBe(404);
    expect(searchMock).not.toHaveBeenCalled();
  });

  it("다른 교수자의 시험은 403", async () => {
    examResult.current = { data: { id: EXAM_ID, instructor_id: "someone-else" }, error: null };
    const res = await post({ query: "q", examId: EXAM_ID });
    expect(res.status).toBe(403);
    expect(searchMock).not.toHaveBeenCalled();
  });

  it("본인 시험이면 그 시험 범위로 검색한다", async () => {
    const res = await post({ query: "q", examId: EXAM_ID });
    expect(res.status).toBe(200);
    expect(searchMock).toHaveBeenCalledWith("q", expect.objectContaining({ examId: EXAM_ID }));
  });
});
