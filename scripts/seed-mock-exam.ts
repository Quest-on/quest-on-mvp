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
 * 기본은 dry-run 이다. 쓰기에는 `--apply` 와 접속한 프로젝트 ref 와 일치하는
 * `--confirm-project-ref` 가 둘 다 필요하다. **운영 DB 실행은 별도 명시 승인이 있어야 한다.**
 * 스테이징 리허설을 먼저 한다.
 *
 * 이 스크립트가 하지 않는 것: 시험 시작/종료, 첫 발행 기록, 학생 수 집계 - 입장 RPC 와 시작
 * 라우트의 몫이다. 만든 시험은 draft 로 끝난다.
 */

import { readFileSync } from "fs";
import { pathToFileURL } from "url";
import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  buildExamInsertPayload,
  generateExamCode,
  type ExamRubricItem,
} from "../lib/exam-insert-payload";

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
};

const SPEC_KEYS = ["title", "questions", "rubric", "rubric_public", "language"];
const QUESTION_KEYS = ["id", "text", "type", "ai_role"];
const RUBRIC_KEYS = ["evaluationArea", "detailedCriteria"];
/** createExamSchema 의 title 상한과 같다. */
const MAX_TITLE_LENGTH = 500;

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const isNonEmptyString = (v: unknown): v is string => typeof v === "string" && v.trim() !== "";

const RUBRIC_SHAPE = '[{"evaluationArea": "...", "detailedCriteria": "..."}]';

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

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, spec: { title, questions, rubric, rubric_public: rubricPublic, language } };
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
  --spec <경로>                  스펙 JSON (title, questions, rubric, rubric_public, language; 문항의 ai_role 은 선택)
  --instructor-id <id>           시험 소유자(profiles.id = exams.instructor_id)

옵션:
  --parent-folder-id <uuid>      드라이브에서 시험을 둘 폴더(exam_nodes.id). 없으면 루트
  --apply                        실제로 씁니다. --confirm-project-ref 도 함께 필요합니다
  --confirm-project-ref <ref>    접속한 Supabase 프로젝트 ref. 환경변수의 URL 에서 읽은 값과 정확히 같아야 합니다
  --allow-duplicate-title        같은 소유자에게 같은 제목의 시험이 이미 있어도 진행합니다
  --help                         이 도움말

환경변수 (파일에서 읽지 않습니다):
  SUPABASE_URL                   (없으면 NEXT_PUBLIC_SUPABASE_URL)
  SUPABASE_SERVICE_ROLE_KEY

접속 정보가 없으면 dry-run 은 스펙 검증과 만들 행 미리보기만 하고 읽기 점검을 건너뜁니다.
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

/**
 * 접속 URL 에서 프로젝트 ref 를 뽑는다. `https://<ref>.supabase.co` 의 첫 라벨이다.
 * 그 밖의 호스트(로컬 스택 등)는 호스트 이름 전체를 ref 로 본다.
 */
export function deriveProjectRef(url: string | null | undefined): string | null {
  if (!url) return null;
  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    return null;
  }
  if (!host) return null;
  if (host.endsWith(".supabase.co")) return host.split(".")[0] || null;
  return host;
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
    return { ...empty, error: "SUPABASE_URL 에서 프로젝트 ref 를 읽을 수 없습니다. URL 형식을 확인하세요." };
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
  now?: () => string;
  generateCode?: () => string;
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
  };

  const block = (): SeedReport => {
    out("");
    out("중단 사유:");
    for (const b of blockers) out(`  - ${b}`);
    out("아무것도 쓰지 않았습니다.");
    report.status = "blocked";
    report.exitCode = 1;
    return report;
  };

  out(apply ? "모의시험 시드 - --apply (DB 에 씁니다)" : "모의시험 시드 - dry-run (DB 에 쓰지 않습니다)");
  out(`접속 프로젝트 - project ref: ${projectRef ?? "(접속 정보 없음)"}`);
  out(`소유자(instructor_id): ${instructorId}`);

  // ── 프로젝트 ref 확인: DB 를 읽기 전에 닫는다 ───────────────────────────────
  if (apply) {
    if (!client || !projectRef) {
      blockers.push("--apply 에는 접속 정보(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY 환경변수)가 필요합니다.");
    }
    if (confirmProjectRef === null) {
      blockers.push(
        `--apply 에는 --confirm-project-ref <ref> 가 필요합니다. 접속한 프로젝트 ref 는 "${projectRef ?? "알 수 없음"}" 입니다. 의도한 프로젝트인지 확인한 뒤 그 값을 직접 입력하세요.`
      );
    }
  }
  if (confirmProjectRef !== null && projectRef !== null && confirmProjectRef !== projectRef) {
    blockers.push(
      `--confirm-project-ref 가 접속한 프로젝트와 다릅니다: 접속 ref="${projectRef}", 확인 ref="${confirmProjectRef}". 환경변수가 의도한 프로젝트를 가리키는지 확인하세요.`
    );
  }
  if (blockers.length > 0) return block();

  // ── 읽기 전용 사전 점검 ──────────────────────────────────────────────────────
  let sortOrder: number | null = null;
  let code = generateCode();

  if (!client) {
    out("");
    out("접속 정보가 없어 읽기 전용 사전 점검을 건너뜁니다 (스펙 검증과 만들 행 미리보기만 합니다).");
    out("코드 중복 확인과 sort_order 계산은 접속한 뒤에야 가능합니다.");
  } else {
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
          `경고: profiles.plan 이 "${String(profile.plan)}" 입니다. verified 가 아니면 시험당 학생 5명까지만 입장할 수 있어 53명 입장이 불가합니다 (STUDENT_LIMIT_REACHED). plan 을 verified 로 올린 뒤 진행하세요.`
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
          `이 소유자에게 같은 제목의 시험이 이미 있습니다 (${list}). apply 를 두 번 돌린 것이 아닌지 확인하세요. 의도한 것이면 --allow-duplicate-title 을 쓰세요.`
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

  // ── 만들 행 ────────────────────────────────────────────────────────────────
  const timestamp = now();
  const built = buildExamInsertPayload({
    title: spec.title,
    code,
    duration: 0,
    questions: spec.questions,
    materials: [],
    materials_text: [],
    chat_weight: null,
    status: "draft",
    instructor_id: instructorId,
    created_at: timestamp,
    updated_at: timestamp,
    rubric: spec.rubric,
    rubric_public: spec.rubric_public,
    language: spec.language,
  });
  if (!built.ok) {
    blockers.push(`exams 행을 만들 수 없습니다: ${built.message}`);
    return block();
  }
  const examRow = built.payload;
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
    out("쓰려면 --apply --confirm-project-ref <접속한 프로젝트 ref> 를 함께 주세요.");
    return report;
  }

  // ── 쓰기: createExam 과 같은 순서 (exams INSERT → exam_nodes INSERT, 노드 실패 시 exams 삭제) ──
  const db = client as SupabaseClient; // apply 는 위에서 client 가 있음을 확인했다.
  let insertedId: string | null = null;
  try {
    let currentCode = code;
    let lastError: unknown = null;
    for (let attempt = 0; attempt < MAX_INSERT_ATTEMPTS; attempt++) {
      const { data, error } = await db
        .from("exams")
        .insert({ ...examRow, code: currentCode })
        .select()
        .single();
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
      break;
    }
    if (insertedId === null) {
      out(`exams INSERT 에 실패했습니다: ${errText(lastError)}`);
      out("exams 에 쓴 행이 없으므로 보상 삭제는 필요하지 않습니다.");
      report.status = "failed";
      report.exitCode = 1;
      return report;
    }
    out(`exams 행을 만들었습니다: id=${insertedId} code=${code}`);

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
    out("  시작은 교수자 계정으로 /api/exam/{id}/start 를 호출하세요 (close_at 은 재입장 마감이기도 합니다).");
    return report;
  } catch (e) {
    out(`실패: ${errText(e)}`);
    if (insertedId === null) {
      // 요청이 던져졌다면 서버가 INSERT 를 끝냈는지 알 수 없다. 다시 돌리기 전에 확인시킨다.
      out(`exams INSERT 응답을 받지 못했습니다. 다시 실행하기 전에 소유자 "${instructorId}" 의 같은 제목 시험이 생겼는지 확인하세요.`);
      report.status = "failed";
      report.exitCode = 1;
      return report;
    }
    // exams 는 들어갔는데 노드가 없다 - 드라이브 목록에 안 보이는 고아 행이 된다. 지운다.
    report.compensation = await compensateExam(db, insertedId);
    if (report.compensation === "deleted") {
      out(`보상 삭제: 방금 만든 exams 행(id=${insertedId})을 지웠습니다.`);
    } else {
      out(`보상 삭제에 실패했습니다. exams 행(id=${insertedId})이 노드 없이 남아 있습니다. 수동으로 지우세요.`);
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

  const connection = resolveConnection(env);
  if (connection.error) {
    err(`오류: ${connection.error}`);
    return 2;
  }

  const client =
    connection.url && connection.serviceRoleKey
      ? createClient(connection.url, connection.serviceRoleKey, {
          auth: { autoRefreshToken: false, persistSession: false },
        })
      : null;

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
      now: deps.now,
      generateCode: deps.generateCode,
      out,
    });
    return report.exitCode;
  } catch (e) {
    err(`예기치 않은 오류: ${errText(e)}`);
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).then((code) => {
    process.exitCode = code;
  });
}
