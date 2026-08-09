/**
 * 데모 시험 제외 회귀 (이슈 #86 / AC-17).
 *
 * `is_demo` 를 별도 테이블이 아니라 `exams` 의 플래그로 둔 대가가 여기 있다:
 * **exams 를 목록으로 읽는 모든 지점이 필터를 걸어야 한다.** 하나라도 빠뜨리면
 * 온보딩용 데모가 교수자 시험 목록에 튀어나오고, 발행 카운트를 한 칸 먹는다.
 *
 * 그래서 두 겹으로 막는다.
 *   1. 소스 감사 — 새 목록 쿼리가 필터 없이 추가되면 여기서 걸린다.
 *   2. 카운트 함수 단위 테스트 — 발행 카운트의 정의를 고정한다.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const root = path.resolve(__dirname, "..");

function collectSources(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".next") continue;
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      collectSources(full, acc);
    } else if (/\.tsx?$/.test(entry)) {
      acc.push(full);
    }
  }
  return acc;
}

type ExamQuery = { file: string; chain: string };

/**
 * `.from("exams")` 뒤로 이어지는 체인을 잘라 온다. 세미콜론까지가 한 체인이다
 * (Supabase 쿼리 빌더는 한 문장으로 쓰인다).
 */
function collectExamQueries(): ExamQuery[] {
  const found: ExamQuery[] = [];

  for (const file of [
    ...collectSources(path.join(root, "app")),
    ...collectSources(path.join(root, "lib")),
  ]) {
    const source = readFileSync(file, "utf8").replace(/\r\n/g, "\n");
    let index = source.indexOf('.from("exams")');

    while (index !== -1) {
      const end = source.indexOf(";", index);
      found.push({
        file: path.relative(root, file).replace(/\\/g, "/"),
        chain: source.slice(index, end === -1 ? index + 600 : end),
      });
      index = source.indexOf('.from("exams")', index + 1);
    }
  }

  return found;
}

/**
 * 목록형 쿼리인가. `instructor_id` 로 좁히면서 단건 식별자(`id`/`code`)가 없으면
 * 그 교수자의 exam 을 **여러 건** 가져온다는 뜻이다.
 */
function isInstructorListQuery(chain: string): boolean {
  if (!chain.includes('.eq("instructor_id"')) return false;
  if (chain.includes('.eq("id"')) return false;
  if (chain.includes('.eq("code"')) return false;
  return true;
}

describe("exams 목록 조회의 is_demo 필터 (AC-17)", () => {
  const queries = collectExamQueries();

  it("감사 대상 쿼리를 실제로 찾아낸다 — 스캐너가 조용히 0건이 되면 안 된다", () => {
    // 스캐너가 망가지면 모든 단언이 공허하게 통과한다. 최소 표본을 고정한다.
    expect(queries.length).toBeGreaterThan(10);
    expect(queries.some((q) => q.file.includes("exam-handlers.ts"))).toBe(true);
  });

  it("교수자 목록형 쿼리는 전부 is_demo 를 건다", () => {
    const listQueries = queries.filter((q) => isInstructorListQuery(q.chain));

    // 최소 한 건(getInstructorExams)은 존재해야 한다.
    expect(listQueries.length).toBeGreaterThan(0);

    const missing = listQueries
      .filter((q) => !q.chain.includes("is_demo"))
      .map((q) => q.file);

    expect(missing).toEqual([]);
  });

  it("발행 카운트 쿼리는 is_demo 없이 first_published_at 만 보지 않는다", () => {
    const publishCounts = queries.filter((q) =>
      q.chain.includes("first_published_at")
    );

    const missing = publishCounts
      .filter((q) => !q.chain.includes("is_demo"))
      .map((q) => q.file);

    expect(missing).toEqual([]);
  });
});

// ── countPublishedExams 단위 ────────────────────────────────────────────
const not = vi.fn();
const eqDemo = vi.fn();
const eqInstructor = vi.fn();
const select = vi.fn();

vi.mock("@/lib/supabase-server", () => ({
  getSupabaseServer: () => ({
    from: () => ({
      select: (...args: unknown[]) => {
        select(...args);
        return {
          eq: (...a: unknown[]) => {
            eqInstructor(...a);
            return {
              eq: (...b: unknown[]) => {
                eqDemo(...b);
                return { not };
              },
            };
          },
        };
      },
    }),
  }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  not.mockResolvedValue({ count: 2, error: null });
});

describe("countPublishedExams (AC-11, AC-17)", () => {
  it("데모를 빼고, 한 번이라도 발행된 exam 만 센다", async () => {
    const { countPublishedExams } = await import("../lib/plan-limits");

    await expect(countPublishedExams("inst-1")).resolves.toBe(2);

    expect(select).toHaveBeenCalledWith("id", { count: "exact", head: true });
    expect(eqInstructor).toHaveBeenCalledWith("instructor_id", "inst-1");
    expect(eqDemo).toHaveBeenCalledWith("is_demo", false);
    expect(not).toHaveBeenCalledWith("first_published_at", "is", null);
  });

  it("count 가 null 이면 0 이다 — undefined 가 한도 계산으로 새 나가지 않는다", async () => {
    not.mockResolvedValue({ count: null, error: null });
    const { countPublishedExams } = await import("../lib/plan-limits");

    await expect(countPublishedExams("inst-1")).resolves.toBe(0);
  });

  it("조회 실패는 삼키지 않는다 — 0 으로 응답하면 한도가 조용히 풀린다", async () => {
    not.mockResolvedValue({ count: null, error: new Error("boom") });
    const { countPublishedExams } = await import("../lib/plan-limits");

    await expect(countPublishedExams("inst-1")).rejects.toThrow();
  });
});
