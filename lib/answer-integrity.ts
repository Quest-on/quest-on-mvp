/**
 * 답안 무결성 통합 모듈 — 시험·과제 공통 paste 판단, 복합 지표 (클라이언트·서버 공용).
 * AI 분석·DB 로드는 @/lib/answer-integrity-server 사용.
 * 속도 분석은 NEXT_PUBLIC_FINAL_ANSWER_SPEED_ANALYSIS=false 로 끌 수 있다.
 */

import { calculateTextOverlapScore, isAssignmentType } from "@/lib/grading-helpers";

/** paste_logs.question_id 에 저장하는 고정 키 */
export const FINAL_ANSWER_LOG_ID = "final_answer";

/** 외부 붙여넣기 분류 근거 — UI·AI 프롬프트 공통 */
export const EXTERNAL_PASTE_SUSPICION_REASON_KO =
  "클립보드에 Quest-On 앱 내부 복사 표식(전용 MIME 타입 또는 내부 마커)이 없어, 외부 출처에서 붙여넣은 것으로 분류됨";

export const EXTERNAL_PASTE_SUSPICION_REASON_EN =
  "Classified as external paste because the clipboard lacked Quest-On in-app copy markers (dedicated MIME type or internal marker).";

export const INTERNAL_PASTE_REASON_KO =
  "앱 내 복사 버튼 또는 답안란 내부 복사로 붙여넣음 — 허용된 행동";

export const INTERNAL_PASTE_REASON_EN =
  "Pasted from in-app copy (AI chat copy button or in-field copy) — allowed";

/** false 이면 비정상 입력 속도 구간 분석·표시를 하지 않는다 */
export function isSpeedAnalysisEnabled(): boolean {
  return process.env.NEXT_PUBLIC_FINAL_ANSWER_SPEED_ANALYSIS !== "false";
}

/** @deprecated isSpeedAnalysisEnabled 사용 */
export const isFinalAnswerSpeedAnalysisEnabled = isSpeedAnalysisEnabled;

/** 클라이언트 컴포넌트용 — 런타임 변경 불가 */
export const SPEED_ANALYSIS_ENABLED =
  process.env.NEXT_PUBLIC_FINAL_ANSWER_SPEED_ANALYSIS !== "false";

/** @deprecated SPEED_ANALYSIS_ENABLED 사용 */
export const FINAL_ANSWER_SPEED_ANALYSIS_ENABLED = SPEED_ANALYSIS_ENABLED;

export type InputTelemetryKind = "insert" | "delete" | "paste";

/** 클라이언트 → 서버 입력 이벤트 (전체 타임라인) */
export interface InputEvent {
  ts: number;
  kind: InputTelemetryKind;
  /** 양수=추가, 음수=삭제 */
  delta: number;
  /** 이벤트 직후 답안 길이 */
  len: number;
  /** paste 이벤트만 — 앱 내부 복사 여부 */
  internal?: boolean;
}

export type AbnormalBurstReason = "single_burst" | "high_cps";

export interface AbnormalBurst {
  startTs: number;
  endTs: number;
  chars: number;
  cps: number;
  reason: AbnormalBurstReason;
  /** 최종답안 내 대략적 문자 위치 */
  startOffset: number;
  endOffset: number;
}

/** 공격적 임계값 — IME 오탐을 감수하고 외부 붙여넣기·고속 입력을 넓게 잡는다 */
const AGGRESSIVE_SINGLE_INSERT_CHARS = 3;
const AGGRESSIVE_CPS_THRESHOLD = 5;
const AGGRESSIVE_WINDOW_MS = 400;

/** @deprecated InputEvent 사용 */
export type FinalAnswerInputEvent = InputEvent;

export type AnswerIntegrityScope =
  | { kind: "assignment" }
  | { kind: "exam_question"; questionId: string; qIdx: number };

export function assignmentIntegrityScope(): AnswerIntegrityScope {
  return { kind: "assignment" };
}

export function examQuestionIntegrityScope(
  questionId: string,
  qIdx: number
): AnswerIntegrityScope {
  return { kind: "exam_question", questionId, qIdx };
}

export function resolvePasteLogQuestionId(scope: AnswerIntegrityScope): string {
  return scope.kind === "assignment" ? FINAL_ANSWER_LOG_ID : scope.questionId;
}

export function parseIntegrityScope(params: {
  examType: string;
  questionId?: string | null;
  qIdx?: number | null;
}): AnswerIntegrityScope {
  const { examType, questionId, qIdx } = params;
  if (isAssignmentType(examType)) {
    return { kind: "assignment" };
  }
  if (!questionId) {
    throw new Error("QUESTION_ID_REQUIRED");
  }
  return {
    kind: "exam_question",
    questionId,
    qIdx: typeof qIdx === "number" ? qIdx : 0,
  };
}

function isPasteEvent(event: InputEvent): boolean {
  return event.kind === "paste";
}

/**
 * 전체 입력 타임라인에서 비정상 속도 구간을 탐지한다.
 * paste 이벤트는 제외(별도 paste_logs 로 처리).
 */
export function detectAbnormalInputBursts(events: InputEvent[]): AbnormalBurst[] {
  if (!isSpeedAnalysisEnabled() || events.length === 0) {
    return [];
  }

  const sorted = [...events].sort((a, b) => a.ts - b.ts);
  const bursts: AbnormalBurst[] = [];
  let offset = 0;

  for (let i = 0; i < sorted.length; i++) {
    const event = sorted[i];
    const prevOffset = offset;
    offset = Math.max(0, event.len);

    if (isPasteEvent(event)) continue;

    const insertDelta = event.delta > 0 ? event.delta : 0;
    if (insertDelta === 0) continue;

    // 단일 이벤트에 비정상적으로 많은 글자가 들어온 경우 (붙여넣기 미감지 등)
    if (
      event.kind === "insert" &&
      insertDelta >= AGGRESSIVE_SINGLE_INSERT_CHARS
    ) {
      bursts.push({
        startTs: event.ts,
        endTs: event.ts,
        chars: insertDelta,
        cps: insertDelta,
        reason: "single_burst",
        startOffset: prevOffset,
        endOffset: prevOffset + insertDelta,
      });
      continue;
    }

    // 슬라이딩 윈도우 CPS
    let windowChars = insertDelta;
    let windowStart = event.ts;
    let windowStartOffset = prevOffset;
    let j = i;

    while (j > 0) {
      j--;
      const prev = sorted[j];
      if (isPasteEvent(prev)) break;
      if (event.ts - prev.ts > AGGRESSIVE_WINDOW_MS) break;
      if (prev.delta <= 0) continue;
      windowChars += prev.delta;
      windowStart = prev.ts;
      windowStartOffset = Math.max(0, prev.len - prev.delta);
    }

    const durationMs = Math.max(event.ts - windowStart, 1);
    const cps = (windowChars / durationMs) * 1000;

    if (windowChars >= AGGRESSIVE_SINGLE_INSERT_CHARS && cps >= AGGRESSIVE_CPS_THRESHOLD) {
      const endOffset = prevOffset + insertDelta;
      const duplicate = bursts.some(
        (b) =>
          b.reason === "high_cps" &&
          Math.abs(b.startTs - windowStart) < 50 &&
          Math.abs(b.endOffset - endOffset) < 5
      );
      if (!duplicate) {
        bursts.push({
          startTs: windowStart,
          endTs: event.ts,
          chars: windowChars,
          cps: Math.round(cps * 10) / 10,
          reason: "high_cps",
          startOffset: windowStartOffset,
          endOffset,
        });
      }
    }
  }

  return bursts;
}

export interface PasteLogRow {
  length: number;
  is_internal: boolean;
  suspicious: boolean;
  timestamp: string;
  pasted_text?: string | null;
  paste_start?: number | null;
}

export interface ExternalPasteSuspicionDetail {
  timestamp: string;
  length: number;
  reason: string;
  textPreview: string | null;
  pasteStart: number | null;
}

export function excerptPastedText(
  text: string | null | undefined,
  maxLen = 80
): string | null {
  if (!text) return null;
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return null;
  if (normalized.length <= maxLen) return normalized;
  return `${normalized.slice(0, maxLen)}…`;
}

export function getExternalPasteSuspicionReason(language: "ko" | "en" = "ko"): string {
  return language === "en"
    ? EXTERNAL_PASTE_SUSPICION_REASON_EN
    : EXTERNAL_PASTE_SUSPICION_REASON_KO;
}

export function getInternalPasteReason(language: "ko" | "en" = "ko"): string {
  return language === "en" ? INTERNAL_PASTE_REASON_EN : INTERNAL_PASTE_REASON_KO;
}

/** 외부 붙여넣기 의심 건별 판단 근거 */
/** @deprecated PasteLogRow 사용 */
export type FinalAnswerPasteLogRow = PasteLogRow;

export function buildExternalPasteSuspicionDetails(
  pasteLogs: PasteLogRow[],
  language: "ko" | "en" = "ko"
): ExternalPasteSuspicionDetail[] {
  const reason = getExternalPasteSuspicionReason(language);
  return pasteLogs
    .filter((log) => log.suspicious && !log.is_internal)
    .map((log) => ({
      timestamp: log.timestamp,
      length: log.length || 0,
      reason,
      textPreview: excerptPastedText(log.pasted_text),
      pasteStart:
        typeof log.paste_start === "number" && log.paste_start >= 0
          ? log.paste_start
          : null,
    }));
}

export function describeAbnormalBurstReason(
  burst: AbnormalBurst,
  language: "ko" | "en" = "ko"
): string {
  if (language === "en") {
    if (burst.reason === "single_burst") {
      return `${burst.chars} characters entered in a single input event (exceeds normal typing speed; paste may have been missed)`;
    }
    return `${burst.chars} characters in ~${Math.max(burst.endTs - burst.startTs, 1)}ms (~${burst.cps} chars/sec)`;
  }
  if (burst.reason === "single_burst") {
    return `단일 입력 이벤트에 ${burst.chars}자가 한 번에 입력됨 (일반 타이핑 속도 초과, 붙여넣기 미감지 가능성)`;
  }
  return `약 ${burst.endTs - burst.startTs}ms 동안 ${burst.chars}자 입력 (초당 약 ${burst.cps}자)`;
}

export interface AnswerIntegritySnapshot {
  scope: AnswerIntegrityScope;
  externalPasteCount: number;
  externalPasteChars: number;
  internalPasteCount: number;
  internalPasteChars: number;
  abnormalBursts: AbnormalBurst[];
  pasteLogs: PasteLogRow[];
  externalPasteDetails: ExternalPasteSuspicionDetail[];
}

/** @deprecated AnswerIntegritySnapshot 사용 */
export type FinalAnswerIntegritySnapshot = AnswerIntegritySnapshot;

/** AI 종합평가·채팅 프롬프트용 텍스트 */
export function formatAnswerIntegrityForPrompt(
  integrity: AnswerIntegritySnapshot | null | undefined,
  language: "ko" | "en" = "ko"
): string {
  if (!integrity) {
    return language === "en"
      ? "(No final-answer input integrity signals recorded.)"
      : "(최종답안 입력 무결성 신호 없음)";
  }

  const { internalPasteCount, abnormalBursts } = integrity;

  if (
    integrity.externalPasteCount === 0 &&
    internalPasteCount === 0 &&
    abnormalBursts.length === 0
  ) {
    return language === "en"
      ? "(No paste or abnormal typing signals detected in the final answer field.)"
      : "(최종답안 작성란에서 붙여넣기·비정상 입력 속도 신호가 감지되지 않음)";
  }

  const lines: string[] = [];
  const externalDetails = buildExternalPasteSuspicionDetails(
    integrity.pasteLogs,
    language
  );

  if (language === "en") {
    lines.push("[Final answer input integrity — reference only, not automatic guilt]");
    if (externalDetails.length > 0) {
      lines.push(`- External paste suspected: ${externalDetails.length} event(s):`);
      for (const detail of externalDetails.slice(0, 8)) {
        const time = new Date(detail.timestamp).toLocaleString("en-US", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        });
        lines.push(
          `  · ${time}, ${detail.length} chars` +
            (detail.pasteStart !== null ? `, position ${detail.pasteStart}` : "") +
            ` — Reason: ${detail.reason}` +
            (detail.textPreview ? ` — Preview: "${detail.textPreview}"` : "")
        );
      }
    }
    if (internalPasteCount > 0) {
      lines.push(
        `- In-app copy: ${internalPasteCount} event(s). Reason: ${getInternalPasteReason("en")}`
      );
    }
    if (isSpeedAnalysisEnabled() && abnormalBursts.length > 0) {
      lines.push(`- Abnormal typing-speed segment(s): ${abnormalBursts.length} (reference only).`);
      for (const b of abnormalBursts.slice(0, 5)) {
        lines.push(`  · ${describeAbnormalBurstReason(b, "en")}`);
      }
    }
    lines.push(
      "- When mentioning external paste in the summary, cite the specific reason and preview above. AI chat partial copy is acceptable."
    );
    return lines.join("\n");
  }

  lines.push("[최종답안 입력 무결성 신호 — 참고용, 자동 부정행위 판정 아님]");
  if (externalDetails.length > 0) {
    lines.push(`- 외부 붙여넣기 의심 ${externalDetails.length}건:`);
    for (const detail of externalDetails.slice(0, 8)) {
      const time = new Date(detail.timestamp).toLocaleString("ko-KR", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });
      lines.push(
        `  · ${time}, ${detail.length}자` +
          (detail.pasteStart !== null ? `, 답안 ${detail.pasteStart}번째 글자 위치` : "") +
          ` — 판단 근거: ${detail.reason}` +
          (detail.textPreview ? ` — 붙여넣은 내용 미리보기: 「${detail.textPreview}」` : "")
      );
    }
  }
  if (internalPasteCount > 0) {
    lines.push(
      `- 앱 내 복사 ${internalPasteCount}회 — 판단 근거: ${getInternalPasteReason("ko")}`
    );
  }
  if (isSpeedAnalysisEnabled() && abnormalBursts.length > 0) {
    lines.push(`- 비정상 입력 속도 구간(참고) ${abnormalBursts.length}건:`);
    for (const b of abnormalBursts.slice(0, 5)) {
      lines.push(`  · ${describeAbnormalBurstReason(b, "ko")}`);
    }
  }
  lines.push(
    "- 외부 붙여넣기를 종합 의견·개선점에 언급할 때는 위 판단 근거·미리보기를 구체적으로 인용하세요. AI 채팅 부분 복사는 정상적인 리서치 정리로 볼 수 있습니다."
  );
  return lines.join("\n");
}

export function hasAnswerIntegritySignals(
  integrity: AnswerIntegritySnapshot | null | undefined
): boolean {
  if (!integrity) return false;
  return (
    integrity.externalPasteCount > 0 ||
    integrity.internalPasteCount > 0 ||
    (isSpeedAnalysisEnabled() && integrity.abnormalBursts.length > 0)
  );
}

/** @deprecated hasAnswerIntegritySignals 사용 */
export const hasFinalAnswerIntegritySignals = hasAnswerIntegritySignals;

/** @deprecated formatAnswerIntegrityForPrompt 사용 */
export const formatFinalAnswerIntegrityForPrompt = formatAnswerIntegrityForPrompt;

const IDLE_GAP_MS = 3_000;
const SPEED_BUCKET_MS = 60_000;
const SPEED_WINDOW_MS = 5_000;

export type IntegrityClassification =
  | "정상"
  | "낮은 검토 필요"
  | "검토 권장"
  | "우선 검토 필요";

/** @deprecated IntegrityClassification 사용 */
export type AuthenticityClassification = IntegrityClassification;

export type PasteReviewLevel = "해당 없음" | "낮음" | "중간" | "높음";

export interface PasteAssessment {
  external_paste_suspected: boolean;
  review_level: PasteReviewLevel;
  summary: string;
  evidence: string[];
}

export interface AnswerIntegrityAnalysis {
  authenticity_score: number;
  classification: IntegrityClassification;
  evidence: string[];
  risk_factors: string[];
  reasoning_summary: string;
  analyzed_at: string;
  paste_assessment?: PasteAssessment;
  metrics_snapshot?: AnswerIntegrityMetrics;
}

/** @deprecated AnswerIntegrityAnalysis 사용 */
export type AnswerAuthenticityAnalysis = AnswerIntegrityAnalysis;

export interface AnswerIntegrityMetrics {
  submission: {
    answer_length: number;
    session_created_at: string | null;
    submission_time: string | null;
    final_answer_updated_at: string | null;
    writing_duration_ms: number | null;
  };
  paste: {
    occurred: boolean;
    total_paste_count: number;
    external_paste_count: number;
    internal_paste_count: number;
    total_pasted_chars: number;
    external_pasted_chars: number;
    max_single_paste_size: number;
    ratio_to_final_answer: number | null;
    paste_timestamps: string[];
    events: Array<{
      timestamp: string;
      length: number;
      is_internal: boolean;
      suspicious: boolean;
      text_preview: string | null;
    }>;
    after_last_paste: {
      ms_to_submission: number | null;
      chars_inserted: number;
      chars_deleted: number;
      edit_event_count: number;
    };
    paste_to_final_answer_similarity_max: number | null;
    paste_to_ai_response_similarity_max: number | null;
  };
  typing: {
    input_event_count: number;
    keydown_event_count: null;
    total_inserted_chars: number;
    total_deleted_chars: number;
    edit_ratio: number | null;
    edit_count: number;
    draft_version_count: null;
    draft_created: boolean;
    average_chars_per_minute: number | null;
    max_chars_per_minute: number | null;
    speed_timeline: Array<{ bucket_start: string; chars_per_minute: number }>;
    sudden_spike_count: number;
    continuous_typing_segment_count: number;
    idle_gap_count: number;
    total_idle_ms: number;
    has_write_edit_rewrite_pattern: boolean;
    length_snapshots: Array<{ ts: number; len: number }>;
  };
  ai_usage: {
    ai_message_count: number;
    total_ai_response_chars: number;
    last_ai_message_at: string | null;
    ms_from_last_ai_to_submission: number | null;
    ms_from_last_ai_to_first_input: number | null;
    ai_to_final_answer_similarity: number | null;
  };
  focus: {
    focus_loss_count: null;
    focus_loss_total_ms: null;
    tab_switch_count: null;
    paste_immediately_after_focus_return: null;
    submit_immediately_after_focus_return: null;
  };
  personal_baseline: {
    average_typing_speed: null;
    average_edit_ratio: null;
    average_submission_duration_ms: null;
  };
  unavailable_metrics: string[];
}

/** @deprecated AnswerIntegrityMetrics 사용 */
export type AnswerAuthenticityMetrics = AnswerIntegrityMetrics;

function msBetween(a: string | null | undefined, b: string | null | undefined): number | null {
  if (!a || !b) return null;
  const diff = new Date(b).getTime() - new Date(a).getTime();
  return Number.isFinite(diff) ? Math.max(0, diff) : null;
}

function previewText(text: string | null | undefined, max = 60): string | null {
  if (!text) return null;
  const n = text.replace(/\s+/g, " ").trim();
  if (!n) return null;
  return n.length <= max ? n : `${n.slice(0, max)}…`;
}

function maxOverlapAgainst(answer: string, references: string[]): number | null {
  if (!answer.trim() || references.length === 0) return null;
  return calculateTextOverlapScore(answer, references);
}

function computeSpeedTimeline(
  events: InputEvent[]
): Array<{ bucket_start: string; chars_per_minute: number }> {
  if (events.length === 0) return [];
  const sorted = [...events].sort((a, b) => a.ts - b.ts);
  const start = sorted[0].ts;
  const buckets = new Map<number, number>();

  for (const e of sorted) {
    if (e.delta <= 0) continue;
    const bucket = Math.floor((e.ts - start) / SPEED_BUCKET_MS);
    buckets.set(bucket, (buckets.get(bucket) ?? 0) + e.delta);
  }

  return [...buckets.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([bucket, chars]) => ({
      bucket_start: new Date(start + bucket * SPEED_BUCKET_MS).toISOString(),
      chars_per_minute: Math.round(chars),
    }));
}

function computeMaxCharsPerMinute(events: InputEvent[]): number | null {
  const sorted = [...events].filter((e) => e.delta > 0).sort((a, b) => a.ts - b.ts);
  if (sorted.length === 0) return null;

  let maxCpm = 0;
  for (let i = 0; i < sorted.length; i++) {
    let chars = sorted[i].delta;
    const endTs = sorted[i].ts;
    let startTs = sorted[i].ts;
    for (let j = i - 1; j >= 0; j--) {
      if (endTs - sorted[j].ts > SPEED_WINDOW_MS) break;
      chars += sorted[j].delta;
      startTs = sorted[j].ts;
    }
    const minutes = Math.max((endTs - startTs) / 60_000, 1 / 60_000);
    maxCpm = Math.max(maxCpm, chars / minutes);
  }
  return Math.round(maxCpm);
}

function computeIdleGaps(events: InputEvent[]): { count: number; totalMs: number } {
  const sorted = [...events].sort((a, b) => a.ts - b.ts);
  let count = 0;
  let totalMs = 0;
  for (let i = 1; i < sorted.length; i++) {
    const gap = sorted[i].ts - sorted[i - 1].ts;
    if (gap >= IDLE_GAP_MS) {
      count += 1;
      totalMs += gap;
    }
  }
  return { count, totalMs };
}

function countContinuousTypingSegments(events: InputEvent[]): number {
  const sorted = [...events].sort((a, b) => a.ts - b.ts);
  if (sorted.length === 0) return 0;
  let segments = 1;
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].ts - sorted[i - 1].ts >= IDLE_GAP_MS) segments += 1;
  }
  return segments;
}

function hasWriteEditRewritePattern(events: InputEvent[]): boolean {
  const sorted = [...events].sort((a, b) => a.ts - b.ts);
  let sawInsert = false;
  let sawDelete = false;
  for (const e of sorted) {
    if (e.kind === "insert" || (e.kind === "paste" && e.delta > 0)) sawInsert = true;
    if (e.delta < 0) sawDelete = true;
    if (sawInsert && sawDelete) {
      const afterDelete = sorted.some(
        (x) => x.ts > e.ts && (x.kind === "insert" || x.kind === "paste") && x.delta > 0
      );
      if (afterDelete) return true;
    }
  }
  return false;
}

function eventsAfterTs(events: InputEvent[], ts: number): InputEvent[] {
  return events.filter((e) => e.ts > ts);
}

export function computeAnswerIntegrityMetrics(params: {
  answerText: string;
  sessionCreatedAt: string | null;
  submissionTime: string | null;
  answerUpdatedAt: string | null;
  pasteLogs: PasteLogRow[];
  inputEvents: InputEvent[];
  aiMessages: Array<{ role: string; content: string; created_at?: string }>;
}): AnswerIntegrityMetrics {
  const {
    answerText,
    sessionCreatedAt,
    submissionTime,
    answerUpdatedAt,
    pasteLogs,
    inputEvents,
    aiMessages,
  } = params;

  const answerLength = answerText.trim().length;
  const sortedEvents = [...inputEvents].sort((a, b) => a.ts - b.ts);
  const externalPastes = pasteLogs.filter((p) => p.suspicious && !p.is_internal);
  const internalPastes = pasteLogs.filter((p) => p.is_internal);
  const totalPastedChars = pasteLogs.reduce((s, p) => s + (p.length || 0), 0);
  const externalPastedChars = externalPastes.reduce((s, p) => s + (p.length || 0), 0);
  const maxSinglePaste = pasteLogs.reduce((m, p) => Math.max(m, p.length || 0), 0);

  const aiAssistantMessages = aiMessages.filter((m) => m.role === "ai" || m.role === "assistant");
  const aiTexts = aiAssistantMessages.map((m) => m.content).filter(Boolean);
  const lastAi = [...aiAssistantMessages]
    .filter((m) => m.created_at)
    .sort(
      (a, b) =>
        new Date(a.created_at!).getTime() - new Date(b.created_at!).getTime()
    )
    .at(-1);

  const lastPasteTs = pasteLogs.length
    ? Math.max(...pasteLogs.map((p) => new Date(p.timestamp).getTime()))
    : null;
  const afterLastPasteEvents =
    lastPasteTs !== null ? eventsAfterTs(sortedEvents, lastPasteTs) : [];

  let charsInsertedAfterPaste = 0;
  let charsDeletedAfterPaste = 0;
  for (const e of afterLastPasteEvents) {
    if (e.delta > 0) charsInsertedAfterPaste += e.delta;
    if (e.delta < 0) charsDeletedAfterPaste += Math.abs(e.delta);
  }

  const totalInserted = sortedEvents.reduce((s, e) => s + (e.delta > 0 ? e.delta : 0), 0);
  const totalDeleted = sortedEvents.reduce(
    (s, e) => s + (e.delta < 0 ? Math.abs(e.delta) : 0),
    0
  );
  const editCount = sortedEvents.filter((e) => e.delta !== 0).length;

  const firstEventTs = sortedEvents[0]?.ts ?? null;
  const lastEventTs = sortedEvents.at(-1)?.ts ?? null;
  const writingEndIso = submissionTime ?? answerUpdatedAt;
  const writingEndMs = writingEndIso ? new Date(writingEndIso).getTime() : lastEventTs;
  const writingStartMs = firstEventTs;
  const writingDurationMs =
    writingStartMs && writingEndMs
      ? Math.max(0, writingEndMs - writingStartMs)
      : null;

  const avgCpm =
    writingDurationMs && writingDurationMs > 0 && totalInserted > 0
      ? Math.round((totalInserted / writingDurationMs) * 60_000)
      : null;

  const bursts = detectAbnormalInputBursts(sortedEvents);
  const idle = computeIdleGaps(sortedEvents);

  const pasteTexts = externalPastes
    .map((p) => p.pasted_text)
    .filter((t): t is string => !!t && t.trim().length > 0);

  const firstInputAfterAiMs =
    lastAi?.created_at && firstEventTs
      ? (() => {
          const aiTs = new Date(lastAi.created_at!).getTime();
          const firstAfter = sortedEvents.find((e) => e.ts >= aiTs);
          return firstAfter ? firstAfter.ts - aiTs : null;
        })()
      : null;

  const unavailable: string[] = [
    "keydown_event_count",
    "draft_version_count",
    "focus_loss_count",
    "focus_loss_total_ms",
    "tab_switch_count",
    "paste_immediately_after_focus_return",
    "submit_immediately_after_focus_return",
    "personal_baseline_average_typing_speed",
    "personal_baseline_average_edit_ratio",
    "personal_baseline_average_submission_duration",
  ];

  return {
    submission: {
      answer_length: answerLength,
      session_created_at: sessionCreatedAt,
      submission_time: submissionTime,
      final_answer_updated_at: answerUpdatedAt,
      writing_duration_ms: writingDurationMs,
    },
    paste: {
      occurred: pasteLogs.length > 0,
      total_paste_count: pasteLogs.length,
      external_paste_count: externalPastes.length,
      internal_paste_count: internalPastes.length,
      total_pasted_chars: totalPastedChars,
      external_pasted_chars: externalPastedChars,
      max_single_paste_size: maxSinglePaste,
      ratio_to_final_answer:
        answerLength > 0 ? Number((externalPastedChars / answerLength).toFixed(3)) : null,
      paste_timestamps: pasteLogs.map((p) => p.timestamp),
      events: pasteLogs.map((p) => ({
        timestamp: p.timestamp,
        length: p.length || 0,
        is_internal: p.is_internal,
        suspicious: p.suspicious,
        text_preview: previewText(p.pasted_text),
      })),
      after_last_paste: {
        ms_to_submission:
          lastPasteTs && submissionTime
            ? msBetween(new Date(lastPasteTs).toISOString(), submissionTime)
            : null,
        chars_inserted: charsInsertedAfterPaste,
        chars_deleted: charsDeletedAfterPaste,
        edit_event_count: afterLastPasteEvents.filter((e) => e.delta !== 0).length,
      },
      paste_to_final_answer_similarity_max:
        pasteTexts.length > 0 ? maxOverlapAgainst(answerText, pasteTexts) : null,
      paste_to_ai_response_similarity_max:
        pasteTexts.length > 0 && aiTexts.length > 0
          ? Math.max(...pasteTexts.map((t) => calculateTextOverlapScore(t, aiTexts)))
          : null,
    },
    typing: {
      input_event_count: sortedEvents.length,
      keydown_event_count: null,
      total_inserted_chars: totalInserted,
      total_deleted_chars: totalDeleted,
      edit_ratio:
        totalInserted > 0 ? Number((totalDeleted / totalInserted).toFixed(3)) : null,
      edit_count: editCount,
      draft_version_count: null,
      draft_created: sortedEvents.length > 0 || totalPastedChars > 0,
      average_chars_per_minute: avgCpm,
      max_chars_per_minute: computeMaxCharsPerMinute(sortedEvents),
      speed_timeline: computeSpeedTimeline(sortedEvents),
      sudden_spike_count: bursts.length,
      continuous_typing_segment_count: countContinuousTypingSegments(sortedEvents),
      idle_gap_count: idle.count,
      total_idle_ms: idle.totalMs,
      has_write_edit_rewrite_pattern: hasWriteEditRewritePattern(sortedEvents),
      length_snapshots: sortedEvents
        .filter((_, i) => i % Math.max(1, Math.floor(sortedEvents.length / 20)) === 0)
        .slice(0, 25)
        .map((e) => ({ ts: e.ts, len: e.len })),
    },
    ai_usage: {
      ai_message_count: aiAssistantMessages.length,
      total_ai_response_chars: aiTexts.join("").length,
      last_ai_message_at: lastAi?.created_at ?? null,
      ms_from_last_ai_to_submission: lastAi?.created_at
        ? msBetween(lastAi.created_at, submissionTime ?? answerUpdatedAt)
        : null,
      ms_from_last_ai_to_first_input: firstInputAfterAiMs,
      ai_to_final_answer_similarity:
        aiTexts.length > 0 && answerLength > 0
          ? calculateTextOverlapScore(answerText, aiTexts)
          : null,
    },
    focus: {
      focus_loss_count: null,
      focus_loss_total_ms: null,
      tab_switch_count: null,
      paste_immediately_after_focus_return: null,
      submit_immediately_after_focus_return: null,
    },
    personal_baseline: {
      average_typing_speed: null,
      average_edit_ratio: null,
      average_submission_duration_ms: null,
    },
    unavailable_metrics: unavailable,
  };
}

/** @deprecated computeAnswerIntegrityMetrics 사용 */
export const computeAnswerAuthenticityMetrics = (params: {
  finalAnswer: string;
  sessionCreatedAt: string | null;
  submissionTime: string | null;
  finalAnswerUpdatedAt: string | null;
  pasteLogs: PasteLogRow[];
  inputEvents: InputEvent[];
  aiMessages: Array<{ role: string; content: string; created_at?: string }>;
}) =>
  computeAnswerIntegrityMetrics({
    answerText: params.finalAnswer,
    sessionCreatedAt: params.sessionCreatedAt,
    submissionTime: params.submissionTime,
    answerUpdatedAt: params.finalAnswerUpdatedAt,
    pasteLogs: params.pasteLogs,
    inputEvents: params.inputEvents,
    aiMessages: params.aiMessages,
  });

export function formatMetricsForAnalyzerPrompt(metrics: AnswerIntegrityMetrics): string {
  return JSON.stringify(metrics, null, 2);
}

/** 분석기 paste_assessment 우선, 없으면 복합 지표로 잠정 판단 */
export function resolvePasteAssessment(
  analysis: AnswerIntegrityAnalysis | null | undefined,
  metrics: AnswerIntegrityMetrics | null | undefined
): PasteAssessment | null {
  if (analysis?.paste_assessment) {
    return analysis.paste_assessment;
  }
  if (!metrics) return null;

  const { paste, typing } = metrics;
  if (!paste.occurred && paste.external_paste_count === 0) {
    return {
      external_paste_suspected: false,
      review_level: "해당 없음",
      summary: "외부 붙여넣기 신호가 감지되지 않았습니다.",
      evidence: ["외부 Paste 이벤트 0회"],
    };
  }

  const evidence: string[] = [];
  if (paste.external_paste_count > 0) {
    evidence.push(
      `외부 붙여넣기 ${paste.external_paste_count}회, 총 ${paste.external_pasted_chars.toLocaleString()}자`
    );
  }
  if (paste.ratio_to_final_answer != null) {
    evidence.push(
      `답안 대비 외부 붙여넣기 비율 ${(paste.ratio_to_final_answer * 100).toFixed(0)}%`
    );
  }
  if (paste.paste_to_final_answer_similarity_max != null) {
    evidence.push(
      `붙여넣은 내용과 최종 답안 일치도 ${(paste.paste_to_final_answer_similarity_max * 100).toFixed(0)}%`
    );
  }
  if (paste.after_last_paste.ms_to_submission != null) {
    evidence.push(
      `마지막 붙여넣기 후 제출까지 ${Math.round(paste.after_last_paste.ms_to_submission / 1000)}초`
    );
  }
  if (
    paste.after_last_paste.chars_inserted === 0 &&
    paste.after_last_paste.chars_deleted === 0 &&
    paste.after_last_paste.edit_event_count === 0
  ) {
    evidence.push("붙여넣기 후 추가 입력·삭제·수정 없음");
  } else {
    if (paste.after_last_paste.chars_inserted > 0) {
      evidence.push(`붙여넣기 후 추가 입력 ${paste.after_last_paste.chars_inserted}자`);
    }
    if (paste.after_last_paste.chars_deleted > 0) {
      evidence.push(`붙여넣기 후 삭제 ${paste.after_last_paste.chars_deleted}자`);
    }
    if (paste.after_last_paste.edit_event_count > 0) {
      evidence.push(`붙여넣기 후 수정 ${paste.after_last_paste.edit_event_count}회`);
    }
  }
  if (typing.sudden_spike_count > 0) {
    evidence.push(`비정상 입력 속도 구간 ${typing.sudden_spike_count}건 (보조)`);
  }

  const suspected = paste.external_paste_count > 0;
  let review_level: PasteReviewLevel = "해당 없음";
  if (suspected) {
    const highRisk =
      (paste.ratio_to_final_answer ?? 0) >= 0.4 &&
      paste.after_last_paste.edit_event_count <= 1 &&
      (typing.edit_ratio ?? 1) < 0.05;
    const midRisk =
      paste.external_pasted_chars >= 80 ||
      (paste.ratio_to_final_answer ?? 0) >= 0.25 ||
      paste.max_single_paste_size >= 150;
    review_level = highRisk ? "높음" : midRisk ? "중간" : "낮음";
  }

  return {
    external_paste_suspected: suspected,
    review_level,
    summary: analysis
      ? "분석기 결과에 붙여넣기 전용 판단이 없어 복합 지표로 표시합니다. 재분석을 권장합니다."
      : suspected
        ? `복합 지표 기준 외부 붙여넣기 검토 ${review_level === "높음" ? "우선" : review_level} 수준입니다.`
        : "앱 내 복사만 확인되었거나 붙여넣기 신호가 없습니다.",
    evidence,
  };
}
