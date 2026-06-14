/**
 * Staging 익명화 스크럽 엔진 (PII scrub)
 *
 * prod → staging 단방향 복사 시 PII/자유서술/식별자를 fail-closed 로 처리한다.
 * 이 모듈은 순수 로직만 담아 staging Supabase 없이도 단위 테스트로 완전 검증된다.
 * 실제 read/write 오케스트레이션은 scripts/copy-prod-to-staging-anonymized.ts 가 담당한다.
 *
 * 규칙:
 *  - allowlist 에 분류되지 않은 column 이 copy 대상 table 에 있으면 drift 로 간주하고 fail.
 *  - 결정적(deterministic) 가짜값: 같은 입력 → 같은 출력(참조 무결성 유지).
 *  - raw 와 compressed mirror 컬럼은 둘 다 동일 규칙으로 처리(한쪽만 지우면 PII 잔존).
 *  - 미분류 JSON key 는 보수적으로 redact.
 */
import { createHash } from "node:crypto";

export type ColumnRule =
  | "keep" // 안전한 기술/구조 값 (점수, 상태, 카운트 등)
  | "null" // 제거 (디바이스 핑거프린트, 외부 response id 등)
  | "redact" // 자유서술 텍스트 → 고정 placeholder
  | "fake-email"
  | "fake-name"
  | "fake-student-number"
  | "fake-school"
  | "fake-code" // 시험 입장 코드 재생성
  | "id-map" // 실제 id → 결정적 가짜 id
  | "json-scrub"; // JSON 내부를 deep scrub

const REDACTED = "[redacted]";

/** 결정적 해시 (앞 12 hex) */
function detHash(seed: string): string {
  return createHash("sha256").update(String(seed)).digest("hex").slice(0, 12);
}

export function fakeEmail(seed: string): string {
  return `user_${detHash(seed)}@staging.invalid`;
}

const FAKE_SURNAMES = ["김", "이", "박", "최", "정", "강", "조", "윤", "장", "임"];
const FAKE_GIVEN = ["민준", "서연", "도윤", "지우", "하준", "서윤", "은우", "지호", "수아", "예준"];
export function fakeName(seed: string): string {
  const h = detHash(seed);
  const s = parseInt(h.slice(0, 4), 16) % FAKE_SURNAMES.length;
  const g = parseInt(h.slice(4, 8), 16) % FAKE_GIVEN.length;
  return `${FAKE_SURNAMES[s]}${FAKE_GIVEN[g]}`;
}

export function fakeStudentNumber(seed: string): string {
  const h = detHash(seed);
  // 10자리 숫자 형태 유지
  return (parseInt(h, 16).toString().padStart(10, "0")).slice(0, 10);
}

export function fakeSchool(seed: string): string {
  const n = parseInt(detHash(seed).slice(0, 4), 16) % 5;
  return `Staging University ${n + 1}`;
}

export function fakeCode(seed: string): string {
  return detHash(seed).slice(0, 6).toUpperCase();
}

/** 실제 id → 결정적 가짜 id (참조 무결성 유지) */
export function mapId(realId: string, prefix = "id"): string {
  if (!realId) return realId;
  return `${prefix}_${detHash(realId)}`;
}

/** JSON 값 deep scrub — 알려진 PII key 는 redact, 그 외 객체/배열은 재귀, 원시값은 보존 */
const PII_JSON_KEYS = new Set([
  "email",
  "name",
  "full_name",
  "fullname",
  "student_number",
  "studentnumber",
  "school",
  "phone",
  "content",
  "answer",
  "text",
  "prompt",
  "output",
  "comment",
  "message",
  "rationale",
  "avatar_url",
  "file_url",
  "url",
  "response_id",
]);

export function scrubJsonDeep(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map((v) => scrubJsonDeep(v));
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (PII_JSON_KEYS.has(k.toLowerCase())) {
        out[k] = typeof v === "string" ? REDACTED : v === null ? null : REDACTED;
      } else {
        out[k] = scrubJsonDeep(v);
      }
    }
    return out;
  }
  // 원시값(number/boolean/string) — 구조적으로 안전하다고 보고 보존
  return value;
}

/** 단일 컬럼 값에 규칙 적용 */
export function scrubValue(rule: ColumnRule, value: unknown, seed: string): unknown {
  switch (rule) {
    case "keep":
      return value;
    case "null":
      return null;
    case "redact":
      return value == null ? value : REDACTED;
    case "fake-email":
      return value == null ? value : fakeEmail(seed);
    case "fake-name":
      return value == null ? value : fakeName(seed);
    case "fake-student-number":
      return value == null ? value : fakeStudentNumber(seed);
    case "fake-school":
      return value == null ? value : fakeSchool(seed);
    case "fake-code":
      return value == null ? value : fakeCode(seed);
    case "id-map":
      return value == null ? value : mapId(String(value));
    case "json-scrub":
      return value == null ? value : scrubJsonDeep(value);
    default: {
      // 분류 안 된 규칙은 안전하게 redact
      return value == null ? value : REDACTED;
    }
  }
}

/**
 * copy 대상 table 의 모든 column 이 allowlist 에 분류되어 있는지 강제(fail-close).
 * 미분류 column 이 하나라도 있으면 그 목록과 함께 throw.
 */
export function assertAllColumnsClassified(
  table: string,
  actualColumns: string[],
  allowlist: Record<string, ColumnRule>
): void {
  const unclassified = actualColumns.filter((c) => !(c in allowlist));
  if (unclassified.length > 0) {
    throw new Error(
      `[scrub] table "${table}" 에 미분류 column 이 있습니다: ${unclassified.join(", ")}. ` +
        `allowlist 갱신 전까지 copy 를 중단합니다(PII 누출 방지).`
    );
  }
}

/** table 한 행을 allowlist 규칙으로 스크럽 */
export function scrubRow(
  table: string,
  row: Record<string, unknown>,
  allowlist: Record<string, ColumnRule>,
  rowSeed: string
): Record<string, unknown> {
  assertAllColumnsClassified(table, Object.keys(row), allowlist);
  const out: Record<string, unknown> = {};
  for (const [col, val] of Object.entries(row)) {
    out[col] = scrubValue(allowlist[col], val, `${table}:${col}:${rowSeed}`);
  }
  return out;
}

/** write 전/후 PII 누출 스캔 — 발견 시 패턴 목록 반환(비어있으면 통과) */
const PII_PATTERNS: { name: string; re: RegExp }[] = [
  { name: "email", re: /[A-Za-z0-9._%+-]+@(?!staging\.invalid)[A-Za-z0-9.-]+\.[A-Za-z]{2,}/ },
  { name: "korean-phone", re: /01[016789]-?\d{3,4}-?\d{4}/ },
  { name: "prod-ref", re: /fmhpwotcfshoqpdhzqqj/ },
  { name: "supabase-service-jwt", re: /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/ },
  { name: "file-url", re: /https?:\/\/[^\s"']+\.(pdf|docx?|pptx?|xlsx?|png|jpe?g)/i },
];

export function findPiiLeaks(sample: string): string[] {
  const hits: string[] = [];
  for (const { name, re } of PII_PATTERNS) {
    if (re.test(sample)) hits.push(name);
  }
  return hits;
}

/**
 * Quest-On PII scrub allowlist (table.column → rule).
 * scripts/copy-prod-to-staging-anonymized.ts 의 단일 진실 소스.
 * raw/compressed mirror 쌍은 둘 다 등록한다.
 */
export const SCRUB_ALLOWLIST: Record<string, Record<string, ColumnRule>> = {
  student_profiles: {
    id: "id-map",
    student_id: "id-map",
    name: "fake-name",
    student_number: "fake-student-number",
    school: "fake-school",
    created_at: "keep",
    updated_at: "keep",
  },
  sessions: {
    id: "id-map",
    exam_id: "id-map",
    student_id: "id-map",
    used_clarifications: "keep",
    created_at: "keep",
    submitted_at: "keep",
    compressed_session_data: "null",
    compression_metadata: "json-scrub",
    ai_summary: "json-scrub",
    grading_progress: "json-scrub",
    status: "keep",
    started_at: "keep",
    attempt_timer_started_at: "keep",
    auto_submitted: "keep",
    preflight_accepted_at: "keep",
    late_entry_approved_at: "keep",
    late_entry_denied_at: "keep",
    is_active: "keep",
    last_heartbeat_at: "keep",
    device_fingerprint: "null",
    final_answer: "redact",
    final_answer_updated_at: "keep",
  },
  submissions: {
    id: "id-map",
    session_id: "id-map",
    q_idx: "keep",
    answer: "redact",
    created_at: "keep",
    updated_at: "keep",
    answer_history: "json-scrub",
    edit_count: "keep",
    compressed_answer_data: "null",
    compression_metadata: "json-scrub",
    workspace_state: "json-scrub",
  },
  messages: {
    id: "id-map",
    session_id: "id-map",
    q_idx: "keep",
    role: "keep",
    content: "redact",
    created_at: "keep",
    compressed_content: "null",
    compression_metadata: "json-scrub",
    response_id: "null",
    message_type: "keep",
    tokens_used: "keep",
    metadata: "json-scrub",
  },
  grading_chats: {
    id: "id-map",
    session_id: "id-map",
    q_idx: "keep",
    role: "keep",
    content: "redact",
    created_by: "id-map",
    created_at: "keep",
    client_message_id: "id-map",
  },
  grades: {
    id: "id-map",
    session_id: "id-map",
    q_idx: "keep",
    score: "keep",
    comment: "redact",
    created_at: "keep",
    stage_grading: "json-scrub",
    grade_type: "keep",
    ai_summary: "json-scrub",
  },
  ai_events: {
    id: "id-map",
    provider: "keep",
    endpoint: "keep",
    feature: "keep",
    route: "keep",
    model: "keep",
    user_id: "id-map",
    exam_id: "id-map",
    session_id: "id-map",
    q_idx: "keep",
    status: "keep",
    attempt_count: "keep",
    latency_ms: "keep",
    input_tokens: "keep",
    output_tokens: "keep",
    cached_input_tokens: "keep",
    reasoning_tokens: "keep",
    total_tokens: "keep",
    estimated_cost_usd_micros: "keep",
    pricing_version: "keep",
    request_id: "null",
    response_id: "null",
    error_code: "keep",
    metadata: "json-scrub",
    created_at: "keep",
  },
};
