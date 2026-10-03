/**
 * 학생 공개 자료의 저장 경로 (#544). 클라이언트를 믿지 않는다.
 *
 *   1) 요청 스키마: 문자열 배열, 20개 이하만 통과한다(생성, 수정 모두)
 *   2) createExam: materials 의 부분집합이 아니면 400 이고 아무것도 쓰지 않는다. 통과하면 materials 순서로 저장한다
 *   3) updateExam: 보낸 공개 목록은 저장될 materials 기준으로 검증하고, materials 만 바뀌면 빠진 파일을
 *      공개 목록에서도 지운다. 자료를 건드리지 않는 저장(시작, 종료)은 새 컬럼을 읽지 않는다
 *   4) 시험 복사: 원본의 공개 설정을 부분집합으로 옮긴다
 *   5) 교수자 화면(new, edit 거울 쌍)이 같은 헬퍼로 페이로드를 만든다
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { currentUserMock, supabaseMock } = vi.hoisted(() => ({
  currentUserMock: vi.fn(),
  supabaseMock: { from: vi.fn(), rpc: vi.fn() },
}));

vi.mock("@/lib/get-current-user", () => ({ currentUser: currentUserMock }));
vi.mock("@/lib/supabase-server", () => ({ getSupabaseServer: () => supabaseMock }));
vi.mock("@/lib/logger", () => ({ logError: vi.fn() }));
vi.mock("@/lib/audit", () => ({ auditLog: vi.fn() }));

import { createExam, updateExam } from "@/app/api/supa/handlers/exam-handlers";
import { createExamSchema, updateExamSchema } from "@/lib/validations";
import { buildCopiedExamPayload } from "@/lib/exam-copy";
import { buildExamInsertPayload } from "@/lib/exam-insert-payload";
import { MAX_STUDENT_MATERIALS, MAX_STUDENT_MATERIAL_URL_LENGTH } from "@/lib/student-materials";

const INSTRUCTOR_ID = "instructor-1";
const EXAM_ID = "11111111-1111-4111-8111-111111111111";
const BASE = "https://proj.supabase.co/storage/v1/object/public/exam-materials/instructor-instructor-1";
const XLSX = `${BASE}/2026-10-03_a.xlsx`;
const PDF = `${BASE}/2026-10-03_b.pdf`;
const CSV = `${BASE}/2026-10-03_c.csv`;

type QueryResult = { data: unknown; error: unknown };

function createChain(result: QueryResult = { data: null, error: null }) {
  const inserted: Array<Record<string, unknown>> = [];
  const updated: Array<Record<string, unknown>> = [];
  const builder: Record<string, unknown> = {
    inserted,
    updated,
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    is: vi.fn(() => builder),
    order: vi.fn(() => builder),
    limit: vi.fn(() => builder),
    insert: vi.fn((payload: unknown) => {
      inserted.push(payload as Record<string, unknown>);
      return builder;
    }),
    update: vi.fn((payload: unknown) => {
      updated.push(payload as Record<string, unknown>);
      return builder;
    }),
    delete: vi.fn(() => builder),
    single: vi.fn().mockResolvedValue(result),
    maybeSingle: vi.fn().mockResolvedValue(result),
    then: (resolve: (value: QueryResult) => unknown) => Promise.resolve(result).then(resolve),
  };
  return builder as typeof builder & {
    inserted: Array<Record<string, unknown>>;
    updated: Array<Record<string, unknown>>;
    select: ReturnType<typeof vi.fn>;
    single: ReturnType<typeof vi.fn>;
    maybeSingle: ReturnType<typeof vi.fn>;
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  currentUserMock.mockResolvedValue({ id: INSTRUCTOR_ID, role: "instructor" });
});

const createInput = (extra: Record<string, unknown> = {}) => ({
  title: "분석 시험",
  code: "ABC123",
  duration: 60,
  questions: [{ id: "q1", text: "<p>문항</p>", type: "essay" }],
  status: "draft",
  created_at: "2026-10-03T00:00:00.000Z",
  updated_at: "2026-10-03T00:00:00.000Z",
  ...extra,
});

describe("1) 요청 스키마", () => {
  it("생성과 수정 모두 student_materials 를 통과시킨다 (스키마가 키를 떨어뜨리지 않는다)", () => {
    const created = createExamSchema.safeParse(createInput({ materials: [XLSX], student_materials: [XLSX] }));
    expect(created.success).toBe(true);
    if (created.success) expect(created.data.student_materials).toEqual([XLSX]);

    const updated = updateExamSchema.safeParse({ id: EXAM_ID, update: { student_materials: [XLSX] } });
    expect(updated.success).toBe(true);
    if (updated.success) expect(updated.data.update.student_materials).toEqual([XLSX]);
  });

  it("문자열이 아닌 원소는 거부한다", () => {
    expect(createExamSchema.safeParse(createInput({ student_materials: [XLSX, 3] })).success).toBe(false);
    expect(updateExamSchema.safeParse({ id: EXAM_ID, update: { student_materials: [{ url: XLSX }] } }).success).toBe(false);
    expect(updateExamSchema.safeParse({ id: EXAM_ID, update: { student_materials: XLSX } }).success).toBe(false);
  });

  it(`${MAX_STUDENT_MATERIALS}개를 넘으면 거부한다`, () => {
    const many = Array.from({ length: MAX_STUDENT_MATERIALS + 1 }, (_, i) => `${BASE}/f${i}.csv`);
    expect(createExamSchema.safeParse(createInput({ student_materials: many })).success).toBe(false);
    expect(updateExamSchema.safeParse({ id: EXAM_ID, update: { student_materials: many } }).success).toBe(false);
    expect(
      updateExamSchema.safeParse({ id: EXAM_ID, update: { student_materials: many.slice(0, MAX_STUDENT_MATERIALS) } }).success
    ).toBe(true);
  });

  it(`URL 하나가 ${MAX_STUDENT_MATERIAL_URL_LENGTH}자를 넘으면 거부한다 (#546 리뷰 S12)`, () => {
    const long = `${BASE}/${"f".repeat(MAX_STUDENT_MATERIAL_URL_LENGTH)}.csv`;
    expect(long.length).toBeGreaterThan(MAX_STUDENT_MATERIAL_URL_LENGTH);
    expect(createExamSchema.safeParse(createInput({ student_materials: [long] })).success).toBe(false);
    expect(updateExamSchema.safeParse({ id: EXAM_ID, update: { student_materials: [long] } }).success).toBe(false);
    // 경계값 하나 전은 통과한다.
    const edge = `${BASE}/${"f".repeat(MAX_STUDENT_MATERIAL_URL_LENGTH - BASE.length - 5)}.csv`;
    expect(edge.length).toBeLessThanOrEqual(MAX_STUDENT_MATERIAL_URL_LENGTH);
    expect(updateExamSchema.safeParse({ id: EXAM_ID, update: { student_materials: [edge] } }).success).toBe(true);
  });
});

function mockCreateTables() {
  const exams = createChain();
  exams.single
    .mockResolvedValueOnce({ data: null, error: null }) // 코드 중복 확인
    .mockResolvedValueOnce({ data: { id: EXAM_ID }, error: null }); // INSERT
  const nodes = createChain();
  nodes.maybeSingle.mockResolvedValue({ data: null, error: null });
  nodes.single.mockResolvedValue({ data: { id: "node-1" }, error: null });
  supabaseMock.from.mockImplementation((table: string) => {
    if (table === "exams") return exams;
    if (table === "exam_nodes") return nodes;
    throw new Error(`Unexpected table: ${table}`);
  });
  return { exams, nodes };
}

describe("1-2) 요청 스키마: material_names", () => {
  it("생성과 수정 모두 문자열 → 문자열 객체를 통과시킨다", () => {
    const names = { [XLSX]: "하냥센스_시험용_dataset.xlsx" };
    const created = createExamSchema.safeParse(createInput({ materials: [XLSX], material_names: names }));
    expect(created.success && created.data.material_names).toEqual(names);
    const updated = updateExamSchema.safeParse({ id: EXAM_ID, update: { material_names: names } });
    expect(updated.success && updated.data.update.material_names).toEqual(names);
  });

  it("객체가 아니거나 값이 문자열이 아니거나 너무 길거나 항목이 너무 많으면 거부한다", () => {
    const bad = [
      [XLSX],
      "x",
      { [XLSX]: 3 },
      { [XLSX]: "가".repeat(1001) },
      Object.fromEntries(Array.from({ length: 201 }, (_, i) => [`${BASE}/f${i}.csv`, "a.csv"])),
    ];
    for (const value of bad) {
      expect(updateExamSchema.safeParse({ id: EXAM_ID, update: { material_names: value } }).success).toBe(false);
    }
  });
});

describe("2) createExam", () => {
  it("공개 목록을 materials 순서로 정렬하고 중복을 빼서 저장한다", async () => {
    const { exams } = mockCreateTables();

    const res = await createExam(
      createInput({ materials: [XLSX, PDF, CSV], student_materials: [CSV, XLSX, CSV] }) as never
    );

    expect(res.status).toBe(200);
    expect(exams.inserted[0]).toMatchObject({ materials: [XLSX, PDF, CSV], student_materials: [XLSX, CSV] });
  });

  it("materials 의 부분집합이 아니면 400 INVALID_STUDENT_MATERIALS 이고 아무것도 읽거나 쓰지 않는다", async () => {
    const { exams } = mockCreateTables();

    const res = await createExam(createInput({ materials: [XLSX], student_materials: [XLSX, PDF] }) as never);
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBe("INVALID_STUDENT_MATERIALS");
    expect(exams.inserted).toEqual([]);
    expect(supabaseMock.from).not.toHaveBeenCalled();
  });

  it("http(s) URL 이 아니면 materials 에 있어도 400 이다", async () => {
    mockCreateTables();
    const js = "javascript:alert(1)";

    const res = await createExam(createInput({ materials: [js], student_materials: [js] }) as never);

    expect(res.status).toBe(400);
  });

  it("material_names 는 materials 에 있는 URL 키만 남기고 이름을 정규화해 저장한다", async () => {
    const { exams } = mockCreateTables();

    const res = await createExam(
      createInput({
        materials: [XLSX, PDF],
        material_names: {
          [XLSX]: "C:\\tmp\\하냥센스_시험용\u0000_dataset.xlsx",
          "https://x.test/other.csv": "다른 시험.csv",
          [PDF]: "   ",
        },
      }) as never
    );

    expect(res.status).toBe(200);
    expect(exams.inserted[0].material_names).toEqual({ [XLSX]: "하냥센스_시험용_dataset.xlsx" });
  });

  it("student_materials 를 보내지 않으면 키를 싣지 않는다 (DB 기본값 [], 기존 호출 그대로)", async () => {
    const { exams } = mockCreateTables();

    const res = await createExam(createInput({ materials: [XLSX] }) as never);

    expect(res.status).toBe(200);
    expect(exams.inserted[0]).not.toHaveProperty("student_materials");
    expect(exams.inserted[0]).not.toHaveProperty("material_names");
  });

  it("공용 빌더도 값이 있을 때만 싣는다", () => {
    const base = {
      title: "t",
      code: "C",
      duration: 0,
      status: "draft",
      instructor_id: INSTRUCTOR_ID,
      created_at: "x",
      updated_at: "x",
    };
    const without = buildExamInsertPayload(base);
    const withShared = buildExamInsertPayload({ ...base, materials: [XLSX], student_materials: [XLSX] });
    expect(without.ok && without.payload).not.toHaveProperty("student_materials");
    expect(withShared.ok && withShared.payload.student_materials).toEqual([XLSX]);
  });
});

function mockUpdateTables(current: Record<string, unknown>) {
  const exams = createChain({ data: { id: EXAM_ID, questions: [], ai_draft_questions: null, ...current }, error: null });
  const sessions = createChain({ data: [], error: null });
  const nodes = createChain({ data: null, error: null });
  supabaseMock.from.mockImplementation((table: string) => {
    if (table === "exams") return exams;
    if (table === "sessions") return sessions;
    if (table === "exam_nodes") return nodes;
    throw new Error(`Unexpected table: ${table}`);
  });
  return { exams };
}

describe("3) updateExam", () => {
  it("보낸 공개 목록을 보낸 materials 기준으로 검증하고 materials 순서로 저장한다", async () => {
    const { exams } = mockUpdateTables({ materials: [XLSX], student_materials: [] });

    const res = await updateExam({
      id: EXAM_ID,
      update: { materials: [XLSX, PDF, CSV], student_materials: [CSV, PDF] },
    });

    expect(res.status).toBe(200);
    expect(exams.updated[0]).toMatchObject({ materials: [XLSX, PDF, CSV], student_materials: [PDF, CSV] });
  });

  it("보낸 materials 에 없는 파일을 공개하려 하면 400 이고 쓰지 않는다 (지금 DB 에는 있어도)", async () => {
    const { exams } = mockUpdateTables({ materials: [XLSX, PDF], student_materials: [] });

    const res = await updateExam({ id: EXAM_ID, update: { materials: [XLSX], student_materials: [PDF] } });
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBe("INVALID_STUDENT_MATERIALS");
    expect(exams.updated).toEqual([]);
  });

  it("공개 목록만 보내면 지금 DB 의 materials 기준으로 검증한다", async () => {
    const ok = mockUpdateTables({ materials: [XLSX, PDF], student_materials: [] });
    const res = await updateExam({ id: EXAM_ID, update: { student_materials: [PDF] } });
    expect(res.status).toBe(200);
    expect(ok.exams.updated[0]).toEqual({ student_materials: [PDF] });

    const bad = mockUpdateTables({ materials: [XLSX], student_materials: [] });
    const rejected = await updateExam({ id: EXAM_ID, update: { student_materials: [PDF] } });
    expect(rejected.status).toBe(400);
    expect(bad.exams.updated).toEqual([]);
  });

  it("materials 만 바뀌면 빠진 파일을 공개 목록에서도 지운다", async () => {
    const { exams } = mockUpdateTables({ materials: [XLSX, PDF], student_materials: [XLSX, PDF] });

    const res = await updateExam({ id: EXAM_ID, update: { materials: [PDF, CSV] } });

    expect(res.status).toBe(200);
    expect(exams.updated[0]).toMatchObject({ materials: [PDF, CSV], student_materials: [PDF] });
  });

  it("materials 만 바뀌었고 공개 목록이 그대로면 공개 목록을 쓰지 않는다", async () => {
    const { exams } = mockUpdateTables({ materials: [XLSX], student_materials: [XLSX] });

    const res = await updateExam({ id: EXAM_ID, update: { materials: [XLSX, PDF] } });

    expect(res.status).toBe(200);
    expect(exams.updated[0]).not.toHaveProperty("student_materials");
  });

  it("자료를 건드리지 않는 저장(시작, 마감 등)은 student_materials 컬럼을 읽지 않는다 - 컬럼 없는 DB 에서도 시험 운영이 멈추지 않는다", async () => {
    const { exams } = mockUpdateTables({});

    const res = await updateExam({ id: EXAM_ID, update: { status: "running", started_at: "2026-10-06T00:00:00.000Z" } });

    expect(res.status).toBe(200);
    const selects = exams.select.mock.calls.map((c: unknown[]) => String(c[0] ?? ""));
    expect(selects.join(" | ")).not.toMatch(/student_materials/);
    expect(exams.updated[0]).not.toHaveProperty("student_materials");
  });

  it("지금 값을 읽는 다른 저장(채점 비중, 문항)도 자료를 건드리지 않으면 새 컬럼을 읽지 않는다", async () => {
    const { exams } = mockUpdateTables({ chat_weight: 50, score_weights: null });

    const res = await updateExam({ id: EXAM_ID, update: { chat_weight: 60 } });

    expect(res.status).toBe(200);
    const selects = exams.select.mock.calls.map((c: unknown[]) => String(c[0] ?? ""));
    expect(selects[0]).toContain("chat_weight");
    expect(selects.join(" | ")).not.toMatch(/materials/);
  });

  it("보낸 이름 맵은 저장될 materials 키만 남기고 정규화한다", async () => {
    const { exams } = mockUpdateTables({ materials: [XLSX], student_materials: [], material_names: {} });

    const res = await updateExam({
      id: EXAM_ID,
      update: {
        materials: [XLSX, PDF],
        material_names: { [XLSX]: "하냥센스_시험용_dataset.xlsx", [PDF]: "a/b/강의안.pdf", [CSV]: "지운 파일.csv" },
      },
    });

    expect(res.status).toBe(200);
    expect(exams.updated[0].material_names).toEqual({ [XLSX]: "하냥센스_시험용_dataset.xlsx", [PDF]: "강의안.pdf" });
  });

  it("materials 만 바뀌면 지운 자료의 이름을 맵에서도 뺀다", async () => {
    const { exams } = mockUpdateTables({
      materials: [XLSX, PDF],
      student_materials: [],
      material_names: { [XLSX]: "데이터.xlsx", [PDF]: "강의안.pdf" },
    });

    const res = await updateExam({ id: EXAM_ID, update: { materials: [PDF] } });

    expect(res.status).toBe(200);
    expect(exams.updated[0].material_names).toEqual({ [PDF]: "강의안.pdf" });
  });

  it("이름이 그대로면 이름 맵을 쓰지 않는다", async () => {
    const { exams } = mockUpdateTables({ materials: [XLSX], student_materials: [], material_names: { [XLSX]: "데이터.xlsx" } });

    const res = await updateExam({ id: EXAM_ID, update: { student_materials: [XLSX] } });

    expect(res.status).toBe(200);
    expect(exams.updated[0]).toEqual({ student_materials: [XLSX] });
  });

  it("자료를 바꾸는 저장은 지금 값 조회에 두 컬럼을 함께 읽는다", async () => {
    const { exams } = mockUpdateTables({ materials: [XLSX], student_materials: [] });

    await updateExam({ id: EXAM_ID, update: { student_materials: [XLSX] } });

    const columns = String(exams.select.mock.calls[0][0]).split(",").map((c) => c.trim());
    expect(columns).toEqual(expect.arrayContaining(["materials", "student_materials", "material_names"]));
  });
});

describe("4) 시험 복사", () => {
  const copy = (source: Record<string, unknown>) =>
    buildCopiedExamPayload({ title: "원본", type: "exam", ...source } as never, {
      code: "NEWONE",
      instructorId: INSTRUCTOR_ID,
      now: "2026-10-03T00:00:00.000Z",
    });

  it("원본의 공개 설정을 materials 순서의 부분집합으로 옮긴다", () => {
    const payload = copy({ materials: [XLSX, PDF, CSV], student_materials: [CSV, XLSX, "https://x.test/gone.pdf"] });
    expect(payload.materials).toEqual([XLSX, PDF, CSV]);
    expect(payload.student_materials).toEqual([XLSX, CSV]);
  });

  it("원본에 공개 설정이 없으면 빈 배열이다", () => {
    expect(copy({ materials: [XLSX] }).student_materials).toEqual([]);
  });

  it("원래 파일 이름도 materials 키만 남겨 옮긴다. 원본에 없으면 빈 객체다", () => {
    const payload = copy({
      materials: [XLSX, PDF],
      material_names: { [XLSX]: "데이터.xlsx", "https://x.test/gone.pdf": "지운 파일.pdf" },
    });
    expect(payload.material_names).toEqual({ [XLSX]: "데이터.xlsx" });
    expect(copy({ materials: [XLSX] }).material_names).toEqual({});
  });
});

describe("5) 교수자 화면(new, edit 거울 쌍)", () => {
  const read = (rel: string) => readFileSync(path.join(process.cwd(), rel), "utf8");
  const pages = [
    ["new", read("app/(app)/instructor/new/page.tsx")],
    ["edit", read("app/(app)/instructor/[examId]/edit/page.tsx")],
  ] as const;

  it.each(pages)("%s: 공용 헬퍼로 student_materials 를 materials 와의 교집합으로 싣는다", (_name, source) => {
    expect(source).toContain('import { normalizeMaterialNames, pickStudentMaterials } from "@/lib/student-materials";');
    expect(source).toMatch(/student_materials: pickStudentMaterials\(materialUrls, sharedMaterialUrls\)/);
  });

  it.each(pages)("%s: 올린 파일의 원래 이름을 material_names 로 함께 싣는다 (materials 키만 남는 공용 헬퍼)", (_name, source) => {
    expect(source).toMatch(/material_names: normalizeMaterialNames\(\s*materialUrls,/);
    expect(source).toMatch(/fileUpload\.uploadedFiles\.values\(\)\)\.map\(\(file\) => \[file\.url, file\.fileName\]\)/);
  });

  it("edit: 불러온 material_names 와 추출 때 남긴 이름으로 기존 파일 이름을 보이고, 저장할 때 다시 싣는다", () => {
    const edit = read("app/(app)/instructor/[examId]/edit/page.tsx");
    expect(edit).toMatch(/setMaterialNames\(\s*normalizeMaterialNames\(exam\.materials, \{/);
    expect(edit).toContain("exam.material_names");
    expect(edit).toContain("const getExistingFileName = (url: string) => materialNames[url] || getFileNameFromUrl(url);");
    expect(edit).toMatch(/material_names: normalizeMaterialNames\(materialUrls, \{\s*\.\.\.materialNames,/);
  });

  it.each(pages)("%s: 공개 상태는 빈 Set 으로 시작한다 (기본은 비공개)", (_name, source) => {
    expect(source).toMatch(/useState<Set<string>>\(\(\) => new Set\(\)\)/);
  });

  it.each(pages)("%s: 파일을 지우면 그 URL 을 공개 목록에서 뺀다", (_name, source) => {
    expect(source).toMatch(/if \(removedUrl\) handleMaterialShareChange\(removedUrl, false\);/);
  });

  it.each(pages)("%s: 폼에 공개 스위치를 연결한다", (_name, source) => {
    expect(source).toContain("onMaterialShareChange={handleMaterialShareChange}");
    expect(source).toContain("sharedMaterialUrls={sharedMaterialUrls}");
    expect(source).toContain("uploadedUrlByName={uploadedUrlByName}");
  });

  it("edit: 불러온 시험의 student_materials 로 공개 상태를 채운다", () => {
    expect(read("app/(app)/instructor/[examId]/edit/page.tsx")).toMatch(/setSharedMaterialUrls\(\s*new Set\(\s*Array\.isArray\(exam\.student_materials\)/);
  });
});
