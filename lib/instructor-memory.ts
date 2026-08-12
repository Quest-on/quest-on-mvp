/**
 * 교수 메모리 화면의 HTTP 계약.
 *
 * 이 모듈만이 메모리 API 세 개를 호출한다. 컴포넌트는 엔드포인트 문자열을 직접 쓰지 않는다.
 * 일시중지(pause)와 초기화(reset)가 서로 다른 요청이라는 사실을 여기서 잠근다 —
 * 두 동작이 같은 호출로 붕괴하면 교수는 자기 데이터가 남아 있는지 알 수 없게 된다.
 *
 * 응답 정규화는 이 경계에서만 한다. 서버가 준 값이 계약을 벗어나면(예: input_origin 이 null)
 * 조용히 그럴듯한 기본값으로 바꾸지 않고 `null` 로 남긴다. 화면이 "출처 불명" 으로 표시하게 만드는 것이
 * 목적이다. 모르는 것을 "직접 입력" 으로 보여 주는 쪽이 훨씬 위험하다.
 */

export const MEMORY_LIST_ENDPOINT = "/api/instructor/memory";
export const MEMORY_SETTINGS_ENDPOINT = "/api/instructor/memory/settings";

export function memoryRecordEndpoint(memoryId: string): string {
  return `${MEMORY_LIST_ENDPOINT}/${encodeURIComponent(memoryId)}`;
}

/** database/030_instructor_memory.sql 의 input_origin CHECK 와 같은 어휘. */
export const MEMORY_INPUT_ORIGINS = [
  "typed",
  "quick_reply",
  "pasted",
  "imported",
  "derived",
] as const;
export type MemoryInputOrigin = (typeof MEMORY_INPUT_ORIGINS)[number];

export const MEMORY_EVIDENCE_SOURCES = [
  "bulk_grading_messages",
  "grading_chats",
  "derived_criteria",
] as const;
export type MemoryEvidenceSource = (typeof MEMORY_EVIDENCE_SOURCES)[number];

export const MEMORY_SCOPES = ["global", "course", "exam"] as const;
export type MemoryScope = (typeof MEMORY_SCOPES)[number];

export const MEMORY_STATUSES = ["active", "archived", "quarantined"] as const;
export type MemoryStatus = (typeof MEMORY_STATUSES)[number];

/** 화면이 소비하는 한 건. null 은 "서버가 주지 않았다" 는 뜻이며 추측으로 채우지 않는다. */
export interface InstructorMemoryRecord {
  id: string;
  value: unknown;
  predicate: string;
  scope: MemoryScope | null;
  scopeId: string | null;
  status: MemoryStatus | null;
  source: {
    table: MemoryEvidenceSource | null;
    messageId: string | null;
    occurredAt: string | null;
    inputOrigin: MemoryInputOrigin | null;
  };
  extractorVersion: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export type MemorySettingsAction = "pause" | "resume" | "reset";

export interface MemorySettingsResult {
  action: MemorySettingsAction;
  status: string;
  affectedCount: number;
  /** false 면 보관 처리가 일어났다는 뜻이다(reset). */
  retained: boolean;
}

export interface MemoryArchiveResult {
  memoryId: string;
  status: string;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function asMember<T extends string>(
  value: unknown,
  allowed: readonly T[],
): T | null {
  return typeof value === "string" && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : null;
}

/** 알 수 없는 JSON 한 건을 레코드로 정규화한다. id 가 없으면 화면에 올릴 수 없으므로 버린다. */
export function normalizeMemoryRecord(raw: unknown): InstructorMemoryRecord | null {
  const row = asRecord(raw);
  if (!row) return null;

  const id = asString(row.id);
  if (!id) return null;

  const source = asRecord(row.source) ?? {};

  return {
    id,
    value: row.value,
    predicate: asString(row.predicate) ?? "",
    scope: asMember(row.scope, MEMORY_SCOPES),
    scopeId: asString(row.scopeId),
    status: asMember(row.status, MEMORY_STATUSES),
    source: {
      table: asMember(source.table, MEMORY_EVIDENCE_SOURCES),
      messageId: asString(source.messageId),
      occurredAt: asString(source.occurredAt),
      inputOrigin: asMember(source.inputOrigin, MEMORY_INPUT_ORIGINS),
    },
    extractorVersion: asString(row.extractorVersion),
    createdAt: asString(row.createdAt),
    updatedAt: asString(row.updatedAt),
  };
}

async function readError(response: Response): Promise<never> {
  const body = await response.json().catch(() => null);
  const message = asString(asRecord(body)?.message) ?? response.statusText;
  const error = new Error(`${response.status} ${message}`) as Error & { status?: number };
  error.status = response.status;
  throw error;
}

/** GET /api/instructor/memory */
export async function fetchInstructorMemories(): Promise<InstructorMemoryRecord[]> {
  const response = await fetch(MEMORY_LIST_ENDPOINT, {
    headers: { Accept: "application/json" },
  });
  if (!response.ok) await readError(response);

  const body = asRecord(await response.json().catch(() => null));
  const rows = Array.isArray(body?.memories) ? body.memories : [];
  return rows
    .map(normalizeMemoryRecord)
    .filter((record): record is InstructorMemoryRecord => record !== null);
}

/** DELETE /api/instructor/memory/[memoryId] — 서버에서는 보관(archive) 이다. */
export async function archiveInstructorMemory(
  memoryId: string,
): Promise<MemoryArchiveResult> {
  const response = await fetch(memoryRecordEndpoint(memoryId), { method: "DELETE" });
  if (!response.ok) await readError(response);

  const body = asRecord(await response.json().catch(() => null));
  return {
    memoryId: asString(body?.memoryId) ?? memoryId,
    status: asString(body?.status) ?? "archived",
  };
}

/**
 * PATCH /api/instructor/memory/settings
 *
 * pause / resume / reset 은 같은 엔드포인트를 쓰지만 본문이 다르다. 호출자가 action 을
 * 넘기지 않고 토글 하나로 합치는 일을 막기 위해 payload 빌더를 밖으로 노출한다.
 */
export function memorySettingsPayload(action: MemorySettingsAction): { action: MemorySettingsAction } {
  return { action };
}

export async function updateMemorySettings(
  action: MemorySettingsAction,
): Promise<MemorySettingsResult> {
  const response = await fetch(MEMORY_SETTINGS_ENDPOINT, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(memorySettingsPayload(action)),
  });
  if (!response.ok) await readError(response);

  const body = asRecord(await response.json().catch(() => null));
  return {
    action,
    status: asString(body?.status) ?? "",
    affectedCount: typeof body?.affectedCount === "number" ? body.affectedCount : 0,
    retained: body?.retained !== false,
  };
}
