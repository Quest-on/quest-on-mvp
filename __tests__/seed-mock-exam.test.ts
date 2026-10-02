import { readFileSync } from "node:fs";
import path from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { buildExamInsertPayload } from "../lib/exam-insert-payload";
import {
  deriveProjectRef,
  main,
  parseArgs,
  resolveConnection,
  seedMockExam,
  validateMockExamSpec,
  type MockExamSpec,
  type SeedOptions,
} from "../scripts/seed-mock-exam";

/**
 * 모의시험 시드 스크립트 (#513).
 *
 * 교수님 계정으로 로그인하지 않고 서비스 롤로 시험을 만드는 스크립트다. 운영 DB 에 닿을 수 있는
 * 명령이라 이 테스트가 실제 DB 대신 **가짜 클라이언트**로 동작을 전부 고정한다.
 * 이 파일의 어떤 테스트도 네트워크에 나가지 않는다.
 */

const ROOT = path.resolve(__dirname, "..");
const SCRIPT_SOURCE = readFileSync(path.join(ROOT, "scripts/seed-mock-exam.ts"), "utf8");
const FIXTURE = JSON.parse(
  readFileSync(path.join(__dirname, "fixtures/mock-exam-spec.sample.json"), "utf8")
) as unknown;

const INSTRUCTOR = "inst-1";
const OTHER_INSTRUCTOR = "inst-2";
const FOLDER_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const PROJECT_REF = "abcdefghijklmnop";
const NOW = "2026-10-03T00:00:00.000Z";

// ─────────────────────────────────────────────────────────────────────────────
// 가짜 Supabase 클라이언트: 메모리 테이블 위에서 이 스크립트가 쓰는 질의만 흉내 낸다.
// 읽기와 쓰기를 따로 기록해, "dry-run 은 아무것도 쓰지 않는다" 를 호출 기록으로 단언한다.
// ─────────────────────────────────────────────────────────────────────────────
type Row = Record<string, unknown>;
type DbError = { code?: string; message: string };

type Write = { table: string; op: "insert" | "update" | "delete"; payload?: Row; filters: string[] };

function createFakeDb(
  seed: Partial<Record<"profiles" | "instructor_profiles" | "exam_nodes" | "exams", Row[]>> = {},
  hooks: {
    /** insert 를 실패시키려면 오류를 돌려준다. n 은 그 테이블의 몇 번째 insert 시도인지(1부터). */
    failInsert?: (table: string, payload: Row, n: number) => DbError | null;
    failDelete?: (table: string) => DbError | null;
    failRead?: (table: string) => DbError | null;
  } = {}
) {
  const tables: Record<string, Row[]> = {
    profiles: [],
    instructor_profiles: [],
    exam_nodes: [],
    exams: [],
    ...Object.fromEntries(Object.entries(seed).map(([k, v]) => [k, (v ?? []).map((r) => ({ ...r }))])),
  };
  const writes: Write[] = [];
  const reads: string[] = [];
  const insertAttempts: Record<string, number> = {};
  let seq = 0;

  function from(table: string) {
    if (!(table in tables)) throw new Error(`Unexpected table: ${table}`);
    const preds: Array<(r: Row) => boolean> = [];
    const filterDesc: string[] = [];
    let op: "select" | "insert" | "update" | "delete" = "select";
    let payload: Row | undefined;
    let selecting = false;
    let order: { col: string; asc: boolean } | null = null;
    let limitN: number | null = null;

    function run(mode: "many" | "single" | "maybeSingle"): Promise<{ data: unknown; error: DbError | null }> {
      if (op === "select") {
        reads.push(table);
        const failure = hooks.failRead?.(table);
        if (failure) return Promise.resolve({ data: null, error: failure });
        let rows = tables[table].filter((r) => preds.every((p) => p(r)));
        if (order) {
          const { col, asc } = order;
          rows = [...rows].sort((a, b) => {
            const av = Number(a[col] ?? 0);
            const bv = Number(b[col] ?? 0);
            return asc ? av - bv : bv - av;
          });
        }
        if (limitN !== null) rows = rows.slice(0, limitN);
        rows = rows.map((r) => ({ ...r }));
        if (mode === "many") return Promise.resolve({ data: rows, error: null });
        if (mode === "maybeSingle") {
          if (rows.length > 1) return Promise.resolve({ data: null, error: { code: "PGRST116", message: "multiple rows" } });
          return Promise.resolve({ data: rows[0] ?? null, error: null });
        }
        if (rows.length !== 1) return Promise.resolve({ data: null, error: { code: "PGRST116", message: "no single row" } });
        return Promise.resolve({ data: rows[0], error: null });
      }
      if (op === "insert") {
        insertAttempts[table] = (insertAttempts[table] ?? 0) + 1;
        writes.push({ table, op, payload: structuredClone(payload!), filters: [] });
        const failure = hooks.failInsert?.(table, payload!, insertAttempts[table]);
        if (failure) return Promise.resolve({ data: null, error: failure });
        const row: Row = { id: `${table}-${++seq}`, ...structuredClone(payload!) };
        tables[table].push(row);
        return Promise.resolve({ data: selecting ? { ...row } : null, error: null });
      }
      if (op === "delete") {
        writes.push({ table, op, filters: [...filterDesc] });
        const failure = hooks.failDelete?.(table);
        if (failure) return Promise.resolve({ data: null, error: failure });
        tables[table] = tables[table].filter((r) => !preds.every((p) => p(r)));
        return Promise.resolve({ data: null, error: null });
      }
      writes.push({ table, op, payload: structuredClone(payload!), filters: [...filterDesc] });
      for (const r of tables[table]) if (preds.every((p) => p(r))) Object.assign(r, payload);
      return Promise.resolve({ data: null, error: null });
    }

    const api = {
      select: () => {
        selecting = true;
        return api;
      },
      insert: (p: Row) => {
        op = "insert";
        payload = p;
        return api;
      },
      update: (p: Row) => {
        op = "update";
        payload = p;
        return api;
      },
      delete: () => {
        op = "delete";
        return api;
      },
      eq: (col: string, val: unknown) => {
        preds.push((r) => r[col] === val);
        filterDesc.push(`${col}=${String(val)}`);
        return api;
      },
      is: (col: string, val: null) => {
        preds.push((r) => (r[col] ?? null) === val);
        filterDesc.push(`${col} is ${String(val)}`);
        return api;
      },
      order: (col: string, o?: { ascending?: boolean }) => {
        order = { col, asc: o?.ascending !== false };
        return api;
      },
      limit: (n: number) => {
        limitN = n;
        return api;
      },
      single: () => run("single"),
      maybeSingle: () => run("maybeSingle"),
      then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
        run("many").then(resolve, reject),
    };
    return api;
  }

  return { client: { from } as unknown as SupabaseClient, tables, writes, reads };
}

const verifiedWorld: Parameters<typeof createFakeDb>[0] = {
  profiles: [{ id: INSTRUCTOR, role: "instructor", plan: "verified", status: "approved" }],
  instructor_profiles: [{ id: INSTRUCTOR, status: "approved" }],
};

const spec = (validateMockExamSpec(FIXTURE) as { ok: true; spec: MockExamSpec }).spec;

function run(db: ReturnType<typeof createFakeDb>, overrides: Partial<SeedOptions> = {}) {
  const lines: string[] = [];
  const codes = ["AAAAAA", "BBBBBB", "CCCCCC", "DDDDDD"];
  const promise = seedMockExam({
    client: db.client,
    spec,
    instructorId: INSTRUCTOR,
    apply: false,
    projectRef: PROJECT_REF,
    confirmProjectRef: null,
    now: () => NOW,
    generateCode: () => codes.shift() ?? "ZZZZZZ",
    out: (line) => lines.push(line),
    ...overrides,
  });
  return promise.then((report) => ({ report, output: lines.join("\n") }));
}

// ─────────────────────────────────────────────────────────────────────────────
// 스펙 검증 (순수 함수)
// ─────────────────────────────────────────────────────────────────────────────
describe("validateMockExamSpec", () => {
  const good = () => structuredClone(FIXTURE) as Record<string, unknown>;
  const errorsOf = (raw: unknown) => {
    const r = validateMockExamSpec(raw);
    return r.ok ? [] : r.errors;
  };

  it("합성 예시 스펙은 통과하고 기본값이 채워진다", () => {
    const r = validateMockExamSpec(FIXTURE);

    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.spec.questions).toHaveLength(3);
      expect(r.spec.rubric_public).toBe(true);
      expect(r.spec.language).toBe("ko");
    }
  });

  it("rubric_public 과 language 를 생략하면 false 와 ko 이다", () => {
    const raw = good();
    delete raw.rubric_public;
    delete raw.language;

    const r = validateMockExamSpec(raw);

    expect(r.ok && r.spec.rubric_public).toBe(false);
    expect(r.ok && r.spec.language).toBe("ko");
  });

  it.each([
    ["문자열", "평가 기준 텍스트"],
    ["객체", { evaluationArea: "a", detailedCriteria: "b" }],
    ["null", null],
    ["숫자", 7],
    ["빈 배열", []],
  ])("rubric 이 %s 이면 거부한다 (문자열 rubric 은 채점이 조용히 무시한다)", (_label, rubric) => {
    const raw = good();
    raw.rubric = rubric;

    const errors = errorsOf(raw);

    expect(errors.length).toBeGreaterThan(0);
    expect(errors.join("\n")).toContain("rubric");
  });

  it("rubric 이 없으면 거부한다", () => {
    const raw = good();
    delete raw.rubric;

    expect(errorsOf(raw).join("\n")).toMatch(/rubric.*배열/);
  });

  it("문자열 rubric 거부 사유에 배열이어야 하는 이유를 적는다", () => {
    const raw = good();
    raw.rubric = "문자열";

    expect(errorsOf(raw).join("\n")).toMatch(/배열.*(무시|채점)/);
  });

  it.each([
    ["evaluationArea 없음", { detailedCriteria: "x" }],
    ["detailedCriteria 없음", { evaluationArea: "x" }],
    ["빈 문자열", { evaluationArea: " ", detailedCriteria: "x" }],
    ["문자열이 아님", { evaluationArea: 1, detailedCriteria: "x" }],
    ["알 수 없는 키", { evaluationArea: "x", detailedCriteria: "y", weight: 3 }],
  ])("rubric 항목이 잘못되면 거부한다: %s", (_label, item) => {
    const raw = good();
    raw.rubric = [item];

    expect(errorsOf(raw).join("\n")).toContain("rubric[0]");
  });

  it.each([
    ["빈 문자열", ""],
    ["공백뿐", "   "],
    ["문자열이 아님", 5],
  ])("제목이 %s 이면 거부한다", (_label, title) => {
    const raw = good();
    raw.title = title;

    expect(errorsOf(raw).join("\n")).toContain("title");
  });

  it("제목이 500자를 넘으면 거부한다 (createExamSchema 와 같은 상한)", () => {
    const raw = good();
    raw.title = "가".repeat(501);

    expect(errorsOf(raw).join("\n")).toContain("title");
  });

  it.each([
    ["없음", undefined],
    ["빈 배열", []],
    ["배열이 아님", "q"],
  ])("문항이 %s 이면 거부한다", (_label, questions) => {
    const raw = good();
    if (questions === undefined) delete raw.questions;
    else raw.questions = questions;

    expect(errorsOf(raw).join("\n")).toContain("questions");
  });

  it.each(["multiple-choice", "true-false", "short-answer", "case"])(
    "서술형이 아닌 문항(%s)은 이 스크립트 범위가 아니라 거부한다",
    (type) => {
      const raw = good();
      raw.questions = [{ id: "q1", text: "x", type }];

      expect(errorsOf(raw).join("\n")).toMatch(/questions\[0\]\.type.*essay/);
    }
  );

  it("문항에 idx 를 넣으면 거부한다 - 배열 위치가 q_idx 라서 이후 순서를 못 바꾼다", () => {
    const raw = good();
    raw.questions = [{ id: "q1", text: "x", type: "essay", idx: 0 }];

    expect(errorsOf(raw).join("\n")).toMatch(/idx/);
  });

  it("문항 id 중복과 빈 text 를 거부한다", () => {
    const raw = good();
    raw.questions = [
      { id: "q1", text: "x", type: "essay" },
      { id: "q1", text: " ", type: "essay" },
    ];

    const text = errorsOf(raw).join("\n");
    expect(text).toContain("questions[1].text");
    expect(text).toMatch(/중복/);
  });

  it.each(["duration", "chat_weight", "score_weights", "status", "code", "type", "materials", "first_published_at"])(
    "스펙이 정하지 않는 키(%s)는 조용히 무시하지 않고 거부한다",
    (key) => {
      const raw = good();
      raw[key] = 1;

      expect(errorsOf(raw).join("\n")).toContain(key);
    }
  );

  it("rubric_public 이 불리언이 아니면 거부한다", () => {
    const raw = good();
    raw.rubric_public = "true";

    expect(errorsOf(raw).join("\n")).toContain("rubric_public");
  });

  it("language 는 ko 또는 en 만 허용한다", () => {
    const raw = good();
    raw.language = "fr";

    expect(errorsOf(raw).join("\n")).toContain("language");
  });

  it("스펙 최상위가 객체가 아니면 거부한다", () => {
    for (const raw of [null, [], "x", 3]) {
      expect(validateMockExamSpec(raw).ok).toBe(false);
    }
  });

  it("오류는 처음 하나에서 멈추지 않고 모두 모아 돌려준다", () => {
    const errors = errorsOf({ title: "", questions: [], rubric: "x" });

    expect(errors.length).toBeGreaterThanOrEqual(3);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 인자, 프로젝트 ref, 접속 정보
// ─────────────────────────────────────────────────────────────────────────────
describe("parseArgs", () => {
  const ok = (argv: string[]) => {
    const r = parseArgs(argv);
    if (!r.ok) throw new Error(r.error);
    return r.args;
  };

  it("인자 없이 apply 를 켜지 않는다 - 기본은 dry-run 이다", () => {
    const args = ok(["--spec", "s.json", "--instructor-id", "inst-1"]);

    expect(args.apply).toBe(false);
    expect(args.confirmProjectRef).toBeNull();
    expect(args.parentFolderId).toBeNull();
    expect(args.allowDuplicateTitle).toBe(false);
  });

  it("--flag=value 와 --flag value 를 모두 읽는다", () => {
    const args = ok([
      "--spec=s.json",
      "--instructor-id",
      "inst-1",
      "--apply",
      "--confirm-project-ref=abc",
      "--parent-folder-id",
      FOLDER_ID,
      "--allow-duplicate-title",
    ]);

    expect(args).toMatchObject({
      spec: "s.json",
      instructorId: "inst-1",
      apply: true,
      confirmProjectRef: "abc",
      parentFolderId: FOLDER_ID,
      allowDuplicateTitle: true,
    });
  });

  it.each([
    ["--spec 없음", ["--instructor-id", "x"]],
    ["--instructor-id 없음", ["--spec", "s.json"]],
    ["값 없는 --spec", ["--spec"]],
    ["값 자리에 다른 플래그", ["--spec", "--apply", "--instructor-id", "x"]],
    ["알 수 없는 플래그", ["--spec", "s.json", "--instructor-id", "x", "--force"]],
    ["위치 인자", ["s.json", "--spec", "s.json", "--instructor-id", "x"]],
    ["UUID 가 아닌 폴더 id", ["--spec", "s.json", "--instructor-id", "x", "--parent-folder-id", "root"]],
    ["공백이 든 instructor id", ["--spec", "s.json", "--instructor-id", "a b"]],
  ])("거부한다: %s", (_label, argv) => {
    expect(parseArgs(argv).ok).toBe(false);
  });

  it("--help 는 다른 인자 없이도 통과한다", () => {
    const r = parseArgs(["--help"]);

    expect(r.ok && r.args.help).toBe(true);
  });
});

describe("deriveProjectRef / resolveConnection", () => {
  it("Supabase 호스트의 첫 라벨이 ref 이다", () => {
    expect(deriveProjectRef("https://abcdefghijklmnop.supabase.co")).toBe("abcdefghijklmnop");
    expect(deriveProjectRef("https://abcdefghijklmnop.supabase.co/rest/v1/")).toBe("abcdefghijklmnop");
  });

  it("supabase.co 가 아니면 호스트 전체를 ref 로 본다 (로컬은 127.0.0.1)", () => {
    expect(deriveProjectRef("http://127.0.0.1:54321")).toBe("127.0.0.1");
  });

  it("URL 이 아니거나 비면 null 이다", () => {
    expect(deriveProjectRef("not a url")).toBeNull();
    expect(deriveProjectRef("")).toBeNull();
    expect(deriveProjectRef(undefined)).toBeNull();
  });

  it("SUPABASE_URL 을 우선하고 NEXT_PUBLIC_SUPABASE_URL 로 대신할 수 있다", () => {
    const a = resolveConnection({ SUPABASE_URL: "https://aaa.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "k" });
    const b = resolveConnection({ NEXT_PUBLIC_SUPABASE_URL: "https://bbb.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "k" });

    expect(a).toMatchObject({ url: "https://aaa.supabase.co", projectRef: "aaa", serviceRoleKey: "k", error: null });
    expect(b).toMatchObject({ url: "https://bbb.supabase.co", projectRef: "bbb", error: null });
  });

  it("두 URL 변수가 서로 다른 프로젝트를 가리키면 거부한다", () => {
    const r = resolveConnection({
      SUPABASE_URL: "https://aaa.supabase.co",
      NEXT_PUBLIC_SUPABASE_URL: "https://bbb.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "k",
    });

    expect(r.error).toMatch(/aaa.*bbb|bbb.*aaa/);
  });

  it("같은 프로젝트를 가리키는 두 변수는 허용한다", () => {
    const r = resolveConnection({
      SUPABASE_URL: "https://aaa.supabase.co",
      NEXT_PUBLIC_SUPABASE_URL: "https://aaa.supabase.co/",
      SUPABASE_SERVICE_ROLE_KEY: "k",
    });

    expect(r.error).toBeNull();
  });

  it("URL 과 키 중 하나만 있으면 오류다 - 반쪽 접속 정보로 조용히 오프라인이 되지 않는다", () => {
    expect(resolveConnection({ SUPABASE_URL: "https://aaa.supabase.co" }).error).toMatch(/SUPABASE_SERVICE_ROLE_KEY/);
    expect(resolveConnection({ SUPABASE_SERVICE_ROLE_KEY: "k" }).error).toMatch(/SUPABASE_URL/);
  });

  it("둘 다 없으면 오류 없이 비어 있다 (오프라인 dry-run)", () => {
    expect(resolveConnection({})).toMatchObject({ url: null, serviceRoleKey: null, projectRef: null, error: null });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// dry-run: 아무것도 쓰지 않는다
// ─────────────────────────────────────────────────────────────────────────────
describe("seedMockExam dry-run", () => {
  it("쓰기를 한 번도 하지 않고 만들 행(exams, exam_nodes)을 출력한다", async () => {
    const db = createFakeDb(verifiedWorld);

    const { report, output } = await run(db);

    expect(report.status).toBe("dry-run");
    expect(report.exitCode).toBe(0);
    expect(db.writes).toEqual([]);
    expect(db.tables.exams).toEqual([]);
    expect(db.tables.exam_nodes).toEqual([]);
    expect(output).toContain("dry-run");
    expect(output).toContain("exams");
    expect(output).toContain("exam_nodes");
    expect(output).toContain(spec.title);
  });

  it("출력하는 exams 행은 공용 빌더의 결과와 같다 (모의시험 값 전체)", async () => {
    const db = createFakeDb(verifiedWorld);

    const { report } = await run(db);

    const expected = buildExamInsertPayload({
      title: spec.title,
      code: "AAAAAA",
      duration: 0,
      questions: spec.questions,
      materials: [],
      materials_text: [],
      chat_weight: null,
      status: "draft",
      instructor_id: INSTRUCTOR,
      created_at: NOW,
      updated_at: NOW,
      rubric: spec.rubric,
      rubric_public: spec.rubric_public,
      language: spec.language,
    });
    expect(expected.ok).toBe(true);
    expect(report.planned?.exams).toEqual(expected.ok ? expected.payload : null);
    expect(report.planned?.exams).toMatchObject({
      duration: 0,
      status: "draft",
      chat_weight: null,
      rubric_public: true,
      language: "ko",
      materials: [],
      materials_text: [],
      score_weights: { version: 1, typeWeights: { case: 100 }, distribution: "equal_by_type" },
      instructor_id: INSTRUCTOR,
    });
    expect(Array.isArray(report.planned?.exams.rubric)).toBe(true);
  });

  it("문항에는 idx 를 넣지 않는다 (배열 위치가 q_idx)", async () => {
    const db = createFakeDb(verifiedWorld);

    const { report } = await run(db);

    for (const q of report.planned?.exams.questions as Row[]) {
      expect(q).not.toHaveProperty("idx");
      expect(q.type).toBe("essay");
    }
  });

  it("exam_nodes 행은 형제 max+1 로 sort_order 를 계산해 보여준다", async () => {
    const db = createFakeDb({
      ...verifiedWorld,
      exam_nodes: [
        { id: "n1", instructor_id: INSTRUCTOR, parent_id: null, kind: "exam", sort_order: 2 },
        { id: "n2", instructor_id: INSTRUCTOR, parent_id: null, kind: "folder", sort_order: 5 },
        // 다른 교수자의 노드와 다른 폴더의 노드는 세지 않는다.
        { id: "n3", instructor_id: OTHER_INSTRUCTOR, parent_id: null, kind: "exam", sort_order: 99 },
        { id: "n4", instructor_id: INSTRUCTOR, parent_id: FOLDER_ID, kind: "exam", sort_order: 40 },
      ],
    });

    const { report } = await run(db);

    expect(report.planned?.examNode).toMatchObject({
      instructor_id: INSTRUCTOR,
      parent_id: null,
      kind: "exam",
      name: spec.title,
      sort_order: 6,
    });
  });

  it("형제가 없으면 sort_order 는 0 이다", async () => {
    const db = createFakeDb(verifiedWorld);

    const { report } = await run(db);

    expect(report.planned?.examNode).toMatchObject({ sort_order: 0 });
  });

  it("부모 폴더를 주면 그 폴더 안의 형제만 세고 폴더 이름을 보여준다", async () => {
    const db = createFakeDb({
      ...verifiedWorld,
      exam_nodes: [
        { id: FOLDER_ID, instructor_id: INSTRUCTOR, parent_id: null, kind: "folder", name: "2학기", sort_order: 1 },
        { id: "n1", instructor_id: INSTRUCTOR, parent_id: FOLDER_ID, kind: "exam", sort_order: 3 },
        { id: "n2", instructor_id: INSTRUCTOR, parent_id: null, kind: "exam", sort_order: 90 },
      ],
    });

    const { report, output } = await run(db, { parentFolderId: FOLDER_ID });

    expect(report.status).toBe("dry-run");
    expect(report.planned?.examNode).toMatchObject({ parent_id: FOLDER_ID, sort_order: 4 });
    expect(output).toContain("2학기");
  });

  it("읽기 전용 사전 점검: role, plan, instructor_profiles.status 를 출력한다", async () => {
    const db = createFakeDb(verifiedWorld);

    const { output } = await run(db);

    expect(output).toContain("profiles.role: instructor");
    expect(output).toContain("profiles.plan: verified");
    expect(output).toContain("instructor_profiles.status: approved");
  });

  it("plan 이 verified 가 아니면 53명이 입장할 수 없다고 경고한다", async () => {
    const db = createFakeDb({
      ...verifiedWorld,
      profiles: [{ id: INSTRUCTOR, role: "instructor", plan: "free", status: "approved" }],
    });

    const { report, output } = await run(db);

    expect(output).toContain("profiles.plan: free");
    expect(output).toMatch(/53명/);
    expect(output).toContain("verified");
    expect(report.warnings.join("\n")).toMatch(/53명/);
    // 경고일 뿐 막지는 않는다 (이슈: "경고한다").
    expect(report.status).toBe("dry-run");
    expect(report.exitCode).toBe(0);
  });

  it("plan 이 verified 면 53명 경고가 없다", async () => {
    const db = createFakeDb(verifiedWorld);

    const { report, output } = await run(db);

    expect(output).not.toMatch(/53명/);
    expect(report.warnings).toEqual([]);
  });

  it("instructor_profiles 가 approved 가 아니거나 없으면 경고한다", async () => {
    const pending = await run(
      createFakeDb({ ...verifiedWorld, instructor_profiles: [{ id: INSTRUCTOR, status: "pending" }] })
    );
    const missing = await run(createFakeDb({ ...verifiedWorld, instructor_profiles: [] }));

    expect(pending.report.warnings.join("\n")).toContain("instructor_profiles.status");
    expect(missing.report.warnings.join("\n")).toContain("instructor_profiles");
    expect(pending.report.status).toBe("dry-run");
  });

  it("이미 쓰인 코드는 피해 후보 코드를 고른다", async () => {
    const db = createFakeDb({ ...verifiedWorld, exams: [{ id: "e0", code: "AAAAAA", instructor_id: OTHER_INSTRUCTOR }] });

    const { report } = await run(db);

    expect(report.planned?.exams.code).toBe("BBBBBB");
  });

  it("후보 코드를 10번 시도해도 비어 있지 않으면 막는다", async () => {
    const db = createFakeDb({ ...verifiedWorld, exams: [{ id: "e0", code: "SAMESM", instructor_id: OTHER_INSTRUCTOR }] });

    const { report } = await run(db, { generateCode: () => "SAMESM" });

    expect(report.status).toBe("blocked");
    expect(report.blockers.join("\n")).toContain("코드");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 막아야 하는 사전 조건 (dry-run 에서도 apply 에서도 쓰기 없음)
// ─────────────────────────────────────────────────────────────────────────────
describe("seedMockExam 사전 조건", () => {
  it.each([
    ["프로필이 없음", { ...verifiedWorld, profiles: [] }],
    ["role 이 student", { ...verifiedWorld, profiles: [{ id: INSTRUCTOR, role: "student", plan: "verified", status: "approved" }] }],
    ["role 이 비어 있음", { ...verifiedWorld, profiles: [{ id: INSTRUCTOR, role: null, plan: "verified", status: "approved" }] }],
  ])("교수자가 아니면 막는다: %s", async (_label, world) => {
    const db = createFakeDb(world);

    const { report } = await run(db, { apply: true, confirmProjectRef: PROJECT_REF });

    expect(report.status).toBe("blocked");
    expect(report.exitCode).toBe(1);
    expect(db.writes).toEqual([]);
  });

  it("부모 폴더가 없거나 폴더가 아니거나 남의 것이면 막는다", async () => {
    const worlds: Array<Row[]> = [
      [],
      [{ id: FOLDER_ID, instructor_id: INSTRUCTOR, parent_id: null, kind: "exam", name: "시험", sort_order: 0 }],
      [{ id: FOLDER_ID, instructor_id: OTHER_INSTRUCTOR, parent_id: null, kind: "folder", name: "남의 폴더", sort_order: 0 }],
    ];
    for (const exam_nodes of worlds) {
      const db = createFakeDb({ ...verifiedWorld, exam_nodes });

      const { report } = await run(db, { apply: true, confirmProjectRef: PROJECT_REF, parentFolderId: FOLDER_ID });

      expect(report.status).toBe("blocked");
      expect(db.writes).toEqual([]);
    }
  });

  it("같은 제목의 시험이 이미 있으면 막는다 - apply 를 두 번 돌려 중복이 생기는 것을 막는다", async () => {
    const db = createFakeDb({
      ...verifiedWorld,
      exams: [{ id: "e1", code: "OLD111", title: spec.title, instructor_id: INSTRUCTOR, status: "draft" }],
    });

    const { report, output } = await run(db, { apply: true, confirmProjectRef: PROJECT_REF });

    expect(report.status).toBe("blocked");
    expect(output).toContain("OLD111");
    expect(db.writes).toEqual([]);
  });

  it("--allow-duplicate-title 이면 경고만 하고 진행한다", async () => {
    const db = createFakeDb({
      ...verifiedWorld,
      exams: [{ id: "e1", code: "OLD111", title: spec.title, instructor_id: INSTRUCTOR, status: "draft" }],
    });

    const { report } = await run(db, { apply: true, confirmProjectRef: PROJECT_REF, allowDuplicateTitle: true });

    expect(report.status).toBe("applied");
    expect(report.warnings.join("\n")).toContain("제목");
  });

  it("다른 교수자의 같은 제목은 중복으로 세지 않는다", async () => {
    const db = createFakeDb({
      ...verifiedWorld,
      exams: [{ id: "e1", code: "OLD111", title: spec.title, instructor_id: OTHER_INSTRUCTOR, status: "draft" }],
    });

    const { report } = await run(db);

    expect(report.status).toBe("dry-run");
  });

  it("사전 점검 조회가 실패하면 확인하지 못한 채 쓰지 않는다", async () => {
    const db = createFakeDb(verifiedWorld, {
      failRead: (table) => (table === "profiles" ? { code: "500", message: "boom" } : null),
    });

    const { report } = await run(db, { apply: true, confirmProjectRef: PROJECT_REF });

    expect(report.status).toBe("blocked");
    expect(db.writes).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 프로젝트 ref 확인: 쓰기 문턱
// ─────────────────────────────────────────────────────────────────────────────
describe("seedMockExam 프로젝트 ref 확인", () => {
  it("--apply 만 있고 ref 확인이 없으면 DB 를 읽지도 쓰지도 않고 거부한다", async () => {
    const db = createFakeDb(verifiedWorld);

    const { report, output } = await run(db, { apply: true, confirmProjectRef: null });

    expect(report.status).toBe("blocked");
    expect(report.exitCode).toBe(1);
    expect(db.reads).toEqual([]);
    expect(db.writes).toEqual([]);
    expect(output).toContain("--confirm-project-ref");
  });

  it("확인한 ref 가 접속한 프로젝트와 다르면 거부한다", async () => {
    const db = createFakeDb(verifiedWorld);

    const { report, output } = await run(db, { apply: true, confirmProjectRef: "someotherproject" });

    expect(report.status).toBe("blocked");
    expect(db.reads).toEqual([]);
    expect(db.writes).toEqual([]);
    expect(output).toContain(PROJECT_REF);
    expect(output).toContain("someotherproject");
  });

  it("dry-run 에서도 틀린 ref 를 주면 조기에 드러낸다", async () => {
    const db = createFakeDb(verifiedWorld);

    const { report } = await run(db, { apply: false, confirmProjectRef: "someotherproject" });

    expect(report.status).toBe("blocked");
    expect(report.exitCode).toBe(1);
    expect(db.reads).toEqual([]);
  });

  it("접속 정보가 없는데 --apply 하면 거부한다", async () => {
    const lines: string[] = [];

    const report = await seedMockExam({
      client: null,
      spec,
      instructorId: INSTRUCTOR,
      apply: true,
      projectRef: null,
      confirmProjectRef: PROJECT_REF,
      now: () => NOW,
      out: (l) => lines.push(l),
    });

    expect(report.status).toBe("blocked");
    expect(lines.join("\n")).toMatch(/접속 정보/);
  });

  it("ref 비교는 정확히 일치해야 한다 (대소문자, 앞뒤 공백, 접두 일치 모두 불일치)", async () => {
    for (const confirm of [PROJECT_REF.toUpperCase(), ` ${PROJECT_REF}`, PROJECT_REF.slice(0, 8), `${PROJECT_REF}x`]) {
      const db = createFakeDb(verifiedWorld);

      const { report } = await run(db, { apply: true, confirmProjectRef: confirm });

      expect(report.status).toBe("blocked");
      expect(db.writes).toEqual([]);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// apply
// ─────────────────────────────────────────────────────────────────────────────
describe("seedMockExam --apply", () => {
  const apply = { apply: true, confirmProjectRef: PROJECT_REF } as const;

  it("exams 를 넣고 그 id 로 exam_nodes 를 넣는다 - 이 두 쓰기뿐이다", async () => {
    const db = createFakeDb({
      ...verifiedWorld,
      exam_nodes: [{ id: "n1", instructor_id: INSTRUCTOR, parent_id: null, kind: "exam", sort_order: 3 }],
    });

    const { report } = await run(db, apply);

    expect(report.status).toBe("applied");
    expect(report.exitCode).toBe(0);
    expect(db.writes.map((w) => `${w.op}:${w.table}`)).toEqual(["insert:exams", "insert:exam_nodes"]);

    const examRow = db.tables.exams[0];
    expect(examRow).toMatchObject({
      title: spec.title,
      code: "AAAAAA",
      description: null,
      duration: 0,
      status: "draft",
      chat_weight: null,
      materials: [],
      materials_text: [],
      rubric_public: true,
      language: "ko",
      instructor_id: INSTRUCTOR,
      created_at: NOW,
      updated_at: NOW,
      score_weights: { version: 1, typeWeights: { case: 100 }, distribution: "equal_by_type" },
    });
    expect(Array.isArray(examRow.rubric)).toBe(true);
    expect(examRow.rubric).toEqual(spec.rubric);

    const nodeRow = db.tables.exam_nodes.find((n) => n.kind === "exam" && n.exam_id);
    expect(nodeRow).toMatchObject({
      kind: "exam",
      name: spec.title,
      exam_id: examRow.id,
      instructor_id: INSTRUCTOR,
      parent_id: null,
      sort_order: 4,
    });
    expect(report.result).toEqual({ examId: examRow.id, code: "AAAAAA", nodeId: nodeRow?.id });
  });

  it("입장 RPC·시작 라우트가 소유한 값은 건드리지 않는다", async () => {
    const db = createFakeDb(verifiedWorld);

    await run(db, apply);

    const examRow = db.tables.exams[0];
    for (const owned of ["first_published_at", "student_count", "started_at", "open_at", "close_at", "type", "is_demo"]) {
      expect(examRow).not.toHaveProperty(owned);
    }
    expect(examRow.status).toBe("draft");
    // 어떤 UPDATE 도 없다 (status=running, started_at 등을 나중에 덮는 경로가 없다).
    expect(db.writes.some((w) => w.op === "update")).toBe(false);
  });

  it("language 가 en 이면 같은 INSERT 에 실린다 (뒤따르는 UPDATE 없음)", async () => {
    const db = createFakeDb(verifiedWorld);

    await run(db, { ...apply, spec: { ...spec, language: "en" } });

    expect(db.tables.exams[0].language).toBe("en");
    expect(db.writes.some((w) => w.op === "update")).toBe(false);
  });

  it("부모 폴더 안에 만들면 parent_id 와 폴더 안 형제 max+1 을 쓴다", async () => {
    const db = createFakeDb({
      ...verifiedWorld,
      exam_nodes: [
        { id: FOLDER_ID, instructor_id: INSTRUCTOR, parent_id: null, kind: "folder", name: "폴더", sort_order: 0 },
        { id: "n1", instructor_id: INSTRUCTOR, parent_id: FOLDER_ID, kind: "exam", sort_order: 7 },
      ],
    });

    await run(db, { ...apply, parentFolderId: FOLDER_ID });

    const nodeInsert = db.writes.find((w) => w.table === "exam_nodes" && w.op === "insert");
    expect(nodeInsert?.payload).toMatchObject({ parent_id: FOLDER_ID, sort_order: 8, kind: "exam" });
  });

  it("노드 INSERT 가 실패하면 방금 만든 exams 행을 지운다 (보상 삭제)", async () => {
    const db = createFakeDb(verifiedWorld, {
      failInsert: (table) => (table === "exam_nodes" ? { code: "XX000", message: "node failed" } : null),
    });

    const { report, output } = await run(db, apply);

    expect(report.status).toBe("failed");
    expect(report.exitCode).toBe(1);
    expect(report.compensation).toBe("deleted");
    expect(db.writes.map((w) => `${w.op}:${w.table}`)).toEqual(["insert:exams", "insert:exam_nodes", "delete:exams"]);
    expect(db.tables.exams).toEqual([]);
    expect(output).toContain("보상 삭제");
  });

  it("보상 삭제까지 실패하면 남은 exams id 를 출력해 수동 정리를 돕는다", async () => {
    const db = createFakeDb(verifiedWorld, {
      failInsert: (table) => (table === "exam_nodes" ? { code: "XX000", message: "node failed" } : null),
      failDelete: () => ({ code: "XX001", message: "delete failed" }),
    });

    const { report, output } = await run(db, apply);

    expect(report.status).toBe("failed");
    expect(report.compensation).toBe("failed");
    expect(db.tables.exams).toHaveLength(1);
    expect(output).toContain(String(db.tables.exams[0].id));
    expect(output).toMatch(/수동/);
  });

  it("코드가 충돌(23505)하면 새 코드로 다시 넣는다", async () => {
    const db = createFakeDb(verifiedWorld, {
      failInsert: (table, _payload, n) =>
        table === "exams" && n === 1 ? { code: "23505", message: "duplicate key" } : null,
    });

    const { report } = await run(db, apply);

    expect(report.status).toBe("applied");
    const examInserts = db.writes.filter((w) => w.table === "exams" && w.op === "insert");
    expect(examInserts.map((w) => w.payload?.code)).toEqual(["AAAAAA", "BBBBBB"]);
    expect(db.tables.exams).toHaveLength(1);
    expect(db.tables.exams[0].code).toBe("BBBBBB");
    expect(report.result?.code).toBe("BBBBBB");
  });

  it("충돌이 세 번 이어지면 포기하고 노드를 만들지 않는다", async () => {
    const db = createFakeDb(verifiedWorld, {
      failInsert: (table) => (table === "exams" ? { code: "23505", message: "duplicate key" } : null),
    });

    const { report } = await run(db, apply);

    expect(report.status).toBe("failed");
    expect(report.compensation).toBe("not-needed");
    expect(db.writes.filter((w) => w.table === "exams" && w.op === "insert")).toHaveLength(3);
    expect(db.writes.some((w) => w.table === "exam_nodes")).toBe(false);
  });

  it("23505 가 아닌 오류는 재시도하지 않는다", async () => {
    const db = createFakeDb(verifiedWorld, {
      failInsert: (table) => (table === "exams" ? { code: "42501", message: "denied" } : null),
    });

    const { report } = await run(db, apply);

    expect(report.status).toBe("failed");
    expect(db.writes.filter((w) => w.table === "exams" && w.op === "insert")).toHaveLength(1);
    expect(db.writes.some((w) => w.table === "exam_nodes")).toBe(false);
  });

  it("끝나면 만든 id 와 코드를 알려주고, 시험 시작은 하지 않았다고 밝힌다", async () => {
    const db = createFakeDb(verifiedWorld);

    const { output } = await run(db, apply);

    expect(output).toContain("AAAAAA");
    expect(output).toContain(String(db.tables.exams[0].id));
    expect(output).toMatch(/시작/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 오프라인 dry-run
// ─────────────────────────────────────────────────────────────────────────────
describe("seedMockExam 오프라인 (client 없음)", () => {
  it("DB 없이 검증한 스펙으로 만들 행만 보여주고 점검을 건너뛴다고 밝힌다", async () => {
    const lines: string[] = [];

    const report = await seedMockExam({
      client: null,
      spec,
      instructorId: INSTRUCTOR,
      apply: false,
      projectRef: null,
      confirmProjectRef: null,
      now: () => NOW,
      generateCode: () => "AAAAAA",
      out: (l) => lines.push(l),
    });

    expect(report.status).toBe("dry-run");
    expect(report.planned?.exams).toMatchObject({ duration: 0, rubric_public: true });
    expect(lines.join("\n")).toMatch(/건너뜁니다|건너뜀/);
    expect(lines.join("\n")).not.toContain("profiles.plan");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// main(): 파일 읽기 → 검증 → 접속 → 실행. 환경변수와 클라이언트 생성은 주입한다.
// ─────────────────────────────────────────────────────────────────────────────
describe("main", () => {
  const SECRET_KEY = "service-role-key-must-never-be-printed";
  const baseArgv = ["--spec", "spec.json", "--instructor-id", INSTRUCTOR];
  const specJson = JSON.stringify(FIXTURE);

  function harness(
    argv: string[],
    env: Record<string, string | undefined>,
    opts: { specText?: string; db?: ReturnType<typeof createFakeDb> } = {}
  ) {
    const out: string[] = [];
    const err: string[] = [];
    const db = opts.db ?? createFakeDb(verifiedWorld);
    const createClient = vi.fn(() => db.client);
    const readFile = vi.fn((p: string) => {
      if (p !== "spec.json") throw new Error(`ENOENT: ${p}`);
      return opts.specText ?? specJson;
    });
    const code = main(argv, env, {
      createClient: createClient as never,
      readFile,
      out: (l) => out.push(l),
      err: (l) => err.push(l),
      now: () => NOW,
      generateCode: () => "AAAAAA",
    });
    return { code, out, err, db, createClient, readFile };
  }

  it("접속 정보가 없으면 dry-run 은 오프라인으로 돌고 클라이언트를 만들지 않는다", async () => {
    const h = harness(baseArgv, {});

    expect(await h.code).toBe(0);
    expect(h.createClient).not.toHaveBeenCalled();
    expect(h.out.join("\n")).toContain("dry-run");
  });

  it("접속 정보가 있어도 --apply 가 없으면 쓰지 않는다", async () => {
    const h = harness(baseArgv, {
      SUPABASE_URL: `https://${PROJECT_REF}.supabase.co`,
      SUPABASE_SERVICE_ROLE_KEY: SECRET_KEY,
    });

    expect(await h.code).toBe(0);
    expect(h.createClient).toHaveBeenCalledTimes(1);
    expect(h.db.writes).toEqual([]);
    expect(h.out.join("\n")).toContain(`project ref: ${PROJECT_REF}`);
  });

  it("--apply 와 일치하는 --confirm-project-ref 가 있으면 쓴다", async () => {
    const h = harness([...baseArgv, "--apply", "--confirm-project-ref", PROJECT_REF], {
      SUPABASE_URL: `https://${PROJECT_REF}.supabase.co`,
      SUPABASE_SERVICE_ROLE_KEY: SECRET_KEY,
    });

    expect(await h.code).toBe(0);
    expect(h.db.writes.map((w) => `${w.op}:${w.table}`)).toEqual(["insert:exams", "insert:exam_nodes"]);
  });

  it("--apply 인데 ref 가 다르면 한 줄도 쓰지 않고 1 로 끝난다", async () => {
    const h = harness([...baseArgv, "--apply", "--confirm-project-ref", "wrongref"], {
      SUPABASE_URL: `https://${PROJECT_REF}.supabase.co`,
      SUPABASE_SERVICE_ROLE_KEY: SECRET_KEY,
    });

    expect(await h.code).toBe(1);
    expect(h.db.writes).toEqual([]);
    expect(h.db.reads).toEqual([]);
  });

  it("--apply 인데 접속 정보가 없으면 1 로 끝난다", async () => {
    const h = harness([...baseArgv, "--apply", "--confirm-project-ref", PROJECT_REF], {});

    expect(await h.code).toBe(1);
    expect(h.createClient).not.toHaveBeenCalled();
  });

  it("서비스 롤 키는 어떤 출력에도 나오지 않는다", async () => {
    const h = harness([...baseArgv, "--apply", "--confirm-project-ref", PROJECT_REF], {
      SUPABASE_URL: `https://${PROJECT_REF}.supabase.co`,
      SUPABASE_SERVICE_ROLE_KEY: SECRET_KEY,
    });
    await h.code;

    expect([...h.out, ...h.err].join("\n")).not.toContain(SECRET_KEY);
    expect(h.createClient).toHaveBeenCalledWith(
      `https://${PROJECT_REF}.supabase.co`,
      SECRET_KEY,
      expect.anything()
    );
  });

  it("스펙이 잘못되면 2 로 끝나고 클라이언트를 만들지 않는다", async () => {
    const bad = JSON.stringify({ ...(FIXTURE as object), rubric: "문자열" });
    const h = harness(baseArgv, { SUPABASE_URL: `https://${PROJECT_REF}.supabase.co`, SUPABASE_SERVICE_ROLE_KEY: SECRET_KEY }, { specText: bad });

    expect(await h.code).toBe(2);
    expect(h.createClient).not.toHaveBeenCalled();
    expect(h.err.join("\n")).toContain("rubric");
  });

  it("스펙 파일이 JSON 이 아니거나 읽을 수 없으면 2 로 끝난다", async () => {
    const notJson = harness(baseArgv, {}, { specText: "{not json" });
    const missing = harness(["--spec", "nope.json", "--instructor-id", INSTRUCTOR], {});

    expect(await notJson.code).toBe(2);
    expect(await missing.code).toBe(2);
  });

  it("인자가 잘못되면 사용법과 함께 2 로 끝난다", async () => {
    const h = harness(["--instructor-id", INSTRUCTOR], {});

    expect(await h.code).toBe(2);
    expect(h.err.join("\n")).toMatch(/--spec/);
  });

  it("두 URL 변수가 다른 프로젝트를 가리키면 2 로 끝난다", async () => {
    const h = harness(baseArgv, {
      SUPABASE_URL: "https://aaa.supabase.co",
      NEXT_PUBLIC_SUPABASE_URL: "https://bbb.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: SECRET_KEY,
    });

    expect(await h.code).toBe(2);
    expect(h.createClient).not.toHaveBeenCalled();
  });

  it("--help 는 파일도 접속도 건드리지 않고 0 이다", async () => {
    const h = harness(["--help"], {});

    expect(await h.code).toBe(0);
    expect(h.readFile).not.toHaveBeenCalled();
    expect(h.createClient).not.toHaveBeenCalled();
    expect(h.out.join("\n")).toContain("--confirm-project-ref");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 소스 수준 가드
// ─────────────────────────────────────────────────────────────────────────────
describe("스크립트 소스 가드", () => {
  it("접속 정보 파일을 읽지 않는다 (AGENTS.md: .env 계열을 읽지 않는다)", () => {
    expect(SCRIPT_SOURCE).not.toMatch(/dotenv/);
    expect(SCRIPT_SOURCE).not.toMatch(/loadEnvFile/);
    expect(SCRIPT_SOURCE).not.toMatch(/readFileSync\([^)]*\.env/);
  });

  it("exams 행 구성과 코드 생성은 공용 모듈을 쓴다 (단일 출처)", () => {
    expect(SCRIPT_SOURCE).toMatch(/from "\.\.\/lib\/exam-insert-payload"/);
    expect(SCRIPT_SOURCE).toContain("buildExamInsertPayload");
    expect(SCRIPT_SOURCE).toContain("generateExamCode");
  });

  it("시험 시작·종료 상태로 바꾸는 코드가 없다", () => {
    expect(SCRIPT_SOURCE).not.toMatch(/status:\s*["']running["']/);
    expect(SCRIPT_SOURCE).not.toMatch(/started_at\s*:/);
    expect(SCRIPT_SOURCE).not.toMatch(/first_published_at\s*:/);
  });

  it("예시 스펙은 합성 데이터임을 스스로 밝힌다", () => {
    expect(JSON.stringify(FIXTURE)).toContain("합성");
  });
});
