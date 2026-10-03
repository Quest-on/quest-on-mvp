/**
 * 교수 자료 중 학생에게 공개한 파일 (#544).
 *
 * 저장 모양 (database/040_exam_student_materials.sql):
 *   - `exams.materials`         업로드한 자료의 공개 URL 문자열 배열 (교수자 전용)
 *   - `exams.student_materials` 그중 학생에게 공개한 URL 문자열 배열. 항상 `materials` 의 부분집합이고
 *                               순서는 `materials` 순서를 따른다.
 *
 * 이 모듈은 순수 함수만 둔다(DB, 인증, 시계 없음). 서버 저장 검증, 학생 응답 정리, 교수자 화면의
 * 저장 페이로드, 학생 화면이 같은 규칙을 쓴다. 다른 기능(AI 코드 실행)도 데이터 파일을 고를 때
 * `getStudentVisibleMaterials` 를 쓴다 - 이 함수의 입출력 모양은 다른 담당과 맞춘 계약이라 바꾸지 않는다.
 *
 * 파일 이름: 업로드 경로(`/api/upload`, `/api/upload/signed-url`)는 객체 키를
 * `instructor-<교수자 id>/<YYYY-MM-DD>_<uuid>.<확장자>` 로 만들고 원래 이름은 응답 메타데이터로만
 * 돌려준다(`lib/material-object-key.ts`). URL 에 원래 이름이 없으므로 되살릴 수 없고, 경로의 마지막
 * 조각을 디코드한 값이 곧 파일 이름이다.
 */

/** 한 시험에서 학생에게 공개할 수 있는 파일 수 상한. 서버 검증과 입력 스키마가 같은 값을 쓴다. */
export const MAX_STUDENT_MATERIALS = 20;

/** URL 하나의 길이 상한. 저장 경로 규칙상 실제 URL 은 200자 안쪽이다. */
export const MAX_STUDENT_MATERIAL_URL_LENGTH = 2048;

export type StudentVisibleMaterial = {
  /** `materials` 에 저장된 URL 그대로. */
  url: string;
  /** URL 경로의 마지막 조각을 디코드한 값. */
  fileName: string;
  /** 소문자 확장자, 점 없이 (`xlsx`). 없으면 빈 문자열. */
  extension: string;
};

/** http(s) 절대 URL 만 받는다. `javascript:` 같은 스킴이 학생 화면의 링크로 나가지 않게 한다. */
function parseHttpUrl(value: string): URL | null {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return null;
  }
  return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed : null;
}

/** URL 경로의 마지막 조각을 디코드한다. 디코드할 수 없으면(잘못된 % 인코딩) 조각 그대로 쓴다. */
function lastPathSegment(url: URL): string {
  const segment = url.pathname.split("/").pop() ?? "";
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

/** 파일 이름의 확장자. 업로드 경로와 같이 마지막 점 뒤 1~8자 영숫자만 확장자로 본다. */
function extensionOf(fileName: string): string {
  const match = /\.([a-zA-Z0-9]{1,8})$/.exec(fileName);
  return match ? match[1].toLowerCase() : "";
}

/** URL 문자열을 학생에게 보여 줄 항목으로 바꾼다. http(s) URL 이 아니거나 파일 이름이 없으면 null. */
function toVisibleMaterial(url: string): StudentVisibleMaterial | null {
  const parsed = parseHttpUrl(url);
  if (!parsed) return null;
  const fileName = lastPathSegment(parsed);
  if (fileName.trim() === "") return null;
  return { url, fileName, extension: extensionOf(fileName) };
}

function stringsOf(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

/**
 * 학생에게 공개된 파일 목록. `materials` 와 `student_materials` 의 교집합이고 순서는 `materials` 순서다.
 *
 * 문자열이 아닌 값, 중복, http(s) URL 이 아닌 값, 경로에 파일 이름이 없는 URL 은 뺀다.
 * `student_materials` 에만 있고 `materials` 에 없는 값(지운 파일)도 뺀다. 그래서 저장 불변식이
 * 어떤 이유로 깨져도 지금 시험 자료가 아닌 파일은 나가지 않는다. 두 키 중 하나라도 없거나 배열이
 * 아니면 빈 배열이다 - 호출자는 두 컬럼을 함께 읽어야 한다.
 */
export function getStudentVisibleMaterials(exam: {
  materials?: unknown;
  student_materials?: unknown;
}): StudentVisibleMaterial[] {
  const shared = new Set(stringsOf(exam.student_materials));
  if (shared.size === 0) return [];

  const seen = new Set<string>();
  const out: StudentVisibleMaterial[] = [];
  for (const url of stringsOf(exam.materials)) {
    if (!shared.has(url) || seen.has(url)) continue;
    seen.add(url);
    const item = toVisibleMaterial(url);
    if (item) out.push(item);
  }
  return out;
}

/**
 * 교수자 화면이 저장 페이로드를 만들 때 쓴다. 공개로 표시한 URL 중 지금 자료 목록에 있는 것만
 * `materials` 순서로 남긴다(중복 제거). 지운 파일이 표시 상태에 남아 있어도 페이로드에는 실리지 않는다.
 */
export function pickStudentMaterials(materials: readonly string[], shared: Iterable<string>): string[] {
  const sharedSet = new Set(shared);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const url of materials) {
    if (!sharedSet.has(url) || seen.has(url)) continue;
    seen.add(url);
    out.push(url);
  }
  return out;
}

export type StudentMaterialsValidation =
  | { ok: true; value: string[] }
  | {
      ok: false;
      reason: "not_array" | "not_string" | "too_many" | "not_url" | "not_in_materials";
      /** 사람이 읽을 사유. 서버 400 응답의 message 로 쓴다. */
      message: string;
    };

/**
 * 서버 저장 직전 검증. 클라이언트를 믿지 않는다.
 *
 * - 배열이어야 하고 원소는 모두 문자열이어야 한다.
 * - 중복을 뺀 개수가 `MAX_STUDENT_MATERIALS` 이하여야 한다.
 * - 원소는 http(s) URL 이어야 하고 `materials` 에 들어 있어야 한다(지운 파일, 다른 시험의 파일 거부).
 *
 * 통과하면 `materials` 순서로 정렬하고 중복을 뺀 배열을 돌려준다. 이 값을 그대로 저장한다.
 */
export function validateStudentMaterials(
  materials: unknown,
  studentMaterials: unknown
): StudentMaterialsValidation {
  if (!Array.isArray(studentMaterials)) {
    return { ok: false, reason: "not_array", message: "공개 자료 목록은 배열이어야 합니다." };
  }
  if (!studentMaterials.every((v) => typeof v === "string")) {
    return { ok: false, reason: "not_string", message: "공개 자료 목록에는 파일 주소 문자열만 넣을 수 있습니다." };
  }
  const requested = [...new Set(studentMaterials as string[])];
  if (requested.length > MAX_STUDENT_MATERIALS) {
    return {
      ok: false,
      reason: "too_many",
      message: `학생에게 공개할 수 있는 파일은 ${MAX_STUDENT_MATERIALS}개까지입니다.`,
    };
  }
  if (requested.some((url) => parseHttpUrl(url) === null)) {
    return { ok: false, reason: "not_url", message: "공개 자료 목록에 파일 주소가 아닌 값이 있습니다." };
  }
  const available = stringsOf(materials);
  const availableSet = new Set(available);
  if (requested.some((url) => !availableSet.has(url))) {
    return {
      ok: false,
      reason: "not_in_materials",
      message: "학생에게 공개할 파일은 이 시험에 올린 자료 중에서만 고를 수 있습니다.",
    };
  }
  return { ok: true, value: pickStudentMaterials(available, requested) };
}

/**
 * 학생 화면이 서버 응답의 `student_materials`(정리된 항목 배열)를 읽는다. 서버가 이미 걸렀지만
 * 화면도 모양과 스킴을 한 번 더 확인한다 - 이 화면이 이상한 링크를 그려서는 안 된다.
 * 모양이 깨진 항목은 버리고, 쓸 항목이 없으면 빈 배열이다(호출자는 빈 배열이면 버튼을 그리지 않는다).
 */
export function readStudentMaterialItems(value: unknown): StudentVisibleMaterial[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const out: StudentVisibleMaterial[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object") continue;
    const { url, fileName } = entry as Record<string, unknown>;
    if (typeof url !== "string" || seen.has(url)) continue;
    const item = toVisibleMaterial(url);
    if (!item) continue;
    seen.add(url);
    // 서버가 정한 이름이 있으면 그것을 쓴다(지금은 URL 에서 뽑은 값과 같다).
    const name = typeof fileName === "string" && fileName.trim() !== "" ? fileName : item.fileName;
    out.push({ url, fileName: name, extension: extensionOf(name) || item.extension });
  }
  return out;
}
