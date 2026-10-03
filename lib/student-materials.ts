/**
 * 교수 자료 중 학생에게 공개한 파일 (#544).
 *
 * 저장 모양 (database/041_exam_student_materials.sql):
 *   - `exams.materials`         업로드한 자료의 공개 URL 문자열 배열 (교수자 전용)
 *   - `exams.student_materials` 그중 학생에게 공개한 URL 문자열 배열. 항상 `materials` 의 부분집합이고
 *                               순서는 `materials` 순서를 따른다.
 *   - `exams.material_names`    자료 URL → 원래 파일 이름 객체. 키는 항상 `materials` 안의 URL 이다.
 *
 * 이 모듈은 순수 함수만 둔다(DB, 인증, 시계 없음). 서버 저장 검증, 학생 응답 정리, 교수자 화면의
 * 저장 페이로드, 학생 화면이 같은 규칙을 쓴다. 다른 기능(AI 코드 실행)도 데이터 파일을 고를 때
 * `getStudentVisibleMaterials` 를 쓴다 - 이 함수의 반환 모양은 다른 담당과 맞춘 계약이라 바꾸지 않는다.
 *
 * 파일 이름: 업로드 경로(`/api/upload`, `/api/upload/signed-url`)는 객체 키를
 * `instructor-<교수자 id>/<YYYY-MM-DD>_<uuid>.<확장자>` 로 만들고 원래 이름은 응답 메타데이터로만
 * 돌려준다(`lib/material-object-key.ts`). 그래서 원래 이름은 업로드한 화면이 `material_names` 에 담아
 * 저장한다. 이름이 없는 자료(이 컬럼 전에 올린 자료)는 경로의 마지막 조각을 디코드한 값을 이름으로 쓴다.
 *
 * ⚠️ 이 모듈의 어떤 함수도 URL 을 직접 fetch 하지 않고, 그렇게 써서도 안 된다. `exams.materials` 는
 * 교수자가 보낸 문자열을 그대로 저장하므로 `getStudentVisibleMaterials` 의 `url` 은 임의의 http(s)
 * 주소일 수 있다(내부 주소 포함). 서버가 이 `url` 로 fetch 하면 SSRF 가 된다. 서버에서 파일이 필요하면
 * URL 을 파싱하지 말고 Storage 객체 키(`instructor-<id>/<날짜>_<uuid>.<확장자>`)로 서비스 롤 Storage
 * API 를 쓴다. 이 `url` 을 직접 여는 것은 학생 브라우저의 내려받기 링크뿐이다.
 */

/** 한 시험에서 학생에게 공개할 수 있는 파일 수 상한. 서버 검증과 입력 스키마가 같은 값을 쓴다. */
export const MAX_STUDENT_MATERIALS = 20;

/** URL 하나의 길이 상한. 저장 경로 규칙상 실제 URL 은 200자 안쪽이다. */
export const MAX_STUDENT_MATERIAL_URL_LENGTH = 2048;

/** 원래 파일 이름의 길이 상한(코드 포인트). 넘으면 확장자를 살리고 앞부분을 자른다. */
export const MAX_MATERIAL_NAME_LENGTH = 200;

/** `material_names` 입력의 항목 수 상한. 저장할 때는 materials 에 있는 키만 남는다. */
export const MAX_MATERIAL_NAMES = 200;

export type StudentVisibleMaterial = {
  /** `materials` 에 저장된 URL 그대로. */
  url: string;
  /** `material_names[url]` 의 원래 이름. 없으면 URL 경로의 마지막 조각을 디코드한 값. */
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

function stringsOf(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** 객체의 자기 속성만 읽는다. `__proto__` 같은 키가 프로토타입을 끌어오지 않게 한다. */
function ownValue(record: Record<string, unknown>, key: string): unknown {
  return Object.prototype.hasOwnProperty.call(record, key) ? record[key] : undefined;
}

// C0, DEL, C1 제어문자.
const CONTROL_CHARS = /[\u0000-\u001f\u007f-\u009f\u200b\u2028\u2029]/g; // 줄·문단 구분자와 폭 없는 공백도 지운다.
// 글자 방향 제어문자. RLO(U+202E) 를 끼워 "보고서xslx.exe" 가 다른 확장자처럼 보이게 하는 데 쓰인다.
const BIDI_CONTROLS = /[\u200e\u200f\u202a-\u202e\u2066-\u2069\u061c]/g; // U+061C(ARABIC LETTER MARK) 포함
// 짝 없는 서로게이트. encodeURIComponent 가 URIError 를 던지므로 내려받기 주소를 만들기 전에 지운다.
const LONE_SURROGATES = /[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/g;

/**
 * 원래 파일 이름을 저장, 표시할 수 있게 정규화한다. 쓸 수 없으면 null.
 *
 * - 문자열만 받는다.
 * - 제어문자와 글자 방향 제어문자를 지운다.
 * - 경로 구분자(`/`, `\`)가 있으면 마지막 조각만 남긴다(구분자와 앞 경로를 지운다).
 *   브라우저의 `File.name` 에는 구분자가 없으므로 손으로 만든 입력에서만 일어난다.
 * - 앞뒤 공백을 지운다. 비거나 `.`, `..` 이면 null.
 * - `MAX_MATERIAL_NAME_LENGTH` 를 넘으면 확장자를 살리고 앞부분을 자른다.
 */
export function normalizeMaterialName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const cleaned = value.replace(CONTROL_CHARS, "").replace(BIDI_CONTROLS, "").replace(LONE_SURROGATES, "");
  const name = (cleaned.split(/[\\/]/).pop() ?? "").trim();
  if (name === "" || name === "." || name === "..") return null;
  const chars = Array.from(name);
  if (chars.length <= MAX_MATERIAL_NAME_LENGTH) return name;
  const ext = /\.[a-zA-Z0-9]{1,8}$/.exec(name)?.[0] ?? "";
  const base = Array.from(name.slice(0, name.length - ext.length));
  return base.slice(0, MAX_MATERIAL_NAME_LENGTH - ext.length).join("").trimEnd() + ext;
}

/**
 * 저장할 `material_names`. 키가 `materials` 안의 URL 인 항목만 남기고 값은 `normalizeMaterialName` 으로
 * 정규화한다. 쓸 수 없는 값은 뺀다. 순서는 `materials` 순서다. 자료를 지우면 그 키도 여기서 빠진다.
 * 서버 저장(생성, 수정, 복사), 교수자 화면의 페이로드, 시드 스크립트가 같은 함수를 쓴다.
 */
export function normalizeMaterialNames(materials: unknown, names: unknown): Record<string, string> {
  if (!isPlainObject(names)) return {};
  const entries: Array<[string, string]> = [];
  const seen = new Set<string>();
  for (const url of stringsOf(materials)) {
    if (seen.has(url)) continue;
    seen.add(url);
    const name = normalizeMaterialName(ownValue(names, url));
    if (name !== null) entries.push([url, name]);
  }
  // Object.fromEntries 는 `__proto__` 키도 자기 속성으로 만든다(프로토타입을 바꾸지 않는다).
  return Object.fromEntries(entries);
}

/** URL 문자열을 학생에게 보여 줄 항목으로 바꾼다. http(s) URL 이 아니거나 이름을 정할 수 없으면 null. */
function toVisibleMaterial(url: string, originalName?: unknown): StudentVisibleMaterial | null {
  const parsed = parseHttpUrl(url);
  if (!parsed) return null;
  // URL 조각 폴백도 원래 이름과 같은 정규화를 거친다. 조각에 경로가 인코딩돼 있으면(%2F..%2F)
  // 이 값을 문자열로 받는 쪽(에픽 B 의 샌드박스 경로 등)에서 경로 탈출이 되지 않게 한다.
  const segment = normalizeMaterialName(lastPathSegment(parsed));
  if (segment === null) return null;
  const fileName = normalizeMaterialName(originalName) ?? segment;
  // 확장자는 저장된 객체 이름(업로드 때 원래 이름에서 정한 값)이 먼저다. 없으면 원래 이름에서 본다.
  return { url, fileName, extension: extensionOf(segment) || extensionOf(fileName) };
}

/**
 * 학생에게 공개된 파일 목록. `materials` 와 `student_materials` 의 교집합이고 순서는 `materials` 순서다.
 *
 * 문자열이 아닌 값, 중복, http(s) URL 이 아닌 값, 경로에 파일 이름이 없는 URL 은 뺀다.
 * `student_materials` 에만 있고 `materials` 에 없는 값(지운 파일)도 뺀다. 그래서 저장 불변식이
 * 어떤 이유로 깨져도 지금 시험 자료가 아닌 파일은 나가지 않는다. 두 키 중 하나라도 없거나 배열이
 * 아니면 빈 배열이다 - 호출자는 두 컬럼을 함께 읽어야 한다.
 *
 * `fileName` 은 `material_names[url]` 이 있으면 그 원래 이름(정규화), 없으면 URL 경로의 마지막 조각이다.
 * `material_names` 를 넘기지 않아도 동작한다(이름만 조각이 된다).
 */
export function getStudentVisibleMaterials(exam: {
  materials?: unknown;
  student_materials?: unknown;
  material_names?: unknown;
}): StudentVisibleMaterial[] {
  const shared = new Set(stringsOf(exam.student_materials));
  if (shared.size === 0) return [];
  const names = isPlainObject(exam.material_names) ? exam.material_names : {};

  const seen = new Set<string>();
  const out: StudentVisibleMaterial[] = [];
  for (const url of stringsOf(exam.materials)) {
    if (!shared.has(url) || seen.has(url)) continue;
    seen.add(url);
    const item = toVisibleMaterial(url, ownValue(names, url));
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
 * - 원소는 http(s) URL 이어야 하고 `materials` 에 들어 있어야 한다.
 *
 * 한계: `materials` 자체가 같은 요청에 실려 오는 배열이므로 이 검사는 "이번 저장의 자료 목록 안"만
 * 보장한다. 교수자가 `materials` 에 임의의 http(s) URL 을 함께 넣고 그것을 공개하면 통과한다(버킷이
 * 공개라 기밀성이 새로 깨지지는 않지만 "다른 시험의 파일 거부"는 아니다). 목록을 프로젝트 Storage
 * 경로로 묶는 것은 별도 검증이 필요하다.
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
    // 서버가 정한 이름(원래 이름)을 쓴다. 화면에서도 같은 정규화를 한 번 더 거친다.
    const item = toVisibleMaterial(url, fileName);
    if (!item) continue;
    seen.add(url);
    out.push(item);
  }
  return out;
}

/** Supabase Storage 공개 객체 경로. 이 경로만 `download` 쿼리 파라미터를 알아듣는다. */
const SUPABASE_PUBLIC_OBJECT_PATH = "/storage/v1/object/public/";
/** 허용 호스트의 접미사. 점 경계로 붙는다(`.supabase.co`). */
const SUPABASE_STORAGE_HOST_SUFFIX = ".supabase.co";

/**
 * `*.supabase.co` 의 하위 도메인인가. 점 경계로만 맞추고(`evil-supabase.co` 제외), 서픽스 앞에 빈 라벨이
 * 있는 이름(`.supabase.co`, `a..supabase.co`)도 제외한다. `supabase.co` 자체는 서픽스로 끝나지 않아 빠진다.
 */
function isSupabaseCoSubdomain(host: string): boolean {
  if (!host.endsWith(SUPABASE_STORAGE_HOST_SUFFIX)) return false;
  return host
    .slice(0, -SUPABASE_STORAGE_HOST_SUFFIX.length)
    .split(".")
    .every((label) => label.length > 0);
}

/**
 * Storage 공개 객체를 내놓는 Supabase 호스트인가.
 *
 * 응시 화면은 이 주소를 숨긴 iframe 으로 연다. 아무 주소나 iframe 에 넣지 않도록 경로뿐 아니라 호스트를
 * 명시적으로 검사한다. 통과하는 경우는 두 가지다:
 *   1. URL 의 호스트가 프로젝트 스토리지 호스트(`NEXT_PUBLIC_SUPABASE_URL` 의 hostname)와 정확히 같다.
 *      로컬 스택(127.0.0.1, localhost)은 이 경로로 통과하고, CSP frame-src 도 그 출처를 허용한다.
 *      커스텀 도메인도 여기서는 통과하지만 CSP(connect-src, frame-src)가 `*.supabase.co` 와 로컬만
 *      허용하므로 그런 배포는 CSP 도 함께 넓혀야 한다. 막히면 응시 화면이 실패 알림과 새 탭 링크를 보인다.
 *   2. 프로젝트 호스트가 `*.supabase.co` 이고 URL 의 호스트도 점 경계로 `*.supabase.co` 서픽스를 가진다.
 * `evil.example`, `abc.supabase.co.evil.com`, `abc.supabase.co@evil.com`(URL 파서가 호스트를 evil.com
 * 으로 읽는다)은 모두 제외된다. 프로젝트가 커스텀 도메인이면 남의 *.supabase.co 주소도 제외된다.
 */
function isSupabaseStorageHost(parsed: URL): boolean {
  const host = parsed.hostname.toLowerCase();

  const projectUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (projectUrl) {
    let projectHost: string | null = null;
    try {
      projectHost = new URL(projectUrl).hostname.toLowerCase();
    } catch {
      // NEXT_PUBLIC_SUPABASE_URL 이 URL 이 아니면 서픽스 규칙만 따른다.
    }
    if (projectHost !== null) {
      // 프로젝트 호스트와 정확히 같으면 통과(커스텀 도메인 스토리지 포함).
      if (host === projectHost) return true;
      // *.supabase.co 프로젝트라면 같은 서픽스의 다른 프로젝트도 통과. 프로젝트가 커스텀
      // 도메인이면 위 정확 일치만 통과하므로 남의 *.supabase.co 주소는 제외된다.
      if (projectHost.endsWith(SUPABASE_STORAGE_HOST_SUFFIX)) return isSupabaseCoSubdomain(host);
      return false;
    }
  }
  // NEXT_PUBLIC_SUPABASE_URL 이 없으면 서픽스 규칙만 따른다.
  return isSupabaseCoSubdomain(host);
}

/**
 * 숨긴 iframe 으로 파일을 내려받을 주소. 쓸 수 없으면 null.
 *
 * `exam-materials` 는 Supabase 공개 버킷이다. 공개 URL 에 `?download=<이름>` 을 붙이면 Storage 가
 * `Content-Disposition: attachment; filename=...; filename*=UTF-8''...` 로 응답해 브라우저가 페이지를
 * 바꾸지 않고 그 이름으로 저장한다(https://supabase.com/docs/guides/storage/serving/downloads,
 * supabase/storage 의 src/storage/renderer/renderer.ts handleDownload). 다른 출처 링크라 `<a download>`
 * 이름은 브라우저가 무시하므로 이 파라미터가 핵심이다.
 *
 * Supabase 공개 객체 경로가 아닌 URL 은 이 파라미터를 모르는 서버라 null 을 돌려준다. 호출자는 null 이면
 * 새 탭으로 연다(시험 화면을 떠나지 않게).
 */
export function materialDownloadHref(url: string, fileName: string): string | null {
  const parsed = parseHttpUrl(url);
  if (!parsed || !parsed.pathname.includes(SUPABASE_PUBLIC_OBJECT_PATH)) return null;
  if (!isSupabaseStorageHost(parsed)) return null;
  const name = normalizeMaterialName(fileName) ?? normalizeMaterialName(lastPathSegment(parsed));
  if (name === null) return null;
  // 조각(#...)은 서버로 가지 않는다. 남겨 두면 같은 주소를 iframe src 에 다시 넣을 때 문서 안 이동으로
  // 처리돼 다시 요청하지 않는다(#546 재검토). 조각을 지워 다시 누르면 언제나 새로 요청하게 한다.
  parsed.hash = "";
  parsed.searchParams.delete("download");
  try {
    // URLSearchParams 는 공백을 + 로 쓴다. 이름은 encodeURIComponent 로 직접 붙여 %20 으로 보낸다.
    const rest = parsed.searchParams.toString();
    parsed.search = `${rest ? `${rest}&` : ""}download=${encodeURIComponent(name)}`;
  } catch {
    // 이름에 encodeURIComponent 가 거부하는 글자가 남아 있으면 새 탭 경로로 물러난다.
    return null;
  }
  return parsed.toString();
}
