import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildAiTextMetadata,
  callTrackedChatCompletion,
} from "@/lib/ai-tracking";
import { getOpenAI, AI_MODEL } from "@/lib/openai";
import { readMemoryFlags } from "@/lib/preferences/flags";
import { buildMemoryExtractionSystemPrompt } from "@/lib/prompts";
import {
  candidateRecordSchema,
  PREDICATE_SET,
  PREDICATE_TABLE,
  type CandidateRecord,
  type Predicate,
} from "@/lib/preferences/vocabulary";

export const MEMORY_EXTRACTOR_VERSION = "memory-extractor/1";
export const MAX_EXTRACTION_CANDIDATES = 100;
export const MAX_EXTRACTION_RESPONSE_CHARS = 1_000_000;

export const MEMORY_SOURCE_TABLES = [
  "bulk_grading_messages",
  "grading_chats",
] as const;

export type MemorySourceTable = (typeof MEMORY_SOURCE_TABLES)[number];

export interface MemoryExtractionJobPayload {
  sourceTable: MemorySourceTable;
  sourceRefId: string;
  idempotencyKey?: string;
  retryAttempt?: number;
}

export interface MemorySourceMessage {
  sourceTable: MemorySourceTable;
  id: string;
  role: string;
  content: string;
  inputOrigin: string | null;
  createdBy: string | null;
  createdAt: string;
}

export interface ActiveMemorySnapshot {
  id: string;
  instructor_id: string;
  scope: "global" | "course" | "exam";
  scope_id: string | null;
  predicate: Predicate;
  value: unknown;
  canonical_text: string;
  source_event_at: string;
  version: number;
  status: "active";
}

export type CandidateRejectionReason =
  | "candidate_not_object"
  | "unknown_predicate"
  | "invalid_candidate"
  | "sensitive_category"
  | "source_table_not_allowed"
  | "source_role_not_user"
  | "source_not_typed"
  | "evidence_source_mismatch"
  | "evidence_ref_mismatch"
  | "span_not_integer"
  | "span_out_of_bounds"
  | "evidence_span_mismatch"
  | "score_requires_explicit"
  | "score_requires_asserted";

export type CandidateVerification =
  | {
      accepted: true;
      candidate: CandidateRecord;
      normalizedQuote: string;
    }
  | {
      accepted: false;
      reason: CandidateRejectionReason;
    };

export type CandidateVerdict = {
  index: number;
  predicate: string | null;
  verdict: "PROMOTED" | "REJECTED" | "REQUEUED" | "DUPLICATE";
  reason: string;
  memoryId?: string;
};

export interface MemoryExtractionJobResult {
  ok: boolean;
  reason:
    | "processed"
    | "extraction_disabled"
    | "source_not_eligible"
    | "malformed_llm_json"
    | "invalid_llm_shape"
    | "too_many_candidates"
    | "response_too_large";
  verdicts: CandidateVerdict[];
  promoted: number;
  rejected: number;
  requeued: boolean;
}

export interface MemoryExtractionDependencies {
  getClient: () => SupabaseClient;
  extractCandidates: (source: Readonly<MemorySourceMessage>) => Promise<string>;
  requeue: (payload: MemoryExtractionJobPayload) => Promise<void>;
}

type SourceRow = {
  id: unknown;
  role: unknown;
  content: unknown;
  input_origin: unknown;
  created_by: unknown;
  created_at: unknown;
};

type StoredMemoryRow = {
  id: string;
  status: string;
};

const ACTIVE_MEMORY_COLUMNS =
  "id,instructor_id,scope,scope_id,predicate,value,canonical_text,source_event_at,version,status";

const SENSITIVE_TEXT_PATTERN =
  /(?:건강|질병|병력|정신\s*건강|우울증|정치|정당|투표|종교|기독교|불교|이슬람|장애|노조|노동조합|특정\s*학생|학생의\s*(?:성별|인종|국적|출신|장애|질병)|\bhealth\b|\bmedical\b|\bpolitic(?:s|al)?\b|\breligio(?:n|us)\b|\bdisab(?:ility|led)\b|\b(?:labor|trade)\s+union\b|\bspecific\s+student\b)/iu;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function rawPredicate(rawCandidate: unknown): string | null {
  if (!isRecord(rawCandidate)) return null;
  return typeof rawCandidate.predicate === "string"
    ? rawCandidate.predicate
    : null;
}

function hasDeclaredSensitiveCategory(rawCandidate: Record<string, unknown>): boolean {
  const declared =
    rawCandidate.sensitiveCategories ??
    rawCandidate.sensitive_categories ??
    rawCandidate.sensitiveCategory;

  if (Array.isArray(declared)) return declared.length > 0;
  return typeof declared === "string" && declared.trim().length > 0;
}

function carriesSensitiveCategory(
  rawCandidate: Record<string, unknown>,
  candidate: CandidateRecord,
): boolean {
  if (hasDeclaredSensitiveCategory(rawCandidate)) return true;

  return SENSITIVE_TEXT_PATTERN.test(
    JSON.stringify({
      value: candidate.value,
      valueText: candidate.valueText,
      quote: candidate.evidence.quote,
    }),
  );
}

function normalizedCharacters(value: string): string[] {
  return Array.from(value.normalize("NFC"));
}

function normalizedTextAtSpan(
  sourceText: string,
  span: readonly [number, number],
): { ok: true; text: string } | { ok: false; reason: "span_out_of_bounds" } {
  const characters = normalizedCharacters(sourceText);
  const [start, end] = span;
  if (start < 0 || end > characters.length || start >= end) {
    return { ok: false, reason: "span_out_of_bounds" };
  }
  return { ok: true, text: characters.slice(start, end).join("") };
}

/**
 * Deterministic security boundary between an extractor proposal and storage.
 * The source is sliced at the proposed span; searching the message for the
 * quote is deliberately never used.
 */
export function verifyMemoryCandidate(
  rawCandidate: unknown,
  source: MemorySourceMessage,
): CandidateVerification {
  if (!isRecord(rawCandidate)) {
    return { accepted: false, reason: "candidate_not_object" };
  }

  if (typeof rawCandidate.predicate !== "string") {
    return { accepted: false, reason: "unknown_predicate" };
  }
  if (!PREDICATE_SET.has(rawCandidate.predicate as Predicate)) {
    return { accepted: false, reason: "unknown_predicate" };
  }

  const parsed = candidateRecordSchema.safeParse(rawCandidate);
  if (!parsed.success) {
    return { accepted: false, reason: "invalid_candidate" };
  }
  const candidate = parsed.data;

  if (!MEMORY_SOURCE_TABLES.includes(source.sourceTable)) {
    return { accepted: false, reason: "source_table_not_allowed" };
  }
  if (source.role !== "user") {
    return { accepted: false, reason: "source_role_not_user" };
  }
  if (source.inputOrigin !== "typed") {
    return { accepted: false, reason: "source_not_typed" };
  }
  if (candidate.evidence.sourceTable !== source.sourceTable) {
    return { accepted: false, reason: "evidence_source_mismatch" };
  }
  if (candidate.evidence.refId !== source.id) {
    return { accepted: false, reason: "evidence_ref_mismatch" };
  }

  const [start, end] = candidate.evidence.span;
  if (!Number.isInteger(start) || !Number.isInteger(end)) {
    return { accepted: false, reason: "span_not_integer" };
  }

  const sourceAtSpan = normalizedTextAtSpan(source.content, [start, end]);
  if (!sourceAtSpan.ok) {
    return { accepted: false, reason: sourceAtSpan.reason };
  }

  // NFC is the only normalization here. In particular, whitespace remains
  // byte-for-byte meaningful after normalization and cannot be collapsed.
  const normalizedQuote = candidate.evidence.quote.normalize("NFC");
  if (sourceAtSpan.text !== normalizedQuote) {
    return { accepted: false, reason: "evidence_span_mismatch" };
  }

  const metadata = PREDICATE_TABLE[candidate.predicate];
  if (metadata.affectsScore && !candidate.isExplicit) {
    return { accepted: false, reason: "score_requires_explicit" };
  }
  if (metadata.affectsScore && candidate.commitment !== "asserted") {
    return { accepted: false, reason: "score_requires_asserted" };
  }
  if (carriesSensitiveCategory(rawCandidate, candidate)) {
    return { accepted: false, reason: "sensitive_category" };
  }

  return { accepted: true, candidate, normalizedQuote };
}

export type ParsedExtractionResponse =
  | { ok: true; candidates: unknown[] }
  | {
      ok: false;
      reason:
        | "malformed_llm_json"
        | "invalid_llm_shape"
        | "too_many_candidates"
        | "response_too_large";
    };

export function parseMemoryExtractionResponse(
  rawResponse: string,
): ParsedExtractionResponse {
  if (rawResponse.length > MAX_EXTRACTION_RESPONSE_CHARS) {
    return { ok: false, reason: "response_too_large" };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawResponse);
  } catch {
    return { ok: false, reason: "malformed_llm_json" };
  }

  if (!Array.isArray(parsed)) {
    return { ok: false, reason: "invalid_llm_shape" };
  }
  if (parsed.length > MAX_EXTRACTION_CANDIDATES) {
    return { ok: false, reason: "too_many_candidates" };
  }

  return { ok: true, candidates: parsed };
}

export async function callMemoryExtractor(
  source: Readonly<MemorySourceMessage>,
): Promise<string> {
  const systemPrompt = buildMemoryExtractionSystemPrompt();
  const userPrompt = JSON.stringify({
    sourceTable: source.sourceTable,
    refId: source.id,
    transcript: source.content.normalize("NFC"),
  });

  const tracked = await callTrackedChatCompletion(
    () =>
      getOpenAI().chat.completions.create({
        model: AI_MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        max_completion_tokens: 3000,
        temperature: 0,
      }),
    {
      feature: "memory_extraction",
      route: "/api/internal/memory-extraction-worker",
      model: AI_MODEL,
      userId: source.createdBy,
      metadata: buildAiTextMetadata({
        inputText: [systemPrompt, userPrompt],
        extra: {
          source_table: source.sourceTable,
          source_ref_id: source.id,
          extractor_version: MEMORY_EXTRACTOR_VERSION,
        },
      }),
    },
    {
      metadataBuilder: (result) =>
        buildAiTextMetadata({
          outputText:
            (
              result as {
                choices?: Array<{ message?: { content?: string | null } }>;
              }
            ).choices?.[0]?.message?.content ?? null,
        }),
    },
  );

  return tracked.data.choices[0]?.message?.content?.trim() ?? "";
}

async function loadEligibleSource(
  client: SupabaseClient,
  payload: MemoryExtractionJobPayload,
): Promise<MemorySourceMessage | null> {
  const { data, error } = await client
    .from(payload.sourceTable)
    .select("id,role,content,input_origin,created_by,created_at")
    .eq("id", payload.sourceRefId)
    .eq("role", "user")
    .eq("input_origin", "typed")
    .maybeSingle();

  if (error) {
    throw new Error(`memory extraction source read failed: ${error.message}`);
  }
  if (!data) return null;

  const row = data as SourceRow;
  if (
    row.id !== payload.sourceRefId ||
    row.role !== "user" ||
    row.input_origin !== "typed" ||
    typeof row.content !== "string" ||
    typeof row.created_by !== "string" ||
    row.created_by.length === 0 ||
    typeof row.created_at !== "string" ||
    !Number.isFinite(Date.parse(row.created_at))
  ) {
    return null;
  }

  return Object.freeze({
    sourceTable: payload.sourceTable,
    id: row.id,
    role: row.role,
    content: row.content,
    inputOrigin: row.input_origin,
    createdBy: row.created_by,
    createdAt: row.created_at,
  });
}

function toActiveMemorySnapshot(row: Record<string, unknown>): ActiveMemorySnapshot {
  if (
    typeof row.id !== "string" ||
    typeof row.instructor_id !== "string" ||
    (row.scope !== "global" && row.scope !== "course" && row.scope !== "exam") ||
    (row.scope_id !== null && typeof row.scope_id !== "string") ||
    typeof row.predicate !== "string" ||
    !PREDICATE_SET.has(row.predicate as Predicate) ||
    typeof row.canonical_text !== "string" ||
    typeof row.source_event_at !== "string" ||
    !Number.isFinite(Date.parse(row.source_event_at)) ||
    !Number.isInteger(row.version) ||
    row.status !== "active"
  ) {
    throw new Error("memory extraction found an invalid active memory row");
  }

  return {
    id: row.id,
    instructor_id: row.instructor_id,
    scope: row.scope,
    scope_id: row.scope_id,
    predicate: row.predicate as Predicate,
    value: row.value,
    canonical_text: row.canonical_text,
    source_event_at: row.source_event_at,
    version: row.version as number,
    status: "active",
  };
}

async function loadActiveMemorySnapshots(
  client: SupabaseClient,
  instructorId: string,
): Promise<Map<Predicate, ActiveMemorySnapshot>> {
  const { data, error } = await client
    .from("instructor_memories")
    .select(ACTIVE_MEMORY_COLUMNS)
    .eq("instructor_id", instructorId)
    .eq("status", "active")
    .eq("scope", "global")
    .is("scope_id", null);

  if (error) {
    throw new Error(`active instructor memory read failed: ${error.message}`);
  }

  const snapshots = new Map<Predicate, ActiveMemorySnapshot>();
  for (const raw of (data ?? []) as Record<string, unknown>[]) {
    const snapshot = toActiveMemorySnapshot(raw);
    snapshots.set(snapshot.predicate, snapshot);
  }
  return snapshots;
}

const INSTRUCTOR_PAUSE_REASON = "instructor_paused_memory";
const MEMORY_SETTING_REASONS = [
  INSTRUCTOR_PAUSE_REASON,
  "instructor_resumed_memory",
  "instructor_reset_memory",
] as const;

export async function isInstructorMemoryPaused(
  client: SupabaseClient,
  instructorId: string,
): Promise<boolean> {
  const { data, error } = await client
    .from("instructor_memory_events")
    .select("reason,operation,occurred_at")
    .eq("instructor_id", instructorId)
    .in("reason", [...MEMORY_SETTING_REASONS])
    .order("occurred_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`instructor memory pause state read failed: ${error.message}`);
  }
  return data?.reason === INSTRUCTOR_PAUSE_REASON && data.operation === "quarantine";
}

function stableUuid(namespace: string, value: string): string {
  const bytes = Buffer.from(
    createHash("sha256").update(`${namespace}\u0000${value}`).digest().subarray(0, 16),
  );
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function normalizeCandidateValue(value: CandidateRecord["value"]): CandidateRecord["value"] {
  return typeof value === "string" ? value.normalize("NFC") : value;
}

function valuesEqual(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function isUniqueViolation(error: { code?: string } | null): boolean {
  return error?.code === "23505";
}

async function loadStoredMemory(
  client: SupabaseClient,
  instructorId: string,
  memoryId: string,
): Promise<StoredMemoryRow | null> {
  const { data, error } = await client
    .from("instructor_memories")
    .select("id,status")
    .eq("id", memoryId)
    .eq("instructor_id", instructorId)
    .maybeSingle();

  if (error) throw new Error(`stored instructor memory read failed: ${error.message}`);
  if (!data) return null;
  return data as StoredMemoryRow;
}

async function hasIdempotencyEvent(
  client: SupabaseClient,
  instructorId: string,
  idempotencyKey: string,
): Promise<boolean> {
  const { data, error } = await client
    .from("instructor_memory_events")
    .select("id,memory_id")
    .eq("instructor_id", instructorId)
    .eq("idempotency_key", idempotencyKey)
    .maybeSingle();

  if (error) throw new Error(`instructor memory event read failed: ${error.message}`);
  return data !== null;
}

function memoryInsertRow(params: {
  memoryId: string;
  instructorId: string;
  candidate: CandidateRecord;
  normalizedQuote: string;
  source: MemorySourceMessage;
}) {
  const { memoryId, instructorId, candidate, normalizedQuote, source } = params;
  const [start, end] = candidate.evidence.span;
  return {
    id: memoryId,
    instructor_id: instructorId,
    scope: "global",
    scope_id: null,
    predicate: candidate.predicate,
    value: normalizeCandidateValue(candidate.value),
    value_text: candidate.valueText,
    canonical_text: candidate.valueText.normalize("NFC"),
    evidence_source: source.sourceTable,
    evidence_ref_id: source.id,
    evidence_span: `[${start},${end})`,
    evidence_quote: normalizedQuote,
    input_origin: "typed",
    commitment: candidate.commitment,
    is_explicit: candidate.isExplicit,
    affects_score: PREDICATE_TABLE[candidate.predicate].affectsScore,
    status: "quarantined",
    superseded_by: null,
    extractor_version: MEMORY_EXTRACTOR_VERSION,
    source_event_at: source.createdAt,
    version: 1,
  };
}

async function archiveWithCas(
  client: SupabaseClient,
  instructorId: string,
  expected: ActiveMemorySnapshot,
): Promise<boolean> {
  const { data, error } = await client
    .from("instructor_memories")
    .update({
      status: "archived",
      version: expected.version + 1,
      updated_at: new Date().toISOString(),
    })
    .eq("id", expected.id)
    .eq("instructor_id", instructorId)
    .eq("version", expected.version)
    .eq("status", "active")
    .select("id")
    .maybeSingle();

  if (error) throw new Error(`instructor memory CAS failed: ${error.message}`);
  return data !== null;
}

async function insertStagedMemory(
  client: SupabaseClient,
  row: ReturnType<typeof memoryInsertRow>,
): Promise<"inserted" | "existing" | "conflict"> {
  const { error } = await client.from("instructor_memories").insert(row);
  if (!error) return "inserted";
  if (!isUniqueViolation(error)) {
    throw new Error(`instructor memory insert failed: ${error.message}`);
  }

  const existing = await loadStoredMemory(client, row.instructor_id, row.id);
  return existing ? "existing" : "conflict";
}

async function linkSupersededMemory(
  client: SupabaseClient,
  instructorId: string,
  expected: ActiveMemorySnapshot,
  replacementId: string,
): Promise<void> {
  const { data, error } = await client
    .from("instructor_memories")
    .update({
      superseded_by: replacementId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", expected.id)
    .eq("instructor_id", instructorId)
    .eq("version", expected.version + 1)
    .eq("status", "archived")
    .select("id")
    .maybeSingle();

  if (error || !data) {
    throw new Error(
      `failed to link superseded instructor memory: ${error?.message ?? "row missing"}`,
    );
  }
}

async function appendMemoryEvent(params: {
  client: SupabaseClient;
  eventId: string;
  memoryId: string;
  instructorId: string;
  idempotencyKey: string;
  expected: ActiveMemorySnapshot | undefined;
  candidate: CandidateRecord;
  source: MemorySourceMessage;
  reason: string;
}): Promise<void> {
  const {
    client,
    eventId,
    memoryId,
    instructorId,
    idempotencyKey,
    expected,
    candidate,
    source,
    reason,
  } = params;
  const normalizedValue = normalizeCandidateValue(candidate.value);

  // Deterministic event IDs make PostgREST's primary-key ON CONFLICT DO
  // NOTHING path line up with the partial (instructor_id, idempotency_key)
  // uniqueness backstop in the database.
  const { error } = await client.from("instructor_memory_events").upsert(
    {
      id: eventId,
      memory_id: memoryId,
      instructor_id: instructorId,
      operation: expected ? "supersede" : "add",
      reason,
      before_value: expected?.value ?? null,
      after_value: normalizedValue,
      actor_kind: "extractor",
      actor_id: source.createdBy,
      extractor_version: MEMORY_EXTRACTOR_VERSION,
      idempotency_key: idempotencyKey,
    },
    { ignoreDuplicates: true },
  );

  if (error) throw new Error(`instructor memory event insert failed: ${error.message}`);
}

async function activateStagedMemory(
  client: SupabaseClient,
  instructorId: string,
  memoryId: string,
): Promise<boolean> {
  const { data, error } = await client
    .from("instructor_memories")
    .update({ status: "active", updated_at: new Date().toISOString() })
    .eq("id", memoryId)
    .eq("instructor_id", instructorId)
    .eq("status", "quarantined")
    .select("id")
    .maybeSingle();

  if (isUniqueViolation(error)) return false;
  if (error) throw new Error(`instructor memory activation failed: ${error.message}`);
  if (data) return true;

  return (await loadStoredMemory(client, instructorId, memoryId))?.status === "active";
}

export type PromotionResult =
  | { outcome: "promoted"; reason: string; memoryId: string }
  | { outcome: "duplicate"; reason: string; memoryId: string }
  | { outcome: "requeue"; reason: string }
  | {
      outcome: "storage_disabled" | "paused" | "stale" | "unchanged";
      reason: string;
    };

/**
 * Applies one already-verified candidate as an idempotent visibility unit.
 * A new row is staged as quarantined, its event is appended with ON CONFLICT
 * DO NOTHING, and only then is the row made active. Consumers can therefore
 * never observe a newly active memory without its audit event.
 */
export async function promoteMemoryCandidate(params: {
  client: SupabaseClient;
  candidate: CandidateRecord;
  normalizedQuote: string;
  source: MemorySourceMessage;
  expected: ActiveMemorySnapshot | undefined;
  idempotencyKey: string;
}): Promise<PromotionResult> {
  const {
    client,
    candidate,
    normalizedQuote,
    source,
    expected,
    idempotencyKey,
  } = params;
  if (!readMemoryFlags().storageEnabled) {
    return { outcome: "storage_disabled", reason: "memory_storage_disabled" };
  }

  const instructorId = source.createdBy;
  if (!instructorId) throw new Error("typed memory source is missing created_by");

  try {
    if (await isInstructorMemoryPaused(client, instructorId)) {
      return { outcome: "paused", reason: "instructor_memory_paused" };
    }
  } catch {
    // Pause state is fail-closed: an unavailable control-state read must never
    // make a new memory visible.
    return { outcome: "paused", reason: "instructor_memory_pause_state_unavailable" };
  }

  const identity = `${instructorId}:${idempotencyKey}`;
  const memoryId = stableUuid("instructor-memory", identity);
  const eventId = stableUuid("instructor-memory-event", identity);
  const existingMemory = await loadStoredMemory(client, instructorId, memoryId);
  const eventExists = await hasIdempotencyEvent(client, instructorId, idempotencyKey);

  if (eventExists && existingMemory?.status === "active") {
    return {
      outcome: "duplicate",
      reason: "idempotency_event_already_applied",
      memoryId,
    };
  }

  if (
    !eventExists &&
    expected &&
    Date.parse(source.createdAt) < Date.parse(expected.source_event_at)
  ) {
    return { outcome: "stale", reason: "source_event_older_than_active_memory" };
  }

  const normalizedValue = normalizeCandidateValue(candidate.value);
  const canonicalText = candidate.valueText.normalize("NFC");
  if (
    !eventExists &&
    expected &&
    expected.canonical_text === canonicalText &&
    valuesEqual(expected.value, normalizedValue)
  ) {
    return { outcome: "unchanged", reason: "active_memory_already_has_same_value" };
  }

  // The CAS happens before any candidate-specific write. A stale version thus
  // cannot create even a staged replacement row; it only requests a re-queue.
  if (!eventExists && expected) {
    const archived = await archiveWithCas(client, instructorId, expected);
    if (!archived) {
      return { outcome: "requeue", reason: "active_memory_version_changed" };
    }
  }

  const row = memoryInsertRow({
    memoryId,
    instructorId,
    candidate,
    normalizedQuote,
    source,
  });

  let storedMemory = existingMemory;
  if (!storedMemory) {
    const staged = await insertStagedMemory(client, row);
    if (staged === "conflict") {
      return { outcome: "requeue", reason: "memory_insert_conflicted" };
    }
    storedMemory = await loadStoredMemory(client, instructorId, memoryId);
  }

  if (!storedMemory) {
    throw new Error("staged instructor memory could not be reloaded");
  }

  if (!eventExists && expected) {
    await linkSupersededMemory(client, instructorId, expected, memoryId);
  }

  const reason = expected
    ? "superseded active memory with newer typed instructor evidence at an exact NFC span"
    : "promoted typed instructor evidence verified at an exact NFC span";

  if (!eventExists) {
    await appendMemoryEvent({
      client,
      eventId,
      memoryId,
      instructorId,
      idempotencyKey,
      expected,
      candidate,
      source,
      reason,
    });
  }

  const activated =
    storedMemory.status === "active" ||
    (await activateStagedMemory(client, instructorId, memoryId));
  if (!activated) {
    return { outcome: "requeue", reason: "memory_activation_conflicted" };
  }

  return { outcome: "promoted", reason, memoryId };
}

function candidateIdempotencyKey(
  payload: MemoryExtractionJobPayload,
  predicate: Predicate,
): string {
  const base =
    payload.idempotencyKey ??
    `memory-extraction:${MEMORY_EXTRACTOR_VERSION}:${payload.sourceTable}:${payload.sourceRefId}`;
  return `${base}:${predicate}`;
}

function emptyJobResult(
  reason: Exclude<MemoryExtractionJobResult["reason"], "processed">,
): MemoryExtractionJobResult {
  return {
    ok: false,
    reason,
    verdicts: [],
    promoted: 0,
    rejected: 0,
    requeued: false,
  };
}

export async function processMemoryExtractionJob(
  payload: MemoryExtractionJobPayload,
  dependencies: MemoryExtractionDependencies,
): Promise<MemoryExtractionJobResult> {
  if (!readMemoryFlags().extractionEnabled) {
    return emptyJobResult("extraction_disabled");
  }

  const readClient = dependencies.getClient();
  const source = await loadEligibleSource(readClient, payload);
  if (!source) return emptyJobResult("source_not_eligible");

  const instructorId = source.createdBy as string;
  const expectedByPredicate = await loadActiveMemorySnapshots(
    readClient,
    instructorId,
  );

  // extractCandidates receives only an immutable typed source. It has no
  // database client or write capability, and all reads have completed first.
  const rawResponse = await dependencies.extractCandidates(source);
  const parsed = parseMemoryExtractionResponse(rawResponse);
  if (!parsed.ok) return emptyJobResult(parsed.reason);

  const verdicts: CandidateVerdict[] = [];
  const seenPredicates = new Set<Predicate>();
  let writeClient: SupabaseClient | null = null;
  let shouldRequeue = false;

  for (const [index, rawCandidate] of parsed.candidates.entries()) {
    const predicate = rawPredicate(rawCandidate);
    const verification = verifyMemoryCandidate(rawCandidate, source);
    if (!verification.accepted) {
      verdicts.push({
        index,
        predicate,
        verdict: "REJECTED",
        reason: verification.reason,
      });
      continue;
    }

    const candidate = verification.candidate;
    if (seenPredicates.has(candidate.predicate)) {
      verdicts.push({
        index,
        predicate: candidate.predicate,
        verdict: "REJECTED",
        reason: "duplicate_predicate_candidate",
      });
      continue;
    }
    seenPredicates.add(candidate.predicate);

    if (!readMemoryFlags().storageEnabled) {
      verdicts.push({
        index,
        predicate: candidate.predicate,
        verdict: "REJECTED",
        reason: "memory_storage_disabled",
      });
      continue;
    }

    // A fresh fetch-based Supabase client is created only after the model call;
    // no transaction or database connection spans the external AI request.
    writeClient ??= dependencies.getClient();
    const promotion = await promoteMemoryCandidate({
      client: writeClient,
      candidate,
      normalizedQuote: verification.normalizedQuote,
      source,
      expected: expectedByPredicate.get(candidate.predicate),
      idempotencyKey: candidateIdempotencyKey(payload, candidate.predicate),
    });

    if (promotion.outcome === "promoted") {
      verdicts.push({
        index,
        predicate: candidate.predicate,
        verdict: "PROMOTED",
        reason: promotion.reason,
        memoryId: promotion.memoryId,
      });
    } else if (promotion.outcome === "duplicate") {
      verdicts.push({
        index,
        predicate: candidate.predicate,
        verdict: "DUPLICATE",
        reason: promotion.reason,
        memoryId: promotion.memoryId,
      });
    } else if (promotion.outcome === "requeue") {
      shouldRequeue = true;
      verdicts.push({
        index,
        predicate: candidate.predicate,
        verdict: "REQUEUED",
        reason: promotion.reason,
      });
    } else {
      verdicts.push({
        index,
        predicate: candidate.predicate,
        verdict: "REJECTED",
        reason: promotion.reason,
      });
    }
  }

  if (shouldRequeue) {
    await dependencies.requeue({
      ...payload,
      retryAttempt: (payload.retryAttempt ?? 0) + 1,
    });
  }

  return {
    ok: true,
    reason: "processed",
    verdicts,
    promoted: verdicts.filter((entry) => entry.verdict === "PROMOTED").length,
    rejected: verdicts.filter((entry) => entry.verdict === "REJECTED").length,
    requeued: shouldRequeue,
  };
}
