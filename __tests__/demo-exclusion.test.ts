/**
 * 데모 시험 제외 감사 (이슈 #86 / AC-17).
 *
 * `is_demo` 를 별도 테이블이 아니라 `exams` 의 플래그로 둔 대가가 여기 있다:
 * **exams 를 읽는 지점이 늘어날 때마다 "데모를 포함할 것인가"를 판단해야 한다.**
 *
 * 이전 판은 `.eq("instructor_id", ...)` 문자열 모양 하나만 알아서, 정작 교수자
 * 홈의 실제 목록(`drive-handlers` 의 임베디드 관계 조회)을 통째로 놓쳤다.
 * 모양을 더 알아맞히려 드는 대신 **deny-by-default 레지스트리**로 바꾼다.
 *
 * 규칙: `exams` 를 읽는 파일은 전부 아래 REGISTRY 에 분류돼 있어야 한다.
 * 새 파일이 생기면 이 테스트가 실패하고, 작성자가 분류를 강제당한다. 분류를
 * 고르는 순간 "데모가 여기 나와도 되는가"를 반드시 생각하게 된다 — 그게 목적이다.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const root = path.resolve(__dirname, "..");

/**
 * - `excludes-demo`: 데모를 제외해야 하는 목록·집계 지점. `is_demo` 필터가 있는지 검사한다.
 * - `single-exam`: id/code 로 특정 exam 한 건을 다루는 지점. 소유자가 자기 데모를
 *   열어야 하므로(데모 완주가 온보딩의 목표다) 제외하지 않는다.
 * - `demo-neutral`: exam 행을 목록·통계로 쓰지 않는 지점(헬스체크, 상태 갱신 등).
 */
type Classification = "excludes-demo" | "single-exam" | "demo-neutral";

const REGISTRY: Record<string, { kind: Classification; why: string }> = {
  // ── 데모를 빼야 하는 목록·집계 ──────────────────────────────────
  "app/api/supa/handlers/drive-handlers.ts": {
    kind: "excludes-demo",
    why: "교수자 홈의 실제 목록. 여기 빠지면 데모가 목록·검색·총계에 그대로 나온다",
  },
  "app/api/supa/handlers/exam-handlers.ts": {
    kind: "excludes-demo",
    why: "getInstructorExams 목록 조회",
  },
  "lib/plan-limits.ts": {
    kind: "excludes-demo",
    why: "발행 횟수 카운트. 데모를 세면 한도를 한 칸 잃는다",
  },
  "app/api/admin/instructors/publishing/route.ts": {
    kind: "excludes-demo",
    why: "관리자 발행 현황 집계",
  },

  // ── 단건 exam (소유자/응시자 경로) ─────────────────────────────
  "app/api/analytics/exam/[examId]/overview/route.ts": { kind: "single-exam", why: "단건 분석" },
  "app/api/assignment-chat/route.ts": { kind: "single-exam", why: "세션의 exam 로드" },
  "app/api/chat/route.ts": { kind: "single-exam", why: "세션의 exam 로드" },
  "app/api/exam/[examId]/end/route.ts": { kind: "single-exam", why: "단건 상태 전이" },
  "app/api/exam/[examId]/export/csv/route.ts": { kind: "single-exam", why: "단건 결과 내보내기" },
  "app/api/exam/[examId]/export/excel/route.ts": { kind: "single-exam", why: "단건 결과 내보내기" },
  "app/api/exam/[examId]/late-entry/route.ts": { kind: "single-exam", why: "단건 지각 입장" },
  "app/api/exam/[examId]/live-messages/route.ts": { kind: "single-exam", why: "단건 실시간" },
  "app/api/exam/[examId]/release-grades/route.ts": { kind: "single-exam", why: "단건 성적 공개" },
  "app/api/exam/[examId]/sessions/route.ts": { kind: "single-exam", why: "단건 응시자 목록" },
  "app/api/exam/[examId]/start/route.ts": { kind: "single-exam", why: "단건 시작" },
  "app/api/exam/[examId]/student-summaries/route.ts": { kind: "single-exam", why: "단건 채점 요약" },
  "app/api/feedback-chat/route.ts": { kind: "single-exam", why: "code 로 단건 조회" },
  "app/api/feedback/route.ts": { kind: "single-exam", why: "code 로 단건 조회" },
  "app/api/instructor/generate-summary/route.ts": { kind: "single-exam", why: "세션의 exam 로드" },
  "app/api/onboarding/demo/route.ts": {
    kind: "single-exam",
    why: "데모 생성 라우트. is_demo=true 로 만드는 곳이고 기존 데모는 is_demo 로 좁혀 조회한다",
  },
  "app/api/internal/bulk-grade-worker/route.ts": { kind: "single-exam", why: "단건 채점 워커" },
  "app/api/session/[sessionId]/grade/route.ts": { kind: "single-exam", why: "세션의 exam 로드" },
  "app/api/session/[sessionId]/live-messages/route.ts": { kind: "single-exam", why: "세션의 exam 로드" },
  "app/api/session/[sessionId]/preflight/route.ts": { kind: "single-exam", why: "세션의 exam 로드" },
  "app/api/session/[sessionId]/route.ts": { kind: "single-exam", why: "세션의 exam 로드" },
  "app/api/student/assignment/[code]/review/route.ts": { kind: "single-exam", why: "code 로 단건 조회" },
  "app/api/student/session/[sessionId]/report/route.ts": { kind: "single-exam", why: "세션의 exam 로드" },
  "app/api/supa/handlers/assignment-handlers.ts": { kind: "single-exam", why: "단건 과제 조회" },
  "app/api/supa/handlers/session-handlers.ts": { kind: "single-exam", why: "code 로 단건 조회 후 세션 생성" },
  "app/api/supa/handlers/submission-handlers.ts": { kind: "single-exam", why: "세션의 exam 로드" },
  "lib/assignment-quiz.ts": { kind: "single-exam", why: "세션의 exam 로드" },
  "lib/bulk-grade-access.ts": { kind: "single-exam", why: "단건 접근 검증" },
  "lib/bulk-grade-score-cluster.ts": { kind: "single-exam", why: "단건 채점" },
  "lib/bulk-grading.ts": { kind: "single-exam", why: "단건 채점" },
  "lib/case-grade-access.ts": { kind: "single-exam", why: "단건 접근 검증" },
  "lib/grading.ts": { kind: "single-exam", why: "단건 채점" },
  "lib/objective-grade-view.ts": { kind: "single-exam", why: "단건 채점 뷰" },

  // ── 데모 여부가 의미 없는 지점 ─────────────────────────────────
  "app/api/health/route.ts": { kind: "demo-neutral", why: "DB 헬스 프로브. 사용자 데이터를 안 돌려준다" },
  "app/api/internal/process-rag/route.ts": { kind: "demo-neutral", why: "rag_status 갱신만" },
  "lib/assignment-deadline-sweep.ts": { kind: "demo-neutral", why: "마감 스윕. 데모 과제도 마감돼야 정상이다" },
  "lib/demo-completion.ts": {
    kind: "demo-neutral",
    why: "데모 완주 계측 판정. exams 를 목록으로 읽지 않고 is_demo 단건 조회만 쓴다",
  },

  // ── 아직 결론 나지 않은 지점 (후속) ───────────────────────────
  // 학생 응시 이력·통계와 AI 비용 집계는 AC-17 의 "교수자 목록·통계"에 직접
  // 해당하지 않지만, 데모 세션이 섞이는 건 사실이다. 데모 완주(#83)가 실제로
  // 세션을 만들기 시작하면 판단이 필요하다. 지금 조용히 넘기지 않도록 등록해 둔다.
  "app/api/student/sessions/route.ts": {
    kind: "single-exam",
    why: "학생 이력. 데모 세션 포함 여부는 #83 이후 판단 — 후속 이슈",
  },
  "app/api/student/sessions/stats/route.ts": {
    kind: "single-exam",
    why: "학생 통계. 데모 세션 포함 여부는 #83 이후 판단 — 후속 이슈",
  },
  "lib/ai-events-store.ts": {
    kind: "demo-neutral",
    why: "AI 비용은 실제 지출이라 데모도 포함이 맞다 (AC-19 의 비용 가시성)",
  },
};

function collectSources(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".next") continue;
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) collectSources(full, acc);
    else if (/\.tsx?$/.test(entry)) acc.push(full);
  }
  return acc;
}

/** `exams` 를 읽는 파일. 직접 조회와 임베디드 관계 조회를 모두 센다. */
function collectExamReaders(): string[] {
  const files: string[] = [];
  for (const file of [
    ...collectSources(path.join(root, "app", "api")),
    ...collectSources(path.join(root, "lib")),
  ]) {
    const source = readFileSync(file, "utf8").replace(/\r\n/g, "\n");
    const readsExams =
      source.includes('.from("exams")') ||
      source.includes("exams!inner") ||
      /\bexams \(/.test(source);
    if (readsExams) files.push(path.relative(root, file).replace(/\\/g, "/"));
  }
  return files.sort();
}

describe("exams 조회 지점 레지스트리 (AC-17)", () => {
  const readers = collectExamReaders();

  it("스캐너가 조용히 0건이 되지 않는다", () => {
    // 스캐너가 망가지면 아래 단언들이 전부 공허하게 통과한다.
    expect(readers.length).toBeGreaterThan(20);
    expect(readers).toContain("app/api/supa/handlers/drive-handlers.ts");
  });

  it("exams 를 읽는 모든 파일이 분류돼 있다 — 새 조회 지점은 여기서 막힌다", () => {
    const unclassified = readers.filter((file) => !REGISTRY[file]);

    expect(
      unclassified,
      `분류되지 않은 exams 조회 지점이 있다. __tests__/demo-exclusion.test.ts 의 REGISTRY 에 ` +
        `excludes-demo / single-exam / demo-neutral 중 하나로 등록하고 이유를 적어라.`
    ).toEqual([]);
  });

  it("레지스트리에 죽은 항목이 없다 — 지워진 파일이 남아 있으면 감사가 헐거워진다", () => {
    const stale = Object.keys(REGISTRY).filter((file) => !readers.includes(file));

    expect(stale).toEqual([]);
  });

  it("excludes-demo 로 분류된 지점은 실제로 is_demo 를 건다", () => {
    const missing = Object.entries(REGISTRY)
      .filter(([, entry]) => entry.kind === "excludes-demo")
      .map(([file]) => file)
      .filter((file) => {
        const source = readFileSync(path.join(root, file), "utf8");
        // 주석에 적어 놓고 통과하는 걸 막으려면 실제 필터 형태를 봐야 한다.
        return !/\.eq\(\s*["'](?:exams\.)?is_demo["']\s*,\s*(?:false|true)\s*\)/.test(source);
      });

    expect(missing).toEqual([]);
  });
});

describe("교수자 홈 목록의 데모 제외 (AC-17)", () => {
  const source = readFileSync(
    path.join(root, "app/api/supa/handlers/drive-handlers.ts"),
    "utf8"
  ).replace(/\r\n/g, "\n");

  it("시험 노드 조회가 inner join 으로 좁혀져 있다", () => {
    expect(source).toContain("exams!inner");
    expect(source).toMatch(/\.eq\("exams\.is_demo", false\)/);
  });

  it("필터가 count/range 이전에 걸린다 — 나중에 거르면 총계와 페이지가 어긋난다", () => {
    const filterIdx = source.indexOf('.eq("exams.is_demo", false)');
    const rangeIdx = source.indexOf(".range(examOffset");

    expect(filterIdx).toBeGreaterThan(-1);
    expect(rangeIdx).toBeGreaterThan(filterIdx);
  });

  it("폴더 조회는 inner join 을 쓰지 않는다 — 폴더에는 exam 이 없다", () => {
    const folderSelect = source.slice(
      source.indexOf("const folderSelectFields"),
      source.indexOf("const examSelectFields")
    );

    expect(folderSelect).not.toContain("!inner");
  });

  it("폴더 자식 수에서도 데모를 뺀다", () => {
    expect(source).toContain('.select("parent_id, exams (is_demo)")');
    expect(source).toMatch(/if \(row\.exams\?\.is_demo\) continue;/);
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
