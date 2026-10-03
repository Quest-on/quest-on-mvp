/**
 * 학생 공개 자료 헬퍼 (#544).
 *
 * `getStudentVisibleMaterials` 는 다른 담당(AI 코드 실행)과 맞춘 계약이다. 입출력 모양과 규칙
 * (교집합, materials 순서, 중복과 비문자열과 URL 이 아닌 값 제거, 파일 이름은 경로의 마지막 조각)을
 * 여기서 잠근다. 서버 저장 검증(`validateStudentMaterials`), 교수자 화면의 페이로드(`pickStudentMaterials`),
 * 학생 화면의 응답 읽기(`readStudentMaterialItems`), 업로드 객체 키 규칙도 함께 본다.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
});
import {
  MAX_MATERIAL_NAME_LENGTH,
  MAX_STUDENT_MATERIALS,
  getStudentVisibleMaterials,
  materialDownloadHref,
  normalizeMaterialName,
  normalizeMaterialNames,
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

describe("원래 파일 이름 (material_names, #544 추가 반영)", () => {
  const ORIGINAL = "하냥센스_시험용_dataset.xlsx";

  it("material_names[url] 이 있으면 fileName 은 원래 이름이고, 반환 모양은 그대로다", () => {
    const [item] = getStudentVisibleMaterials({
      materials: [XLSX],
      student_materials: [XLSX],
      material_names: { [XLSX]: ORIGINAL },
    });
    expect(item).toEqual({ url: XLSX, fileName: ORIGINAL, extension: "xlsx" });
    expect(Object.keys(item).sort()).toEqual(["extension", "fileName", "url"]);
  });

  it("이름이 없는 자료(기존 시험)는 지금처럼 URL 조각을 쓴다", () => {
    const out = getStudentVisibleMaterials({
      materials: [XLSX, PDF],
      student_materials: [XLSX, PDF],
      material_names: { [XLSX]: ORIGINAL },
    });
    expect(out.map((m) => m.fileName)).toEqual([ORIGINAL, "2026-10-03_bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.pdf"]);
    for (const names of [undefined, null, "x", [ORIGINAL], { [XLSX]: 3 }, { [XLSX]: "  " }]) {
      const [only] = getStudentVisibleMaterials({ materials: [XLSX], student_materials: [XLSX], material_names: names });
      expect(only.fileName, JSON.stringify(names)).toBe("2026-10-03_aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.xlsx");
    }
  });

  it("확장자는 저장된 객체 이름에서 정한다(원래 이름에 확장자가 없어도 데이터 파일로 고를 수 있다)", () => {
    const [item] = getStudentVisibleMaterials({
      materials: [CSV],
      student_materials: [CSV],
      material_names: { [CSV]: "고객 데이터" },
    });
    expect(item).toMatchObject({ fileName: "고객 데이터", extension: "csv" });
  });

  it("이름 맵에 있어도 공개하지 않은 파일은 나가지 않는다", () => {
    const out = getStudentVisibleMaterials({
      materials: [XLSX, PDF],
      student_materials: [XLSX],
      material_names: { [XLSX]: ORIGINAL, [PDF]: "비공개 강의안.pdf" },
    });
    expect(JSON.stringify(out)).not.toContain("비공개 강의안");
  });

  it("__proto__ 같은 키가 이름을 끌어오지 않는다", () => {
    const names = JSON.parse('{"__proto__": "x.xlsx"}');
    const [item] = getStudentVisibleMaterials({ materials: [XLSX], student_materials: [XLSX], material_names: names });
    expect(item.fileName).toBe("2026-10-03_aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.xlsx");
  });

  describe("normalizeMaterialName", () => {
    it("제어문자와 글자 방향 제어문자를 지운다", () => {
      expect(normalizeMaterialName("하냥\u0000센스\n\t.xlsx")).toBe("하냥센스.xlsx");
      expect(normalizeMaterialName("보고서\u202Exslx.exe")).toBe("보고서xslx.exe");
      expect(normalizeMaterialName("a\u0085b\u007f.csv")).toBe("ab.csv");
    });

    it("경로 구분자가 있으면 마지막 조각만 남긴다", () => {
      expect(normalizeMaterialName("C:\\Users\\kim\\하냥센스.xlsx")).toBe("하냥센스.xlsx");
      expect(normalizeMaterialName("../../etc/passwd")).toBe("passwd");
      expect(normalizeMaterialName("dir/")).toBeNull();
    });

    it("앞뒤 공백을 지우고, 비거나 . .. 이면 null 이다. 문자열이 아니면 null 이다", () => {
      expect(normalizeMaterialName("  데이터.csv  ")).toBe("데이터.csv");
      for (const bad of ["", "   ", ".", "..", "\u0000", null, undefined, 3, {}, []]) {
        expect(normalizeMaterialName(bad), JSON.stringify(bad)).toBeNull();
      }
    });

    it(`${MAX_MATERIAL_NAME_LENGTH}자를 넘으면 확장자를 살리고 앞을 자른다 (코드 포인트 기준)`, () => {
      const long = `${"가".repeat(300)}.xlsx`;
      const out = normalizeMaterialName(long)!;
      expect(Array.from(out)).toHaveLength(MAX_MATERIAL_NAME_LENGTH);
      expect(out.endsWith(".xlsx")).toBe(true);
      const exact = `${"나".repeat(MAX_MATERIAL_NAME_LENGTH - 4)}.csv`;
      expect(normalizeMaterialName(exact)).toBe(exact);
      const emoji = "😀".repeat(250);
      expect(Array.from(normalizeMaterialName(emoji)!)).toHaveLength(MAX_MATERIAL_NAME_LENGTH);
    });
  });

  describe("normalizeMaterialNames (서버 저장, 교수자 페이로드, 시드)", () => {
    it("materials 안의 URL 키만 남기고 materials 순서로 정리한다. 지운 자료의 이름은 빠진다", () => {
      const out = normalizeMaterialNames([XLSX, PDF], {
        [PDF]: "강의안.pdf",
        "https://x.test/deleted.csv": "지운 파일.csv",
        [XLSX]: ORIGINAL,
      });
      expect(out).toEqual({ [XLSX]: ORIGINAL, [PDF]: "강의안.pdf" });
      expect(Object.keys(out)).toEqual([XLSX, PDF]);
    });

    it("값을 정규화하고 쓸 수 없는 값은 뺀다", () => {
      const out = normalizeMaterialNames([XLSX, PDF, CSV], {
        [XLSX]: "C:\\tmp\\하냥\u0000센스.xlsx",
        [PDF]: 42,
        [CSV]: "   ",
      });
      expect(out).toEqual({ [XLSX]: "하냥센스.xlsx" });
    });

    it("객체가 아니면 빈 객체다", () => {
      for (const names of [undefined, null, "x", [XLSX], 3]) {
        expect(normalizeMaterialNames([XLSX], names)).toEqual({});
      }
    });

    it("__proto__ 키도 일반 속성으로 다룬다 (프로토타입 오염 없음)", () => {
      const out = normalizeMaterialNames(["__proto__"], JSON.parse('{"__proto__": "x.csv"}'));
      expect(Object.getPrototypeOf(out)).toBe(Object.prototype);
      expect(Object.prototype.hasOwnProperty.call(out, "__proto__")).toBe(true);
      expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    });
  });

  it("이름이 없을 때 쓰는 URL 조각도 같은 정규화를 거친다 (#546 리뷰 4)", () => {
    // %E2%80%AE = RLO, %2F = /
    const dirty = "https://proj.supabase.co/storage/v1/object/public/exam-materials/i/1/%E2%80%AEfoo%2F..%2Fbar.exe";
    const [item] = getStudentVisibleMaterials({ materials: [dirty], student_materials: [dirty] });
    expect(item.fileName).toBe("bar.exe");
    // 조각이 정규화 뒤 비면(예: 경로만 있거나 . 뿐) 항목 자체를 뺀다
    const dot = "https://proj.supabase.co/storage/v1/object/public/b/%2E%2E";
    expect(getStudentVisibleMaterials({ materials: [dot], student_materials: [dot] })).toEqual([]);
  });

  it("짝 없는 서로게이트와 U+061C, U+200B, U+2028 을 이름에서 지운다 (#546 리뷰 3)", () => {
    expect(normalizeMaterialName("a\ud800b.xlsx")).toBe("ab.xlsx");
    expect(normalizeMaterialName("a\udc00b.xlsx")).toBe("ab.xlsx");
    expect(normalizeMaterialName("보고서\u061Cxslx.exe")).toBe("보고서xslx.exe");
    expect(normalizeMaterialName("a\u200bb.csv")).toBe("ab.csv");
    expect(normalizeMaterialName("a\u2028b.csv")).toBe("ab.csv");
    // 짝이 맞는 서로게이트(이모지)는 지우지 않는다
    expect(normalizeMaterialName("\ud83d\ude00.csv")).toBe("\ud83d\ude00.csv");
    // 짝 없는 서로게이트는 정규화에서 지워지므로 download 주소 생성이 깨지지 않는다(URIError 없음)
    expect(materialDownloadHref(XLSX, "x\ud800.xlsx")).toContain("download=x.xlsx");
  });

  it("학생 화면도 서버가 준 원래 이름을 같은 규칙으로 읽는다", () => {
    const items = readStudentMaterialItems([{ url: XLSX, fileName: `\u202E${ORIGINAL}`, extension: "xlsx" }]);
    expect(items).toEqual([{ url: XLSX, fileName: ORIGINAL, extension: "xlsx" }]);
  });
});

describe("materialDownloadHref (같은 탭에서 원래 이름으로 내려받기, #544 추가 반영)", () => {
  it("Supabase 공개 객체 URL 에 download=<인코딩한 원래 이름> 을 붙인다 (공백은 %20)", () => {
    const href = materialDownloadHref(XLSX, "하냥센스_시험용 dataset.xlsx");
    expect(href).toBe(`${XLSX}?download=${encodeURIComponent("하냥센스_시험용 dataset.xlsx")}`);
    expect(href).toContain("%20");
    expect(href).not.toContain("+");
    expect(new URL(href!).searchParams.get("download")).toBe("하냥센스_시험용 dataset.xlsx");
  });

  it("& # ? 같은 글자가 있어도 다른 파라미터로 새지 않는다", () => {
    const href = materialDownloadHref(XLSX, "R&D #1?.csv")!;
    const params = new URL(href).searchParams;
    expect([...params.keys()]).toEqual(["download"]);
    expect(params.get("download")).toBe("R&D #1?.csv");
  });

  it("이미 있는 download 파라미터는 바꾸고 다른 파라미터는 남긴다", () => {
    const href = materialDownloadHref(`${XLSX}?v=2&download=old.xlsx`, "새 이름.xlsx")!;
    const params = new URL(href).searchParams;
    expect(params.getAll("download")).toEqual(["새 이름.xlsx"]);
    expect(params.get("v")).toBe("2");
  });

  it("이름을 쓸 수 없으면 URL 조각을 이름으로 쓴다", () => {
    const href = materialDownloadHref(XLSX, "  ")!;
    expect(new URL(href).searchParams.get("download")).toBe("2026-10-03_aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.xlsx");
  });

  it("Supabase 공개 객체 경로가 아니거나 http(s) 가 아니면 null 이다 (호출자가 새 탭으로 연다)", () => {
    expect(materialDownloadHref("https://example.test/files/a.xlsx", "a.xlsx")).toBeNull();
    expect(materialDownloadHref("https://proj.supabase.co/storage/v1/object/sign/exam-materials/a.xlsx", "a.xlsx")).toBeNull();
    expect(materialDownloadHref("javascript:alert(1)//storage/v1/object/public/a.xlsx", "a.xlsx")).toBeNull();
  });

  it("커스텀 도메인 스토리지를 쓰는 배포에서는 프로젝트 호스트와 정확히 같을 때만 같은 탭 취급을 한다 (#546 리뷰 2)", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://storage.quest-on.app");
    const mine = materialDownloadHref("https://storage.quest-on.app/storage/v1/object/public/exam-materials/i/a.xlsx", "a.xlsx");
    expect(mine).toContain("download=a.xlsx");
    // 프로젝트가 커스텀 도메인인데 *.supabase.co 로 온 URL 은 다른 프로젝트다.
    expect(materialDownloadHref(XLSX, "a.xlsx")).toBeNull();
    // 비슷한 서브도메인도 안 된다.
    expect(
      materialDownloadHref("https://evil.storage.quest-on.app/storage/v1/object/public/e.html", "e.html")
    ).toBeNull();
  });

  it("NEXT_PUBLIC_SUPABASE_URL 이 없으면 *.supabase.co 서픽스 규칙만 따른다", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    expect(materialDownloadHref(XLSX, "a.xlsx")).toContain("download=a.xlsx");
  });

  it("호스트가 Supabase 스토리지가 아니면 같은 탭 취급을 하지 않는다 (#546 리뷰 2)", () => {
    // 경로만 같고 호스트가 다른 경우
    expect(materialDownloadHref("https://evil.example/storage/v1/object/public/x.html", "x.html")).toBeNull();
    // 서픽스를 흉내 낸 타 도메인(점 경계 아님)
    expect(
      materialDownloadHref("https://abc.supabase.co.evil.com/storage/v1/object/public/a.xlsx", "a.xlsx")
    ).toBeNull();
    // userinfo 로 호스트를 속이는 트릭 - URL 파서는 호스트를 evil.com 으로 읽는다
    expect(
      materialDownloadHref("https://abc.supabase.co@evil.com/storage/v1/object/public/a.xlsx", "a.xlsx")
    ).toBeNull();
    // 대문자 호스트는 정규화 뒤 허용된다
    const upper = materialDownloadHref("https://PROJ.SUPABASE.CO/storage/v1/object/public/b/a.xlsx", "a.xlsx");
    expect(upper).toContain("download=a.xlsx");
  });
});
