/**
 * 학생 공개 자료 헬퍼 (#544).
 *
 * `getStudentVisibleMaterials` 는 다른 담당(AI 코드 실행)과 맞춘 계약이다. 입출력 모양과 규칙
 * (교집합, materials 순서, 중복과 비문자열과 URL 이 아닌 값 제거, 파일 이름은 경로의 마지막 조각)을
 * 여기서 잠근다. 서버 저장 검증(`validateStudentMaterials`), 교수자 화면의 페이로드(`pickStudentMaterials`),
 * 학생 화면의 응답 읽기(`readStudentMaterialItems`), 업로드 객체 키 규칙도 함께 본다.
 */
import { describe, expect, it } from "vitest";
import {
  MAX_STUDENT_MATERIALS,
  getStudentVisibleMaterials,
  pickStudentMaterials,
  readStudentMaterialItems,
  validateStudentMaterials,
} from "@/lib/student-materials";
import { makeMaterialObjectKey, materialStoragePath } from "@/lib/material-object-key";

const BASE = "https://proj.supabase.co/storage/v1/object/public/exam-materials/instructor-inst-1";
const XLSX = `${BASE}/2026-10-03_aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.xlsx`;
const PDF = `${BASE}/2026-10-03_bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.pdf`;
const CSV = `${BASE}/2026-10-03_cccccccc-cccc-4ccc-8ccc-cccccccccccc.csv`;

describe("getStudentVisibleMaterials (계약)", () => {
  it("두 배열의 교집합만 돌려준다", () => {
    const out = getStudentVisibleMaterials({ materials: [XLSX, PDF, CSV], student_materials: [XLSX, CSV] });
    expect(out.map((m) => m.url)).toEqual([XLSX, CSV]);
  });

  it("순서는 student_materials 가 아니라 materials 순서다", () => {
    const out = getStudentVisibleMaterials({ materials: [XLSX, PDF, CSV], student_materials: [CSV, PDF, XLSX] });
    expect(out.map((m) => m.url)).toEqual([XLSX, PDF, CSV]);
  });

  it("항목은 url, fileName, extension 세 키뿐이다", () => {
    const [item] = getStudentVisibleMaterials({ materials: [XLSX], student_materials: [XLSX] });
    expect(item).toEqual({
      url: XLSX,
      fileName: "2026-10-03_aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.xlsx",
      extension: "xlsx",
    });
  });

  it("중복은 한 번만 나온다 (materials 와 student_materials 어느 쪽의 중복이든)", () => {
    const out = getStudentVisibleMaterials({
      materials: [XLSX, XLSX, PDF],
      student_materials: [XLSX, XLSX, PDF, PDF],
    });
    expect(out.map((m) => m.url)).toEqual([XLSX, PDF]);
  });

  it("문자열이 아닌 값은 무시한다", () => {
    const out = getStudentVisibleMaterials({
      materials: [null, 3, { url: XLSX }, XLSX, [PDF], PDF],
      student_materials: [XLSX, 7, null, { url: PDF }, PDF],
    });
    expect(out.map((m) => m.url)).toEqual([XLSX, PDF]);
  });

  it("materials 에 없는 값(지운 파일, 다른 시험의 파일)은 student_materials 에 있어도 나가지 않는다", () => {
    const other = `${BASE}/2026-09-01_dddddddd-dddd-4ddd-8ddd-dddddddddddd.pdf`;
    const out = getStudentVisibleMaterials({ materials: [XLSX], student_materials: [XLSX, other, PDF] });
    expect(out.map((m) => m.url)).toEqual([XLSX]);
  });

  it("http(s) URL 이 아닌 값은 뺀다 (javascript:, data:, 상대 경로, 맨 이름)", () => {
    const bad = ["javascript:alert(1)//a.xlsx", "data:text/csv,a,b", "/storage/a.xlsx", "a.xlsx", "ftp://x.test/a.csv", ""];
    const out = getStudentVisibleMaterials({ materials: [...bad, PDF], student_materials: [...bad, PDF] });
    expect(out.map((m) => m.url)).toEqual([PDF]);
  });

  it("경로에 파일 이름이 없는 URL 은 뺀다", () => {
    const dir = "https://proj.supabase.co/storage/v1/object/public/exam-materials/";
    expect(getStudentVisibleMaterials({ materials: [dir], student_materials: [dir] })).toEqual([]);
  });

  it("파일 이름은 경로의 마지막 조각을 디코드한 값이다. 쿼리와 해시는 이름에 들어가지 않는다", () => {
    const encoded = "https://x.test/files/%ED%95%98%EB%83%A5%EC%84%BC%EC%8A%A4%20%EA%B3%A0%EA%B0%9D.XLSX?download=1#top";
    const [item] = getStudentVisibleMaterials({ materials: [encoded], student_materials: [encoded] });
    expect(item.fileName).toBe("하냥센스 고객.XLSX");
    expect(item.extension).toBe("xlsx");
    expect(item.url).toBe(encoded);
  });

  it("디코드할 수 없는 조각(잘못된 % 인코딩)은 그대로 쓴다", () => {
    const broken = "https://x.test/files/data%E0%A4%A.csv";
    const [item] = getStudentVisibleMaterials({ materials: [broken], student_materials: [broken] });
    expect(item.fileName).toBe("data%E0%A4%A.csv");
    expect(item.extension).toBe("csv");
  });

  it("확장자가 없거나 9자 이상이면 extension 은 빈 문자열이다", () => {
    const none = "https://x.test/files/README";
    const long = "https://x.test/files/a.verylongext";
    const out = getStudentVisibleMaterials({ materials: [none, long], student_materials: [none, long] });
    expect(out.map((m) => m.extension)).toEqual(["", ""]);
  });

  it("두 키 중 하나라도 없거나 배열이 아니면 빈 배열이다 (공개 0개)", () => {
    expect(getStudentVisibleMaterials({ materials: [XLSX] })).toEqual([]);
    expect(getStudentVisibleMaterials({ student_materials: [XLSX] })).toEqual([]);
    expect(getStudentVisibleMaterials({ materials: [XLSX], student_materials: XLSX })).toEqual([]);
    expect(getStudentVisibleMaterials({ materials: XLSX, student_materials: [XLSX] })).toEqual([]);
    expect(getStudentVisibleMaterials({ materials: [XLSX], student_materials: [] })).toEqual([]);
    expect(getStudentVisibleMaterials({})).toEqual([]);
  });

  it("입력을 바꾸지 않는다", () => {
    const exam = { materials: [XLSX, PDF], student_materials: [PDF, XLSX] };
    const snapshot = structuredClone(exam);
    getStudentVisibleMaterials(exam);
    expect(exam).toEqual(snapshot);
  });

  it("데이터 파일(xlsx, xls, csv)을 확장자로 고를 수 있다 (AI 코드 실행이 쓰는 방식)", () => {
    const out = getStudentVisibleMaterials({ materials: [PDF, XLSX, CSV], student_materials: [PDF, XLSX, CSV] });
    const dataFiles = out.filter((m) => ["xlsx", "xls", "csv"].includes(m.extension));
    expect(dataFiles.map((m) => m.url)).toEqual([XLSX, CSV]);
  });
});

describe("pickStudentMaterials (교수자 화면 페이로드)", () => {
  it("지금 자료 목록에 있는 것만 materials 순서로 남긴다 - 지운 파일은 빠진다", () => {
    expect(pickStudentMaterials([XLSX, PDF], new Set([PDF, CSV, XLSX]))).toEqual([XLSX, PDF]);
  });

  it("아무것도 공개하지 않으면 빈 배열이다 (기본값)", () => {
    expect(pickStudentMaterials([XLSX, PDF], new Set())).toEqual([]);
  });
});

describe("validateStudentMaterials (서버 저장 검증)", () => {
  it("부분집합이면 materials 순서로 정렬하고 중복을 빼서 돌려준다", () => {
    expect(validateStudentMaterials([XLSX, PDF, CSV], [CSV, XLSX, CSV])).toEqual({ ok: true, value: [XLSX, CSV] });
  });

  it("빈 배열은 통과한다 (공개 0개)", () => {
    expect(validateStudentMaterials([XLSX], [])).toEqual({ ok: true, value: [] });
  });

  it("배열이 아니면 거부한다", () => {
    for (const value of [null, undefined, XLSX, { 0: XLSX }]) {
      expect(validateStudentMaterials([XLSX], value)).toMatchObject({ ok: false, reason: "not_array" });
    }
  });

  it("문자열이 아닌 원소가 있으면 거부한다", () => {
    expect(validateStudentMaterials([XLSX], [XLSX, 3])).toMatchObject({ ok: false, reason: "not_string" });
  });

  it(`서로 다른 파일이 ${MAX_STUDENT_MATERIALS}개를 넘으면 거부한다`, () => {
    const many = Array.from({ length: MAX_STUDENT_MATERIALS + 1 }, (_, i) => `${BASE}/f${i}.csv`);
    expect(validateStudentMaterials(many, many)).toMatchObject({ ok: false, reason: "too_many" });
    const atLimit = many.slice(0, MAX_STUDENT_MATERIALS);
    expect(validateStudentMaterials(atLimit, atLimit)).toMatchObject({ ok: true });
  });

  it("상한은 중복을 뺀 개수로 센다", () => {
    const list = Array.from({ length: MAX_STUDENT_MATERIALS }, (_, i) => `${BASE}/f${i}.csv`);
    expect(validateStudentMaterials(list, [...list, list[0]])).toMatchObject({ ok: true });
  });

  it("http(s) URL 이 아니면 materials 에 있어도 거부한다", () => {
    const js = "javascript:alert(1)";
    expect(validateStudentMaterials([js], [js])).toMatchObject({ ok: false, reason: "not_url" });
  });

  it("materials 에 없는 URL 이 있으면 거부한다 (부분집합이 아님)", () => {
    expect(validateStudentMaterials([XLSX], [XLSX, PDF])).toMatchObject({ ok: false, reason: "not_in_materials" });
    expect(validateStudentMaterials(undefined, [XLSX])).toMatchObject({ ok: false, reason: "not_in_materials" });
  });

  it("거부 사유는 사람이 읽는 합니다체 문장이다", () => {
    const r = validateStudentMaterials([XLSX], [PDF]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toMatch(/니다\.$/);
  });
});

describe("readStudentMaterialItems (학생 화면이 응답을 읽는다)", () => {
  it("모양이 맞는 항목만 남기고 서버가 정한 이름을 쓴다", () => {
    const items = readStudentMaterialItems([
      { url: XLSX, fileName: "고객데이터.xlsx", extension: "xlsx" },
      null,
      "문자열",
      { url: 3, fileName: "x.csv" },
      { url: "javascript:alert(1)", fileName: "a.csv" },
      { url: XLSX, fileName: "중복.xlsx" },
      { url: PDF },
    ]);
    expect(items).toEqual([
      { url: XLSX, fileName: "고객데이터.xlsx", extension: "xlsx" },
      { url: PDF, fileName: "2026-10-03_bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.pdf", extension: "pdf" },
    ]);
  });

  it("배열이 아니면 빈 배열이다", () => {
    for (const value of [undefined, null, "x", { url: XLSX }]) {
      expect(readStudentMaterialItems(value)).toEqual([]);
    }
  });
});

describe("교수 자료 객체 키 규칙 (lib/material-object-key.ts)", () => {
  const now = new Date("2026-10-03T15:00:00.000Z");
  const uuid = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

  it("<UTC 날짜>_<uuid>.<소문자 확장자> 이고 원래 이름은 키에 넣지 않는다", () => {
    expect(makeMaterialObjectKey("하냥센스 고객 500.XLSX", { now, uuid })).toBe(`2026-10-03_${uuid}.xlsx`);
  });

  it("확장자가 없거나 이상하면 .bin (또는 지정한 대체값)이다", () => {
    expect(makeMaterialObjectKey("README", { now, uuid })).toBe(`2026-10-03_${uuid}.bin`);
    expect(makeMaterialObjectKey("a.verylongext", { now, uuid, extFallback: ".dat" })).toBe(`2026-10-03_${uuid}.dat`);
  });

  it("uuid 를 주지 않으면 새로 만든다", () => {
    expect(makeMaterialObjectKey("a.csv", { now })).toMatch(/^2026-10-03_[0-9a-f-]{36}\.csv$/);
  });

  it("교수자 폴더 아래 경로다", () => {
    expect(materialStoragePath("inst-1", `2026-10-03_${uuid}.csv`)).toBe(`instructor-inst-1/2026-10-03_${uuid}.csv`);
  });
});
