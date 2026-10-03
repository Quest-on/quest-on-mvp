/**
 * 모의시험 시드 스크립트 (이슈 #513).
 *
 * 교수님 계정으로 로그인하지 않고, 서비스 롤로 시험 한 건을 만든다. `createExam` 은
 * `currentUser()` 에 묶여 있고 Zod 스키마가 `rubric`, `rubric_public`, `type` 을 떨구기 때문에
 * 그대로 부를 수 없다. 그렇다고 exams 에 직접 INSERT 하면 exam_nodes(없으면 드라이브 목록에
 * 안 보임), score_weights, 코드 중복 재시도, 보상 삭제 같은 불변식을 건너뛴다. 그래서
 * exams 행 구성은 createExam 과 같은 빌더(`lib/exam-insert-payload.ts`)를 쓰고, INSERT 두 번과
 * 실패 보상은 createExam 과 같은 순서로 여기서 한다.
 *
 * 사용법:
 *   npx tsx scripts/seed-mock-exam.ts --spec <스펙.json> --instructor-id <id>              # dry-run
 *   npx tsx scripts/seed-mock-exam.ts --spec <스펙.json> --instructor-id <id> \
 *       --apply --confirm-project-ref <ref>                                                # 쓰기
 *
 * 접속 정보는 **환경변수로만** 받는다. 파일에서 읽지 않는다 (AGENTS.md).
 *   SUPABASE_URL (없으면 NEXT_PUBLIC_SUPABASE_URL), SUPABASE_SERVICE_ROLE_KEY
 *
 * 기본은 dry-run 이다. 쓰기에는 `--apply` 가 필요하고, **접속 정보가 있어 DB 를 읽는 모든 실행
 * (dry-run 포함)** 에는 접속한 프로젝트 ref 와 일치하는 `--confirm-project-ref` 가 필요하다.
 * ref 는 독립된 출처에서 확인해 직접 넘긴다 - 스크립트는 기대하는 ref 를 오류 안내에 알려 주지
 * 않는다(복사해 붙이면 확인이 되지 않는다). 접속 정보 없이 도는 오프라인 dry-run 만 예외다.
 * **운영 DB 실행은 별도 명시 승인이 있어야 한다.** 스테이징 리허설을 먼저 한다.
 *
 * 접속 URL 은 `https://<ref>.supabase.co` 형식만 받는다. 커스텀 도메인, `db.<ref>...`, pooler,
 * 로컬 스택은 ref 를 확신할 수 없어 거부한다.
 *
 * 문항 본문(`questions[].text`)은 HTML 이다 (#537). 화면이 거른 HTML 을 그대로 렌더링하므로 평문 줄바꿈은
 * 공백으로 접힌다. 문단은 `<p>`, 목록은 `<ul><li>` 로 쓴다. 줄바꿈이 있는데 인식하는 블록 태그(`<p>`,
 * `<ul>` 등, 목록은 `BLOCK_HTML_TAG_RE`)가 없으면 스펙 검증이 막는다(줄바꿈 없는 평문 한 줄은 통과).
 *
 * 학생 공개 자료 (#544): 스펙의 `student_material_files`(로컬 파일 경로 배열)를 `exam-materials` 버킷에
 * 올리고, 그 공개 URL 을 `materials` 와 `student_materials` 에 함께 넣는다(모두 학생에게 공개). 경로 규칙은
 * `/api/upload` 와 같은 `lib/material-object-key.ts` 이고 교수자 폴더 아래다. 확장자와 크기는 앱 허용 목록
 * (`lib/upload-allowlist.ts`)으로 검사한다. 상대 경로는 스펙 파일이 있는 폴더 기준이다. dry-run 은 파일을
 * 읽어 크기만 확인하고 올리지 않는다. 텍스트 추출(`materials_text`)은 하지 않는다 - 표 파일은 앱도 추출하지
 * 않는다. 업로드 뒤 시험 행을 만들지 못하면 올린 파일을 지운다(행이 남았을 수 있는 경우는 남기고 경로를 알린다).
 *
 * 이 스크립트가 하지 않는 것: 시험 시작/종료, 첫 발행 기록, 학생 수 집계 - 입장 RPC 와 시작
 * 라우트의 몫이다. 만든 시험은 draft 로 끝난다.
 *
 * createExam 과 다른 점(알고 있는 차이):
 *   - 제목: `createExamSchema` 는 title 에 `sanitizeUserInput`(HTML 태그 제거·엔티티 해제)을 적용하지만
 *     이 스크립트는 `trim` 만 한다. 스펙 파일을 우리가 직접 만들기 때문에 이번에는 맞추지 않았다.
 *     태그나 엔티티가 든 제목을 넣으면 정제되지 않은 채 저장된다.
 *   - 응답이 유실된 INSERT: PG 오류 코드가 없는 실패는 "거부" 가 아니라 "결과 불명" 으로 보고
 *     같은 코드로 exams 를 다시 읽어 판정한다(createExam 은 이 경우를 따로 다루지 않는다).
 */

import { readFileSync } from "fs";
import { dirname, resolve as resolvePath } from "path";
import { pathToFileURL } from "url";
import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  buildExamInsertPayload,
  generateExamCode,
  type ExamRubricItem,
} from "../lib/exam-insert-payload";
import { makeMaterialObjectKey, materialStoragePath } from "../lib/material-object-key";
import { MAX_STUDENT_MATERIALS, validateStudentMaterials } from "../lib/student-materials";
import {
  UPLOAD_ALLOWED_EXTENSIONS,
  UPLOAD_ALLOWED_MIME_TYPES,
  UPLOAD_MAX_FILE_SIZE,
} from "../lib/upload-allowlist";

// ─────────────────────────────────────────────────────────────────────────────
// 스펙: 입력 JSON 한 개. 문항과 루브릭 문구는 이 저장소에 두지 않고 별도로 받는다.
// ─────────────────────────────────────────────────────────────────────────────
/**
 * 문항 단위 AI 역할 (#519). 문항 JSON 의 `ai_role` 로 저장되고 학생 시험 채팅이 읽는다.
 * 생략하면 기본 역할(사례형 출제자)이다. 허용 값은 이 둘뿐이다 - 오타가 조용히 기본 역할로
 * 떨어지면 분석 문항이 사례형으로 응시된다.
 */
export const MOCK_EXAM_AI_ROLES = ["case_author", "analysis_partner"] as const;
export type MockExamAiRole = (typeof MOCK_EXAM_AI_ROLES)[number];

export type MockExamQuestion = { id: string; text: string; type: "essay"; ai_role?: MockExamAiRole };

export type MockExamSpec = {
  title: string;
  questions: MockExamQuestion[];
  rubric: ExamRubricItem[];
  rubric_public: boolean;
  language: "ko" | "en";
  /**
   * 학생에게 공개할 로컬 파일 경로 (#544). 생략하면 빈 배열이고 자료 없이 만든다.
   * 상대 경로는 스펙 파일이 있는 폴더 기준이다.
   */
  student_material_files: string[];
};

const SPEC_KEYS = ["title", "questions", "rubric", "rubric_public", "language", "student_material_files"];

/** 교수 자료 버킷. `/api/upload` 와 같은 버킷이다. */
export const MATERIALS_BUCKET = "exam-materials";

/**
 * 확장자별로 업로드에 싣는 MIME. 앱 허용 목록(`UPLOAD_ALLOWED_EXTENSIONS`)의 모든 확장자를 덮고, 값은 모두
 * `UPLOAD_ALLOWED_MIME_TYPES` 안에 있어야 한다(테스트가 잠근다). 버킷의 허용 MIME 은 따로다 - 스테이징과
 * 운영 버킷은 pdf, 오피스 문서, 이미지, xls, xlsx, csv 만 받으므로(database/039) txt, hwp, zip 은 업로드
 * 단계에서 Storage 가 거부할 수 있다.
 */
export const CONTENT_TYPE_BY_EXTENSION: Readonly<Record<string, string>> = {
  ".pdf": "application/pdf",
  ".ppt": "application/vnd.ms-powerpoint",
  ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ".doc": "application/msword",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xls": "application/vnd.ms-excel",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".csv": "text/csv",
  ".txt": "text/plain",
  ".hwp": "application/x-hwp",
  ".hwpx": "application/vnd.hancom.hwpx",
  ".zip": "application/zip",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
};

/** 경로의 마지막 조각. 스펙은 Windows 에서도 쓰므로 슬래시와 역슬래시를 모두 구분자로 본다. */
function fileNameOfPath(path: string): string {
  return path.split(/[\\/]/).pop() ?? "";
}

/** `/api/upload` 와 같은 규칙: 마지막 확장자만 소문자로 본다. 없으면 빈 문자열. */
function uploadExtensionOf(fileName: string): string {
  const match = /\.([a-zA-Z0-9]+)$/.exec(fileName);
  return match ? `.${match[1].toLowerCase()}` : "";
}
const QUESTION_KEYS = ["id", "text", "type", "ai_role"];
const RUBRIC_KEYS = ["evaluationArea", "detailedCriteria"];
/** createExamSchema 의 title 상한과 같다. */
const MAX_TITLE_LENGTH = 500;

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const isNonEmptyString = (v: unknown): v is string => typeof v === "string" && v.trim() !== "";

const RUBRIC_SHAPE = '[{"evaluationArea": "...", "detailedCriteria": "..."}]';

/**
 * 문항 본문이 HTML 이라는 표시로 보는 블록 태그 (#537). 태그명 뒤는 공백, `>`, `/` 여야 한다 -
 * `x<3` 같은 부등호 평문이나 `<param>` 같은 다른 태그가 걸리지 않게 이 목록 기준으로만 판정한다.
 * 그래서 목록에 없는 태그(`<hr>`, `<tr>`, 인라인 태그)만 있는 본문은 줄바꿈이 있으면 막힌다.
 */
const BLOCK_HTML_TAG_RE = /<(?:p|br|ul|ol|li|div|h[1-6]|blockquote|pre|table)(?=[\s/>])/i;

/**
 * 줄바꿈이 있는데 블록 HTML 태그는 하나도 없는 본문인가.
 *
 * 문항 `text` 는 HTML 로 저장되고 화면(RichTextViewer)이 그대로 렌더링한다. 평문 줄바꿈은 HTML 에서
 * 공백 하나로 접혀 목록 같은 구조가 한 문단으로 보인다. 줄바꿈이 없는 평문 한 줄은 접힐 것이 없어
 * 통과한다. 앞뒤 공백·줄바꿈은 구조가 아니므로 trim 뒤에 본다.
 */
export function isPlainTextWithLineBreaks(text: string): boolean {
  return /[\r\n]/.test(text.trim()) && !BLOCK_HTML_TAG_RE.test(text);
}

/**
 * 스펙을 검증한다. 순수 함수이며 오류를 처음 하나에서 멈추지 않고 모두 모은다.
 *
 * 모르는 키는 거부한다. `duration`, `chat_weight`, `score_weights`, `status` 같은 값은 이
 * 스크립트가 정한 모의시험 값으로 고정돼 있고, 오타(`rubic`)가 조용히 무시되면 루브릭 없는
 * 시험이 만들어진다.
 */
export function validateMockExamSpec(
  raw: unknown
): { ok: true; spec: MockExamSpec } | { ok: false; errors: string[] } {
  if (!isPlainObject(raw)) {
    return { ok: false, errors: ["스펙은 JSON 객체여야 합니다."] };
  }
  const errors: string[] = [];

  for (const key of Object.keys(raw)) {
    if (!SPEC_KEYS.includes(key)) {
      errors.push(`스펙에 쓸 수 없는 키입니다: "${key}" (허용: ${SPEC_KEYS.join(", ")})`);
    }
  }

  // title
  let title = "";
  if (!isNonEmptyString(raw.title)) {
    errors.push("title 은 비어 있지 않은 문자열이어야 합니다.");
  } else {
    title = raw.title.trim();
    if (title.length > MAX_TITLE_LENGTH) {
      errors.push(`title 은 ${MAX_TITLE_LENGTH}자 이하여야 합니다 (현재 ${title.length}자).`);
    }
  }

  // questions
  const questions: MockExamQuestion[] = [];
  if (!Array.isArray(raw.questions) || raw.questions.length === 0) {
    errors.push("questions 는 문항이 1개 이상인 배열이어야 합니다.");
  } else {
    const seenIds = new Set<string>();
    raw.questions.forEach((q: unknown, i: number) => {
      const at = `questions[${i}]`;
      if (!isPlainObject(q)) {
        errors.push(`${at} 는 객체여야 합니다.`);
        return;
      }
      for (const key of Object.keys(q)) {
        if (QUESTION_KEYS.includes(key)) continue;
        errors.push(
          key === "idx"
            ? `${at} 에 idx 를 넣을 수 없습니다: idx 가 없으면 배열 위치가 q_idx 가 됩니다.`
            : `${at} 에 쓸 수 없는 키입니다: "${key}" (허용: ${QUESTION_KEYS.join(", ")})`
        );
      }
      if (!isNonEmptyString(q.id)) {
        errors.push(`${at}.id 는 비어 있지 않은 문자열이어야 합니다.`);
      } else if (seenIds.has(q.id)) {
        errors.push(`${at}.id 가 중복입니다: "${q.id}"`);
      } else {
        seenIds.add(q.id);
      }
      if (!isNonEmptyString(q.text)) {
        errors.push(`${at}.text 는 비어 있지 않은 문자열이어야 합니다.`);
      } else if (isPlainTextWithLineBreaks(q.text)) {
        errors.push(
          `${at}.text${isNonEmptyString(q.id) ? ` (id "${q.id}")` : ""} 에 줄바꿈이 있는데 인식하는 블록 태그(<p>, <ul> 등)가 하나도 없습니다. 문항 본문은 HTML 이라 평문 줄바꿈은 화면에서 공백으로 접혀 한 문단으로 보입니다. 문단은 <p>...</p>, 목록은 <ul><li>...</li></ul> 로 감싸세요.`
        );
      }
      if (q.type !== "essay") {
        errors.push(
          `${at}.type 은 "essay" 만 허용합니다 (받은 값: ${JSON.stringify(q.type)}). 이 스크립트는 서술형만 다룹니다.`
        );
      }
      // ai_role 은 선택이다. 키가 있으면 허용 값이어야 하고, 없으면 문항에도 키를 만들지 않는다.
      let aiRole: MockExamAiRole | undefined;
      let aiRoleValid = true;
      if ("ai_role" in q) {
        if ((MOCK_EXAM_AI_ROLES as readonly unknown[]).includes(q.ai_role)) {
          aiRole = q.ai_role as MockExamAiRole;
        } else {
          aiRoleValid = false;
          errors.push(
            `${at}.ai_role 은 ${MOCK_EXAM_AI_ROLES.map((r) => `"${r}"`).join(" 또는 ")} 이어야 합니다 (생략하면 기본 역할). 받은 값: ${JSON.stringify(q.ai_role)}`
          );
        }
      }
      if (isNonEmptyString(q.id) && isNonEmptyString(q.text) && q.type === "essay" && aiRoleValid) {
        questions.push({
          id: q.id,
          text: q.text,
          type: "essay",
          ...(aiRole ? { ai_role: aiRole } : {}),
        });
      }
    });
  }

  // rubric: 배열이어야 한다. 문자열이면 lib/grading.ts 의 Array.isArray 검사에서 조용히 무시된다.
  const rubric: ExamRubricItem[] = [];
  if (raw.rubric === undefined) {
    errors.push(
      `rubric 이 없습니다. 배열이어야 합니다: ${RUBRIC_SHAPE}. 배열이 아니면 채점이 조용히 무시합니다.`
    );
  } else if (!Array.isArray(raw.rubric)) {
    errors.push(
      `rubric 은 배열이어야 합니다: ${RUBRIC_SHAPE}. 문자열 등 배열이 아닌 값은 채점이 조용히 무시합니다 (lib/grading.ts 의 Array.isArray 검사).`
    );
  } else if (raw.rubric.length === 0) {
    errors.push("rubric 이 비어 있습니다. 항목이 1개 이상이어야 합니다.");
  } else {
    raw.rubric.forEach((item: unknown, i: number) => {
      const at = `rubric[${i}]`;
      if (!isPlainObject(item)) {
        errors.push(`${at} 는 객체여야 합니다: {"evaluationArea": "...", "detailedCriteria": "..."}`);
        return;
      }
      let valid = true;
      for (const key of Object.keys(item)) {
        if (!RUBRIC_KEYS.includes(key)) {
          errors.push(`${at} 에 쓸 수 없는 키입니다: "${key}" (허용: ${RUBRIC_KEYS.join(", ")})`);
          valid = false;
        }
      }
      for (const key of RUBRIC_KEYS) {
        if (!isNonEmptyString(item[key])) {
          errors.push(`${at}.${key} 는 비어 있지 않은 문자열이어야 합니다.`);
          valid = false;
        }
      }
      if (valid) {
        rubric.push({
          evaluationArea: item.evaluationArea as string,
          detailedCriteria: item.detailedCriteria as string,
        });
      }
    });
  }

  // rubric_public / language: 생략하면 기본값(false / ko)
  let rubricPublic = false;
  if (raw.rubric_public !== undefined) {
    if (typeof raw.rubric_public !== "boolean") {
      errors.push("rubric_public 은 true 또는 false 여야 합니다.");
    } else {
      rubricPublic = raw.rubric_public;
    }
  }
  let language: "ko" | "en" = "ko";
  if (raw.language !== undefined) {
    if (raw.language !== "ko" && raw.language !== "en") {
      errors.push('language 는 "ko" 또는 "en" 이어야 합니다.');
    } else {
      language = raw.language;
    }
  }

  // student_material_files: 생략하면 빈 배열. 있으면 경로 문자열 배열이고, 확장자는 앱 업로드 허용 목록에 있어야
  // 한다. 개수는 학생 공개 상한과 같다(모든 파일을 공개하므로). 크기는 파일을 읽은 뒤 main 이 본다.
  const studentMaterialFiles: string[] = [];
  if (raw.student_material_files !== undefined) {
    if (!Array.isArray(raw.student_material_files)) {
      errors.push("student_material_files 는 로컬 파일 경로 문자열의 배열이어야 합니다.");
    } else {
      if (raw.student_material_files.length > MAX_STUDENT_MATERIALS) {
        errors.push(
          `student_material_files 는 ${MAX_STUDENT_MATERIALS}개까지입니다 (학생 공개 상한, 받은 개수 ${raw.student_material_files.length}).`
        );
      }
      const seenPaths = new Set<string>();
      raw.student_material_files.forEach((file: unknown, i: number) => {
        const at = `student_material_files[${i}]`;
        if (!isNonEmptyString(file)) {
          errors.push(`${at} 는 비어 있지 않은 파일 경로 문자열이어야 합니다.`);
          return;
        }
        const filePath = file.trim();
        if (seenPaths.has(filePath)) {
          errors.push(`${at} 가 중복입니다: "${filePath}"`);
          return;
        }
        seenPaths.add(filePath);
        const name = fileNameOfPath(filePath);
        const ext = uploadExtensionOf(name);
        if (!ext || !UPLOAD_ALLOWED_EXTENSIONS.has(ext)) {
          errors.push(
            `${at} ("${name}") 의 확장자 ${ext || "(없음)"} 는 앱 업로드 허용 목록(lib/upload-allowlist.ts)에 없습니다. 허용: ${[...UPLOAD_ALLOWED_EXTENSIONS].join(", ")}`
          );
          return;
        }
        studentMaterialFiles.push(filePath);
      });
    }
  }

  if (errors.length > 0) return { ok: false, errors };
  return {
    ok: true,
    spec: {
      title,
      questions,
      rubric,
      rubric_public: rubricPublic,
      language,
      student_material_files: studentMaterialFiles,
    },
  };
}

/** 읽어 들인 공개 자료 파일 한 개. 업로드는 `seedMockExam` 이 `--apply` 에서만 한다. */
export type SeedMaterialFile = {
  /** 스펙에 적힌 경로 그대로. */
  source: string;
  /** 스펙 파일 폴더 기준으로 푼 경로. */
  resolvedPath: string;
  fileName: string;
  /** 점을 포함한 소문자 확장자 (`.xlsx`). */
  extension: string;
  contentType: string;
  size: number;
  bytes: Uint8Array;
};

/**
 * 스펙의 `student_material_files` 를 읽는다. 상대 경로는 스펙 파일이 있는 폴더 기준이다.
 * 빈 파일과 앱 상한(`UPLOAD_MAX_FILE_SIZE`)을 넘는 파일은 거부한다. 오류는 모두 모아 돌려준다.
 */
export function loadMaterialFiles(
  paths: string[],
  specPath: string,
  readBinary: (path: string) => Uint8Array
): { ok: true; files: SeedMaterialFile[] } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  const files: SeedMaterialFile[] = [];
  const baseDir = dirname(specPath);
  for (const source of paths) {
    const resolvedPath = resolvePath(baseDir, source);
    const fileName = fileNameOfPath(source);
    const extension = uploadExtensionOf(fileName);
    const contentType = CONTENT_TYPE_BY_EXTENSION[extension];
    if (!contentType || !UPLOAD_ALLOWED_MIME_TYPES.has(contentType)) {
      errors.push(`"${source}": 확장자 ${extension || "(없음)"} 의 MIME 을 정할 수 없습니다.`);
      continue;
    }
    let bytes: Uint8Array;
    try {
      bytes = readBinary(resolvedPath);
    } catch (e) {
      errors.push(`"${source}" 를 읽을 수 없습니다 (${resolvedPath}): ${errText(e)}`);
      continue;
    }
    if (bytes.byteLength === 0) {
      errors.push(`"${source}" 가 빈 파일입니다.`);
      continue;
    }
    if (bytes.byteLength > UPLOAD_MAX_FILE_SIZE) {
      errors.push(
        `"${source}" 가 앱 업로드 상한 ${UPLOAD_MAX_FILE_SIZE} bytes 를 넘습니다 (${bytes.byteLength} bytes).`
      );
      continue;
    }
    files.push({ source, resolvedPath, fileName, extension, contentType, size: bytes.byteLength, bytes });
  }
  return errors.length > 0 ? { ok: false, errors } : { ok: true, files };
}

// ─────────────────────────────────────────────────────────────────────────────
// 인자, 접속 정보
// ─────────────────────────────────────────────────────────────────────────────
export type SeedArgs = {
  spec: string;
  instructorId: string;
  parentFolderId: string | null;
  apply: boolean;
  confirmProjectRef: string | null;
  allowDuplicateTitle: boolean;
  help: boolean;
};

const VALUE_FLAGS = ["--spec", "--instructor-id", "--parent-folder-id", "--confirm-project-ref"];
const SWITCH_FLAGS = ["--apply", "--allow-duplicate-title", "--help"];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const USAGE = `사용법:
  npx tsx scripts/seed-mock-exam.ts --spec <스펙.json> --instructor-id <id> [옵션]

기본은 dry-run 입니다. DB 에 아무것도 쓰지 않고, 읽기 전용 사전 점검과 만들 행을 출력합니다.

필수:
  --spec <경로>                  스펙 JSON (title, questions, rubric, rubric_public, language; 문항의 ai_role 과
                                 student_material_files 는 선택)
  --instructor-id <id>           시험 소유자(profiles.id = exams.instructor_id)

문항 본문(questions[].text)은 HTML 입니다. 문단은 <p>, 목록은 <ul><li> 로 쓰세요.
줄바꿈이 있는데 인식하는 블록 태그(<p>, <ul> 등)가 없는 본문은 화면에서 한 문단으로 접히므로 스펙 검증이 막습니다.

student_material_files 는 학생에게 공개할 로컬 파일 경로 배열입니다(상대 경로는 스펙 파일 폴더 기준).
--apply 에서 exam-materials 버킷의 교수자 폴더에 올리고 materials 와 student_materials 에 넣습니다.
dry-run 은 파일 크기만 확인하고 올리지 않습니다. 확장자와 크기는 앱 업로드 허용 목록을 따릅니다.

옵션:
  --parent-folder-id <uuid>      드라이브에서 시험을 둘 폴더(exam_nodes.id). 없으면 루트
  --apply                        실제로 씁니다. --confirm-project-ref 도 함께 필요합니다
  --confirm-project-ref <ref>    접속 정보가 있어 DB 를 읽는 모든 실행(dry-run 포함)에 필요합니다. 독립된 출처
                                 (Supabase 대시보드, 승인 문서)에서 확인한 프로젝트 ref 를 직접 넘기세요.
                                 환경변수의 URL 에서 읽은 값과 정확히 같아야 하며, 틀려도 기대값은 알려 주지 않습니다
  --allow-duplicate-title        같은 소유자에게 같은 제목의 시험이 이미 있어도 진행합니다.
                                 먼저 그 행을 직접 조회해 확인한 뒤에만 쓰세요
  --help                         이 도움말

환경변수 (파일에서 읽지 않습니다):
  SUPABASE_URL                   (없으면 NEXT_PUBLIC_SUPABASE_URL). https://<ref>.supabase.co 형식만 받습니다
  SUPABASE_SERVICE_ROLE_KEY

접속 정보가 없으면 dry-run 은 스펙 검증과 만들 행 미리보기만 하고 읽기 점검을 건너뜁니다(ref 확인 불필요).
운영 DB 실행은 별도 명시 승인이 있어야 합니다. 스테이징 리허설을 먼저 하세요.`;

export function parseArgs(argv: string[]): { ok: true; args: SeedArgs } | { ok: false; error: string } {
  const args: SeedArgs = {
    spec: "",
    instructorId: "",
    parentFolderId: null,
    apply: false,
    confirmProjectRef: null,
    allowDuplicateTitle: false,
    help: false,
  };
  const seen = new Set<string>();

  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (!token.startsWith("--")) {
      return { ok: false, error: `예상하지 못한 인자입니다: ${token}` };
    }
    const eq = token.indexOf("=");
    const flag = eq === -1 ? token : token.slice(0, eq);
    const inline = eq === -1 ? undefined : token.slice(eq + 1);

    if (!VALUE_FLAGS.includes(flag) && !SWITCH_FLAGS.includes(flag)) {
      return { ok: false, error: `알 수 없는 옵션입니다: ${flag}` };
    }
    if (seen.has(flag)) return { ok: false, error: `옵션이 두 번 주어졌습니다: ${flag}` };
    seen.add(flag);

    if (SWITCH_FLAGS.includes(flag)) {
      if (inline !== undefined) return { ok: false, error: `${flag} 는 값을 받지 않습니다.` };
      if (flag === "--apply") args.apply = true;
      else if (flag === "--allow-duplicate-title") args.allowDuplicateTitle = true;
      else args.help = true;
      continue;
    }

    const value = inline !== undefined ? inline : argv[++i];
    if (value === undefined || value === "" || (inline === undefined && value.startsWith("--"))) {
      return { ok: false, error: `${flag} 에는 값이 필요합니다.` };
    }
    if (flag === "--spec") args.spec = value;
    else if (flag === "--instructor-id") args.instructorId = value;
    else if (flag === "--parent-folder-id") args.parentFolderId = value;
    else args.confirmProjectRef = value;
  }

  if (args.help) return { ok: true, args };
  if (!args.spec) return { ok: false, error: "--spec <스펙.json> 이 필요합니다." };
  if (!args.instructorId) return { ok: false, error: "--instructor-id <id> 가 필요합니다." };
  if (/\s/.test(args.instructorId)) return { ok: false, error: "--instructor-id 에 공백이 들어 있습니다." };
  if (args.parentFolderId !== null && !UUID_RE.test(args.parentFolderId)) {
    return { ok: false, error: "--parent-folder-id 는 UUID 여야 합니다." };
  }
  return { ok: true, args };
}

/** `<ref>.supabase.co` 단 한 겹. `db.<ref>`·다단계 서브도메인·pooler 는 맞지 않는다. */
const SUPABASE_HOST_RE = /^([a-z0-9]+)\.supabase\.co$/;

/**
 * 접속 URL 에서 프로젝트 ref 를 뽑는다. `https://<ref>.supabase.co` 만 받는다.
 *
 * 스킴은 https 뿐이다(서비스 롤 키를 평문으로 보내지 않는다). 포트와 계정 정보가 붙은 주소,
 * 커스텀 도메인, `db.<ref>.supabase.co`, pooler, 로컬 스택은 ref 를 확신할 수 없어 null 이다.
 */
export function deriveProjectRef(url: string | null | undefined): string | null {
  if (!url) return null;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:") return null;
  if (parsed.username || parsed.password || parsed.port) return null;
  const match = SUPABASE_HOST_RE.exec(parsed.hostname);
  return match ? match[1] : null;
}

export type Connection = {
  url: string | null;
  serviceRoleKey: string | null;
  projectRef: string | null;
  error: string | null;
};

/**
 * 환경변수에서 접속 정보를 정한다. 파일은 읽지 않는다.
 *
 * `SUPABASE_URL` 을 먼저 보고, 없으면 앱이 쓰는 `NEXT_PUBLIC_SUPABASE_URL` 을 쓴다. 둘 다 있는데
 * 서로 다른 프로젝트를 가리키면 어느 쪽이 맞는지 알 수 없으므로 거부한다. 오류 문구에 키를 싣지 않는다.
 */
export function resolveConnection(env: Record<string, string | undefined>): Connection {
  const primary = env.SUPABASE_URL?.trim() || null;
  const fallback = env.NEXT_PUBLIC_SUPABASE_URL?.trim() || null;
  const key = env.SUPABASE_SERVICE_ROLE_KEY?.trim() || null;
  const empty = { url: null, serviceRoleKey: null, projectRef: null };

  if (primary && fallback) {
    const a = deriveProjectRef(primary);
    const b = deriveProjectRef(fallback);
    if (a !== b) {
      return {
        ...empty,
        error: `SUPABASE_URL (${a ?? "읽을 수 없음"}) 과 NEXT_PUBLIC_SUPABASE_URL (${b ?? "읽을 수 없음"}) 이 서로 다른 프로젝트를 가리킵니다. 하나만 남기세요.`,
      };
    }
  }
  const url = primary ?? fallback;

  if (url && !key) {
    return { ...empty, error: "SUPABASE_SERVICE_ROLE_KEY 가 없습니다. URL 과 키를 함께 환경변수로 설정하세요." };
  }
  if (!url && key) {
    return { ...empty, error: "SUPABASE_URL (또는 NEXT_PUBLIC_SUPABASE_URL) 이 없습니다. URL 과 키를 함께 환경변수로 설정하세요." };
  }
  if (!url || !key) return { ...empty, error: null };

  const projectRef = deriveProjectRef(url);
  if (!projectRef) {
    return {
      ...empty,
      error:
        "접속 URL 이 https://<ref>.supabase.co 형식이 아닙니다 (값은 출력하지 않습니다). 커스텀 도메인, db.<ref>.supabase.co, pooler, 로컬 스택 URL 은 이 스크립트가 지원하지 않습니다.",
    };
  }
  return { url, serviceRoleKey: key, projectRef, error: null };
}

// ─────────────────────────────────────────────────────────────────────────────
// 실행
// ─────────────────────────────────────────────────────────────────────────────
export type SeedOptions = {
  /** 서비스 롤 클라이언트. 접속 정보가 없는 오프라인 dry-run 은 null. 테스트는 가짜를 넣는다. */
  client: SupabaseClient | null;
  spec: MockExamSpec;
  instructorId: string;
  parentFolderId?: string | null;
  apply: boolean;
  /** 접속한 프로젝트의 ref (환경변수의 URL 에서 뽑은 값). */
  projectRef: string | null;
  /** 사용자가 `--confirm-project-ref` 로 확인한 ref. */
  confirmProjectRef: string | null;
  allowDuplicateTitle?: boolean;
  /**
   * 스펙의 `student_material_files` 를 `loadMaterialFiles` 로 읽은 결과 (#544). 스펙에 파일이 있으면 같은
   * 개수가 있어야 한다. `main` 이 채운다.
   */
  materialFiles?: SeedMaterialFile[];
  now?: () => string;
  generateCode?: () => string;
  /** 업로드 객체 키의 uuid. 테스트가 고정값을 넣는다. */
  uuid?: () => string;
  out?: (line: string) => void;
};

export type SeedReport = {
  status: "dry-run" | "applied" | "blocked" | "failed";
  exitCode: number;
  blockers: string[];
  warnings: string[];
  planned: { exams: Record<string, unknown>; examNode: Record<string, unknown> } | null;
  result: { examId: string; code: string; nodeId: string } | null;
  compensation: "not-needed" | "deleted" | "failed";
  /**
   * exams INSERT 가 PG 오류 코드 없이 끝난 경우(응답 유실 등)의 판정.
   * none: 해당 없음 / adopted: 서버에 행이 있어 이어서 씀 / absent: 행이 없음 확인 / unknown: 확인도 실패
   */
  ambiguousInsert: "none" | "adopted" | "absent" | "unknown";
  /** `--apply` 에서 버킷에 올린 공개 자료 (#544). */
  uploads: Array<{ source: string; path: string; url: string }>;
  /**
   * 실패 뒤 올린 파일의 처리. not-needed: 올린 것이 없거나 성공 / removed: 지움 / failed: 지우지 못함 /
   * kept: 시험 행이 남았을 수 있어 일부러 남김(경로를 출력한다).
   */
  uploadCleanup: "not-needed" | "removed" | "failed" | "kept";
};

type Row = Record<string, unknown>;

/** createExam 의 MAX_CODE_ATTEMPTS / MAX_INSERT_RETRIES 와 같은 값이다. */
const MAX_CODE_ATTEMPTS = 10;
const MAX_INSERT_ATTEMPTS = 3;
const EXAM_ID_PLACEHOLDER = "<exams INSERT 후 결정>";

/** Error 와 PostgREST 오류 객체(`{ code, message }`) 모두에서 사람이 읽을 문구를 뽑는다. */
function errText(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === "object" && e !== null && "message" in e) {
    return String((e as { message: unknown }).message);
  }
  return String(e);
}

/** 형제 노드의 max(sort_order)+1. 형제가 없으면 0. createExam 과 같은 질의다. */
async function nextSortOrder(
  client: SupabaseClient,
  instructorId: string,
  parentId: string | null
): Promise<{ value: number; error: string | null }> {
  let query = client
    .from("exam_nodes")
    .select("sort_order")
    .eq("instructor_id", instructorId)
    .order("sort_order", { ascending: false })
    .limit(1);
  query = parentId === null ? query.is("parent_id", null) : query.eq("parent_id", parentId);
  const { data, error } = await query.maybeSingle();
  if (error) return { value: 0, error: errText(error) };
  const max = (data as Row | null)?.sort_order;
  return { value: typeof max === "number" ? max + 1 : 0, error: null };
}

/** 노드 실패 뒤 방금 만든 exams 행을 지운다. 지우지 못하면 호출자가 id 를 알려줘야 한다. */
async function compensateExam(client: SupabaseClient, examId: string): Promise<"deleted" | "failed"> {
  try {
    const { error } = await client.from("exams").delete().eq("id", examId);
    return error ? "failed" : "deleted";
  } catch {
    return "failed";
  }
}

/** PG 오류 코드가 있으면 서버가 INSERT 를 거부한 것이다. 코드가 없으면(`""`, undefined) 결과를 모른다. */
function isDefiniteRejection(error: unknown): boolean {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === "string" && code.length > 0;
}

type InsertVerdict =
  | { state: "ours"; id: string }
  | { state: "absent" }
  | { state: "foreign" }
  | { state: "unknown"; reason: string };

/**
 * 응답을 잃은 INSERT 가 서버에 반영됐는지 같은 코드로 다시 읽어 판정한다.
 * code 는 UNIQUE 라서 우리 행이면 최대 한 건이다. 코드가 같아도 소유자와 제목이 다르면 남의 시험이다.
 */
async function verifyInsertedExam(
  client: SupabaseClient,
  code: string,
  instructorId: string,
  title: string
): Promise<InsertVerdict> {
  try {
    const { data, error } = await client
      .from("exams")
      .select("id, code, title, instructor_id")
      .eq("code", code)
      .maybeSingle();
    if (error) return { state: "unknown", reason: errText(error) };
    if (!data) return { state: "absent" };
    const row = data as Row;
    return row.instructor_id === instructorId && row.title === title
      ? { state: "ours", id: String(row.id) }
      : { state: "foreign" };
  } catch (e) {
    return { state: "unknown", reason: errText(e) };
  }
}

export async function seedMockExam(options: SeedOptions): Promise<SeedReport> {
  const {
    client,
    spec,
    instructorId,
    apply,
    projectRef,
    confirmProjectRef,
    allowDuplicateTitle = false,
  } = options;
  const parentFolderId = options.parentFolderId ?? null;
  const now = options.now ?? (() => new Date().toISOString());
  const generateCode = options.generateCode ?? generateExamCode;
  const out = options.out ?? ((line: string) => console.log(line));
  const materialFiles = options.materialFiles ?? [];

  const blockers: string[] = [];
  const warnings: string[] = [];
  const report: SeedReport = {
    status: "dry-run",
    exitCode: 0,
    blockers,
    warnings,
    planned: null,
    result: null,
    compensation: "not-needed",
    ambiguousInsert: "none",
    uploads: [],
    uploadCleanup: "not-needed",
  };

  let readStarted = false;
  const block = (): SeedReport => {
    out("");
    out("중단 사유:");
    for (const b of blockers) out(`  - ${b}`);
    out(
      readStarted
        ? "아무것도 쓰지 않았습니다 (읽기 전용 점검만 했습니다)."
        : "DB 를 읽지도 쓰지도 않았습니다."
    );
    report.status = "blocked";
    report.exitCode = 1;
    return report;
  };

  out(apply ? "모의시험 시드 - --apply (DB 에 씁니다)" : "모의시험 시드 - dry-run (DB 에 쓰지 않습니다)");
  out(`소유자(instructor_id): ${instructorId}`);

  // ── 프로젝트 ref 확인: DB 를 읽기 전에 닫는다 ───────────────────────────────
  // 접속한 실행은 dry-run 이어도 DB 를 읽는다(운영 데이터에 닿는다). 그래서 쓰기뿐 아니라 읽기도
  // 확인된 ref 가 있어야 시작한다. 접속 정보 없는 오프라인 dry-run 만 예외다.
  //
  // 오류 안내에는 접속한 ref 를 싣지 않는다. 안내가 값을 알려 주면 사용자가 그대로 복사해 붙여
  // 확인이 아니라 통과 의식이 된다. ref 는 독립된 출처에서 확인해 직접 넘기게 한다.
  if (apply && (!client || !projectRef)) {
    blockers.push("--apply 에는 접속 정보(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY 환경변수)가 필요합니다.");
  }
  if (client !== null || apply) {
    const when = apply ? "--apply" : "접속 정보가 있어 DB 를 읽는 실행(dry-run 포함)";
    if (confirmProjectRef === null) {
      blockers.push(
        `${when}에는 --confirm-project-ref <ref> 가 필요합니다. 독립된 출처(Supabase 대시보드, 승인 문서)에서 확인한 프로젝트 ref 를 직접 넘기세요. 이 스크립트는 접속 대상의 ref 를 오류 안내에 알려 주지 않습니다.`
      );
    } else if (projectRef !== null && confirmProjectRef !== projectRef) {
      blockers.push(
        `--confirm-project-ref("${confirmProjectRef}") 가 환경변수가 가리키는 프로젝트와 다릅니다. 독립된 출처에서 확인한 ref 를 직접 넘기고, SUPABASE_URL 이 의도한 프로젝트를 가리키는지 확인하세요.`
      );
    }
  }
  if (blockers.length > 0) return block();
  out(
    client
      ? `접속 프로젝트 - project ref: ${projectRef} (--confirm-project-ref 와 일치)`
      : "접속 프로젝트 - project ref: (접속 정보 없음)"
  );

  // ── 읽기 전용 사전 점검 ──────────────────────────────────────────────────────
  let sortOrder: number | null = null;
  let code = generateCode();

  if (!client) {
    out("");
    out("접속 정보가 없어 읽기 전용 사전 점검을 건너뜁니다 (스펙 검증과 만들 행 미리보기만 합니다).");
    out("코드 중복 확인과 sort_order 계산은 접속한 뒤에야 가능합니다.");
  } else {
    readStarted = true;
    out("");
    out("[읽기 전용 사전 점검]");

    const { data: profileData, error: profileError } = await client
      .from("profiles")
      .select("id, role, plan, status")
      .eq("id", instructorId)
      .maybeSingle();
    const profile = profileData as Row | null;
    if (profileError) {
      blockers.push(`profiles 조회에 실패했습니다: ${errText(profileError)}`);
    } else if (!profile) {
      blockers.push(`profiles 에 id="${instructorId}" 행이 없습니다.`);
    } else {
      out(`profiles.role: ${String(profile.role)}`);
      out(`profiles.plan: ${String(profile.plan)}`);
      out(`profiles.status: ${String(profile.status)}`);
      if (profile.role !== "instructor") {
        blockers.push(`profiles.role 이 "${String(profile.role)}" 입니다. 교수자(instructor)여야 합니다 (createExam 도 교수자만 만들 수 있습니다).`);
      }
      if (profile.plan !== "verified") {
        warnings.push(
          `경고: profiles.plan 이 "${String(profile.plan)}" 입니다. verified 가 아니면 (1) 시험당 학생 5명까지만 입장할 수 있어 53명 입장이 불가하고 (STUDENT_LIMIT_REACHED), (2) 발행(첫 학생 입장으로 기록되는 최초 발행) 3회 한도가 있어 이미 3개를 발행한 소유자의 새 시험에는 첫 학생부터 입장할 수 없습니다 (PUBLISH_LIMIT_REACHED). plan 을 verified 로 올린 뒤 진행하세요.`
        );
      }
    }

    const { data: instructorData, error: instructorError } = await client
      .from("instructor_profiles")
      .select("id, status")
      .eq("id", instructorId)
      .maybeSingle();
    const instructorProfile = instructorData as Row | null;
    if (instructorError) {
      blockers.push(`instructor_profiles 조회에 실패했습니다: ${errText(instructorError)}`);
    } else if (!instructorProfile) {
      out("instructor_profiles.status: (행 없음)");
      warnings.push(`경고: instructor_profiles 에 id="${instructorId}" 행이 없습니다.`);
    } else {
      out(`instructor_profiles.status: ${String(instructorProfile.status)}`);
      if (instructorProfile.status !== "approved") {
        warnings.push(`경고: instructor_profiles.status 가 "${String(instructorProfile.status)}" 입니다 (approved 가 기대값).`);
      }
    }

    if (parentFolderId === null) {
      out("부모 폴더: 루트");
    } else {
      const { data: folderData, error: folderError } = await client
        .from("exam_nodes")
        .select("id, kind, name, instructor_id")
        .eq("id", parentFolderId)
        .maybeSingle();
      const folder = folderData as Row | null;
      if (folderError) {
        blockers.push(`부모 폴더 조회에 실패했습니다: ${errText(folderError)}`);
      } else if (!folder) {
        blockers.push(`exam_nodes 에 id="${parentFolderId}" 노드가 없습니다.`);
      } else if (folder.kind !== "folder") {
        blockers.push(`부모 노드 "${parentFolderId}" 는 폴더가 아닙니다 (kind="${String(folder.kind)}").`);
      } else if (folder.instructor_id !== instructorId) {
        blockers.push(`부모 폴더 "${parentFolderId}" 는 이 소유자의 폴더가 아닙니다.`);
      } else {
        out(`부모 폴더: ${String(folder.name)} (${parentFolderId})`);
      }
    }

    const sort = await nextSortOrder(client, instructorId, parentFolderId);
    if (sort.error) {
      blockers.push(`exam_nodes 형제 조회에 실패했습니다: ${sort.error}`);
    } else {
      sortOrder = sort.value;
      out(`exam_nodes.sort_order: ${sortOrder} (같은 위치 형제의 max+1)`);
    }

    const { data: sameTitle, error: titleError } = await client
      .from("exams")
      .select("id, code, status")
      .eq("instructor_id", instructorId)
      .eq("title", spec.title)
      .limit(5);
    if (titleError) {
      blockers.push(`같은 제목 시험 조회에 실패했습니다: ${errText(titleError)}`);
    } else if (Array.isArray(sameTitle) && sameTitle.length > 0) {
      const list = (sameTitle as Row[]).map((r) => `id=${String(r.id)} code=${String(r.code)} status=${String(r.status)}`).join("; ");
      out(`같은 제목의 시험이 이미 있습니다: ${list}`);
      if (allowDuplicateTitle) {
        warnings.push(`경고: 같은 제목의 시험이 이미 있지만 --allow-duplicate-title 로 진행합니다 (${list}).`);
      } else {
        blockers.push(
          `이 소유자에게 같은 제목의 시험이 이미 있습니다 (${list}). 이전 실행이 중간에 끊겼거나 apply 를 두 번 돌렸을 수 있습니다. 먼저 위 id/code 로 exams 와 exam_nodes 를 직접 조회해 이 행이 이미 쓸 수 있는 시험인지(드라이브에 노드가 연결돼 있는지 포함) 확인하세요. 행이 없다고 믿고 --allow-duplicate-title 을 쓰지 마세요. 같은 제목을 의도적으로 한 번 더 만들 때만 그 옵션을 쓰세요.`
        );
      }
    } else {
      out("같은 제목의 기존 시험: 없음");
    }

    // 코드 후보: createExam 의 사전 중복 검사와 같은 한도로 빈 코드를 찾는다.
    let found = false;
    for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt++) {
      const candidate = attempt === 0 ? code : generateCode();
      const { data: taken, error: codeError } = await client
        .from("exams")
        .select("code")
        .eq("code", candidate)
        .maybeSingle();
      if (codeError) {
        blockers.push(`시험 코드 중복 조회에 실패했습니다: ${errText(codeError)}`);
        found = true; // 조회 실패는 위에서 막았다. 재시도 루프를 끝낸다.
        break;
      }
      if (!taken) {
        code = candidate;
        found = true;
        break;
      }
    }
    if (!found) {
      blockers.push(`빈 시험 코드를 ${MAX_CODE_ATTEMPTS}번 시도해도 찾지 못했습니다.`);
    }
    out(`시험 코드 후보: ${code} (--apply 에서 충돌하면 다시 뽑습니다)`);
  }

  for (const w of warnings) out(w);

  // ── 올릴 파일 (#544) ───────────────────────────────────────────────────────
  if (materialFiles.length !== spec.student_material_files.length) {
    blockers.push(
      `스펙의 student_material_files ${spec.student_material_files.length}개 중 읽은 파일이 ${materialFiles.length}개입니다. main 이 loadMaterialFiles 로 읽은 결과를 넘겨야 합니다.`
    );
  }
  const timestamp = now();
  const hasMaterials = materialFiles.length > 0;
  if (hasMaterials) {
    out("");
    out(`[올릴 파일] ${MATERIALS_BUCKET} 버킷, 모두 학생에게 공개 (${materialFiles.length}개)`);
    const datePart = timestamp.slice(0, 10);
    for (const f of materialFiles) {
      out(
        `  - ${f.source} (${f.size} bytes, ${f.contentType}) → ${materialStoragePath(instructorId, `${datePart}_<uuid>${f.extension}`)}`
      );
    }
    out(
      apply
        ? "  uuid 는 업로드할 때 정합니다. 시험 행을 만들기 전에 올립니다."
        : "  dry-run 이라 올리지 않습니다. uuid 는 업로드할 때 정합니다."
    );
  }

  /** exams 행. 공개 자료가 있으면 materials 와 student_materials 에 같은 URL 목록을 넣는다. */
  const buildRow = (materialUrls: string[] | null) =>
    buildExamInsertPayload({
      title: spec.title,
      code,
      duration: 0,
      questions: spec.questions,
      materials: materialUrls ?? [],
      materials_text: [],
      ...(materialUrls ? { student_materials: materialUrls } : {}),
      chat_weight: null,
      status: "draft",
      instructor_id: instructorId,
      created_at: timestamp,
      updated_at: timestamp,
      rubric: spec.rubric,
      rubric_public: spec.rubric_public,
      language: spec.language,
    });

  // dry-run 과 미리보기에서는 URL 자리에 파일 이름을 적은 자리표시를 넣는다. 실제 URL 은 업로드 뒤에 정해진다.
  const built = buildRow(
    hasMaterials ? materialFiles.map((f) => `<업로드 후 정해지는 공개 URL: ${f.fileName}>`) : null
  );
  if (!built.ok) {
    blockers.push(`exams 행을 만들 수 없습니다: ${built.message}`);
    return block();
  }
  let examRow = built.payload;
  const nodeRow: Row = {
    instructor_id: instructorId,
    parent_id: parentFolderId,
    kind: "exam",
    name: spec.title,
    exam_id: EXAM_ID_PLACEHOLDER,
    sort_order: sortOrder ?? "(접속 후 계산)",
  };
  report.planned = { exams: examRow, examNode: nodeRow };

  out("");
  out("[만들 행] exams");
  out(JSON.stringify(examRow, null, 2));
  out("[만들 행] exam_nodes");
  out(JSON.stringify(nodeRow, null, 2));

  if (blockers.length > 0) return block();

  if (!apply) {
    out("");
    out("dry-run 입니다. DB 에 아무것도 쓰지 않았습니다.");
    out(
      client
        ? "쓰려면 같은 명령에 --apply 를 더하세요 (--confirm-project-ref 는 이미 확인됐습니다)."
        : "쓰려면 접속 정보를 환경변수로 주고 --apply --confirm-project-ref <독립된 출처에서 확인한 ref> 를 함께 주세요."
    );
    return report;
  }

  // ── 쓰기: createExam 과 같은 순서 (exams INSERT → exam_nodes INSERT, 노드 실패 시 exams 삭제) ──
  const db = client as SupabaseClient; // apply 는 위에서 client 가 있음을 확인했다.

  // 공개 자료를 먼저 올린다 (#544). 시험 행에 URL 을 넣어야 하기 때문이다.
  // 실패하면 그때까지 올린 것(실패한 것 포함 - 응답만 잃었을 수 있다)을 지우고 시험은 만들지 않는다.
  const uploadedPaths: string[] = [];
  const releaseUploads = async (mode: "remove" | "keep"): Promise<void> => {
    if (uploadedPaths.length === 0) return;
    if (mode === "keep") {
      report.uploadCleanup = "kept";
      out(`올린 파일을 지우지 않았습니다(시험 행이 남았을 수 있습니다). ${MATERIALS_BUCKET} 버킷 경로:`);
      for (const path of uploadedPaths) out(`  - ${path}`);
      return;
    }
    try {
      const { error } = await db.storage.from(MATERIALS_BUCKET).remove(uploadedPaths);
      report.uploadCleanup = error ? "failed" : "removed";
    } catch {
      report.uploadCleanup = "failed";
    }
    if (report.uploadCleanup === "removed") {
      out(`올린 파일 ${uploadedPaths.length}개를 지웠습니다.`);
    } else {
      out(`올린 파일을 지우지 못했습니다. ${MATERIALS_BUCKET} 버킷에서 직접 지우세요:`);
      for (const path of uploadedPaths) out(`  - ${path}`);
    }
  };

  if (hasMaterials) {
    const uploadedAt = new Date(timestamp);
    for (const f of materialFiles) {
      const path = materialStoragePath(
        instructorId,
        makeMaterialObjectKey(f.fileName, { now: uploadedAt, uuid: options.uuid?.() })
      );
      uploadedPaths.push(path);
      let uploadError: unknown = null;
      try {
        ({ error: uploadError } = await db.storage
          .from(MATERIALS_BUCKET)
          .upload(path, f.bytes, { contentType: f.contentType, upsert: false }));
      } catch (e) {
        uploadError = e;
      }
      if (uploadError) {
        out(`파일 업로드에 실패했습니다: ${f.source} → ${path}: ${errText(uploadError)}`);
        out("시험 행은 만들지 않았습니다.");
        await releaseUploads("remove");
        report.status = "failed";
        report.exitCode = 1;
        return report;
      }
      const { data: urlData } = db.storage.from(MATERIALS_BUCKET).getPublicUrl(path);
      report.uploads.push({ source: f.source, path, url: urlData.publicUrl });
      out(`업로드했습니다: ${f.source} → ${path}`);
    }
    const urls = report.uploads.map((u) => u.url);
    // 시험 행의 불변식(학생 공개 ⊂ 자료, 자료 순서)을 앱과 같은 검증으로 확인한다.
    const shared = validateStudentMaterials(urls, urls);
    const rebuilt = buildRow(urls);
    if (!shared.ok || !rebuilt.ok) {
      out(`exams 행을 만들 수 없습니다: ${!shared.ok ? shared.message : !rebuilt.ok ? rebuilt.message : ""}`);
      await releaseUploads("remove");
      report.status = "failed";
      report.exitCode = 1;
      return report;
    }
    examRow = rebuilt.payload;
    report.planned = { exams: examRow, examNode: nodeRow };
  }

  let insertedId: string | null = null;
  try {
    let currentCode = code;
    let lastError: unknown = null;
    for (let attempt = 0; attempt < MAX_INSERT_ATTEMPTS; attempt++) {
      let data: unknown = null;
      let error: unknown = null;
      try {
        ({ data, error } = await db
          .from("exams")
          .insert({ ...examRow, code: currentCode })
          .select()
          .single());
      } catch (e) {
        // 요청이 던져졌다. 서버가 커밋했는지 모르는 점은 코드 없는 오류와 같다.
        error = { code: "", message: errText(e) };
      }
      if (!error) {
        insertedId = String((data as Row).id);
        code = currentCode;
        lastError = null;
        break;
      }
      // Postgres UNIQUE violation = 23505 → 코드를 다시 뽑고 재시도
      if ((error as { code?: string }).code === "23505" && attempt < MAX_INSERT_ATTEMPTS - 1) {
        currentCode = generateCode();
        out(`시험 코드 충돌(23505). 새 코드 ${currentCode} 로 다시 시도합니다.`);
        continue;
      }
      lastError = error;
      break; // 모르는 결과를 다시 INSERT 하면 같은 시험이 둘 생길 수 있다 - 재시도하지 않는다.
    }

    if (insertedId === null && !isDefiniteRejection(lastError)) {
      // PG 오류 코드가 없다. postgrest-js 는 fetch 실패를 던지지 않고 `{ code: "", message: "TypeError:
      // fetch failed" }` 로 돌려준다. 서버는 커밋했는데 응답만 잃었을 수 있으므로 "쓴 행이 없다" 고
      // 말할 수 없다. 방금 쓴 코드로 exams 를 다시 읽어 판정한다.
      out(`exams INSERT 의 결과를 알 수 없습니다 (PG 오류 코드 없음): ${errText(lastError)}`);
      out(`서버가 커밋했는지 확인하려고 코드 ${currentCode} 로 exams 를 다시 읽습니다.`);
      const verdict = await verifyInsertedExam(db, currentCode, instructorId, spec.title);

      if (verdict.state === "ours") {
        insertedId = verdict.id;
        code = currentCode;
        report.ambiguousInsert = "adopted";
        const note = `경고: exams INSERT 응답은 유실됐지만 서버에 행이 있었습니다 (id=${insertedId} code=${code}). 이 행을 이어서 씁니다.`;
        warnings.push(note);
        out(note);
      } else if (verdict.state === "unknown") {
        report.ambiguousInsert = "unknown";
        out(`다시 읽기도 실패했습니다: ${verdict.reason}`);
        out(
          `결과 불명. 수동 확인 필요: 코드 ${currentCode} 로 exams 를 조회하세요 (소유자 "${instructorId}", 제목 "${spec.title}").`
        );
        out("행이 있으면 그 id 로 exam_nodes 가 연결돼 있는지 보고, 노드가 없으면 그 행을 지운 뒤 다시 실행하세요.");
        out("확인 전에는 --allow-duplicate-title 로 다시 실행하지 마세요. 이 스크립트는 아무것도 더 쓰지 않고 끝납니다.");
        await releaseUploads("keep");
        report.status = "failed";
        report.exitCode = 1;
        return report;
      } else {
        report.ambiguousInsert = "absent";
        if (verdict.state === "foreign") {
          out(`확인됨: 코드 ${currentCode} 는 다른 시험이 쓰고 있어 이 INSERT 는 반영되지 않았습니다 (남의 행은 건드리지 않았습니다).`);
        } else {
          out(`확인됨: 재조회 시점에 코드 ${currentCode} 의 exams 행이 없습니다. 아무것도 만들어지지 않았습니다.`);
        }
        out(
          `드물게 응답 유실 직후 늦게 커밋될 수 있으니, 다시 실행하기 전에 코드 ${currentCode} 또는 같은 제목의 시험이 없는지 한 번 더 조회하세요.`
        );
        // 늦은 커밋이 생기면 그 행이 가리킬 파일이므로 지우지 않고 경로를 남긴다.
        await releaseUploads("keep");
        report.status = "failed";
        report.exitCode = 1;
        return report;
      }
    }

    if (insertedId === null) {
      out(`exams INSERT 에 실패했습니다: ${errText(lastError)}`);
      out("서버가 거부했으므로 exams 에 쓴 행이 없습니다. 보상 삭제는 필요하지 않습니다.");
      await releaseUploads("remove");
      report.status = "failed";
      report.exitCode = 1;
      return report;
    }
    out(
      report.ambiguousInsert === "adopted"
        ? `exams 행을 확인했습니다: id=${insertedId} code=${code}`
        : `exams 행을 만들었습니다: id=${insertedId} code=${code}`
    );

    const sort = await nextSortOrder(db, instructorId, parentFolderId);
    if (sort.error) throw new Error(`exam_nodes 형제 조회에 실패했습니다: ${sort.error}`);

    const { data: node, error: nodeError } = await db
      .from("exam_nodes")
      .insert({
        instructor_id: instructorId,
        parent_id: parentFolderId,
        kind: "exam",
        name: examRow.title,
        exam_id: insertedId,
        sort_order: sort.value,
      })
      .select()
      .single();
    if (nodeError) throw new Error(`exam_nodes INSERT 에 실패했습니다: ${errText(nodeError)}`);

    report.status = "applied";
    report.result = { examId: insertedId, code, nodeId: String((node as Row).id) };
    out(`exam_nodes 행을 만들었습니다: id=${report.result.nodeId} (sort_order=${sort.value})`);
    out("");
    out("완료. 시험은 draft 상태입니다. 이 스크립트는 시험 시작/종료를 하지 않습니다.");
    out(`  exams.id: ${insertedId}`);
    out(`  시험 코드: ${code}`);
    if (report.uploads.length > 0) {
      out(`  학생 공개 자료: ${report.uploads.length}개 (materials 와 student_materials 에 넣었습니다)`);
      for (const u of report.uploads) out(`    - ${u.source} → ${u.url}`);
    }
    out("  시작은 교수자 계정으로 /api/exam/{id}/start 를 호출하세요 (close_at 은 재입장 마감이기도 합니다).");
    return report;
  } catch (e) {
    out(`실패: ${errText(e)}`);
    if (insertedId === null) {
      // INSERT 단계의 예외는 위에서 모두 오류로 바꿨다. 여기 오는 것은 그 밖의 예기치 않은 예외다.
      // 서버가 INSERT 를 끝냈는지 모르므로 다시 돌리기 전에 확인시킨다.
      out(`exams 가 만들어졌는지 알 수 없습니다. 다시 실행하기 전에 소유자 "${instructorId}" 의 같은 제목 시험이 생겼는지 조회하세요.`);
      await releaseUploads("keep");
      report.status = "failed";
      report.exitCode = 1;
      return report;
    }
    // exams 는 들어갔는데 노드가 없다 - 드라이브 목록에 안 보이는 고아 행이 된다. 지운다.
    report.compensation = await compensateExam(db, insertedId);
    if (report.compensation === "deleted") {
      out(`보상 삭제: 방금 만든 exams 행(id=${insertedId})을 지웠습니다.`);
      await releaseUploads("remove");
    } else {
      out(`보상 삭제에 실패했습니다. exams 행(id=${insertedId})이 노드 없이 남아 있습니다. 수동으로 지우세요.`);
      await releaseUploads("keep");
    }
    report.status = "failed";
    report.exitCode = 1;
    return report;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// CLI
// ─────────────────────────────────────────────────────────────────────────────
export type MainDeps = {
  createClient?: typeof createSupabaseClient;
  readFile?: (path: string) => string;
  /** 공개 자료 파일을 바이트로 읽는다 (#544). */
  readBinaryFile?: (path: string) => Uint8Array;
  uuid?: () => string;
  out?: (line: string) => void;
  err?: (line: string) => void;
  now?: () => string;
  generateCode?: () => string;
};

/** 종료 코드: 0 성공(dry-run 포함), 1 실행 중 막힘/실패, 2 인자·스펙·접속 정보 오류. */
export async function main(
  argv: string[],
  env: Record<string, string | undefined> = process.env,
  deps: MainDeps = {}
): Promise<number> {
  const out = deps.out ?? ((line: string) => console.log(line));
  const err = deps.err ?? ((line: string) => console.error(line));
  const readFile = deps.readFile ?? ((path: string) => readFileSync(path, "utf8"));
  const readBinaryFile = deps.readBinaryFile ?? ((path: string) => readFileSync(path));
  const createClient = deps.createClient ?? createSupabaseClient;

  const parsed = parseArgs(argv);
  if (!parsed.ok) {
    err(`오류: ${parsed.error}`);
    err(USAGE);
    return 2;
  }
  const args = parsed.args;
  if (args.help) {
    out(USAGE);
    return 0;
  }

  let raw: unknown;
  try {
    raw = JSON.parse(readFile(args.spec));
  } catch (e) {
    err(`스펙 파일을 읽을 수 없습니다 (${args.spec}): ${errText(e)}`);
    return 2;
  }
  const validated = validateMockExamSpec(raw);
  if (!validated.ok) {
    err(`스펙이 올바르지 않습니다 (${args.spec}):`);
    for (const e of validated.errors) err(`  - ${e}`);
    return 2;
  }

  // 공개 자료 파일은 접속하기 전에 읽어 크기를 확인한다. 문제가 있으면 접속하지 않고 끝낸다.
  const loaded = loadMaterialFiles(validated.spec.student_material_files, args.spec, readBinaryFile);
  if (!loaded.ok) {
    err(`student_material_files 를 쓸 수 없습니다 (${args.spec}):`);
    for (const e of loaded.errors) err(`  - ${e}`);
    return 2;
  }

  const connection = resolveConnection(env);
  if (connection.error) {
    err(`오류: ${connection.error}`);
    return 2;
  }

  // 오류 문구에 서비스 롤 키가 섞여 나가지 않게 한다 (SDK 가 잘못된 키를 메시지에 되풀이할 수 있다).
  const redact = (text: string) =>
    connection.serviceRoleKey ? text.split(connection.serviceRoleKey).join("***") : text;

  let client: SupabaseClient | null = null;
  if (connection.url && connection.serviceRoleKey) {
    try {
      client = createClient(connection.url, connection.serviceRoleKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      });
    } catch (e) {
      // createClient 는 형식이 틀린 URL/키에서 던진다. 스택 대신 깔끔한 접속 정보 오류로 끝낸다.
      err(`오류: 접속 클라이언트를 만들 수 없습니다: ${redact(errText(e))}`);
      return 2;
    }
  }

  try {
    const report = await seedMockExam({
      client,
      spec: validated.spec,
      instructorId: args.instructorId,
      parentFolderId: args.parentFolderId,
      apply: args.apply,
      projectRef: connection.projectRef,
      confirmProjectRef: args.confirmProjectRef,
      allowDuplicateTitle: args.allowDuplicateTitle,
      materialFiles: loaded.files,
      now: deps.now,
      generateCode: deps.generateCode,
      uuid: deps.uuid,
      out,
    });
    return report.exitCode;
  } catch (e) {
    err(`예기치 않은 오류: ${redact(errText(e))}`);
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).then((code) => {
    process.exitCode = code;
  });
}
