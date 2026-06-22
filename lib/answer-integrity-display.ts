/**
 * 교수 채점 UI용 — 검토 점수 구간 안내, 기술 변수명 → 자연어 변환.
 */

import type {
  AnswerIntegrityAnalysis,
  AnswerIntegrityMetrics,
  IntegrityClassification,
  PasteAssessment,
  PasteReviewLevel,
} from "@/lib/answer-integrity";

export interface AuthenticityScoreBand {
  min: number;
  max: number;
  classification: IntegrityClassification;
  /** 교수에게 보여줄 한 줄 설명 */
  description: string;
  /** 학생 답안을 우선·추가 검토할 구간인지 */
  reviewRecommended: boolean;
}

/** 분석기 프롬프트와 동일한 점수 구간 */
export const AUTHENTICITY_SCORE_BANDS: readonly AuthenticityScoreBand[] = [
  {
    min: 90,
    max: 100,
    classification: "정상",
    description: "직접 작성·정상적인 수정 과정으로 보는 구간",
    reviewRecommended: false,
  },
  {
    min: 70,
    max: 89,
    classification: "낮은 검토 필요",
    description: "일부 신호는 있으나 단독으로는 의심 수준에 해당하지 않음",
    reviewRecommended: false,
  },
  {
    min: 40,
    max: 69,
    classification: "검토 권장",
    description: "복합 신호가 겹침 — 답안·작성 과정을 추가로 확인할 구간",
    reviewRecommended: true,
  },
  {
    min: 0,
    max: 39,
    classification: "우선 검토 필요",
    description: "외부 붙여넣기·수정 부족 등 강한 신호 — 우선 확인이 필요한 구간",
    reviewRecommended: true,
  },
] as const;

export const PASTE_REVIEW_LEVEL_GUIDE: Record<
  PasteReviewLevel,
  { description: string; suspicious: boolean }
> = {
  "해당 없음": { description: "외부 붙여넣기 복합 신호 없음", suspicious: false },
  낮음: { description: "경미한 신호 — 참고 수준", suspicious: false },
  중간: { description: "복합 지표상 확인 권장", suspicious: true },
  높음: { description: "우선 확인이 필요한 수준", suspicious: true },
};

export function getAuthenticityScoreBand(score: number): AuthenticityScoreBand {
  const clamped = Math.max(0, Math.min(100, Math.round(score)));
  return (
    AUTHENTICITY_SCORE_BANDS.find((b) => clamped >= b.min && clamped <= b.max) ??
    AUTHENTICITY_SCORE_BANDS[AUTHENTICITY_SCORE_BANDS.length - 1]
  );
}

export function formatScoreRangeLegend(): string {
  return AUTHENTICITY_SCORE_BANDS.map(
    (b) => `${b.min}~${b.max} ${b.classification}`
  ).join(" · ");
}

export function formatPasteReviewLevelLegend(): string {
  return (Object.keys(PASTE_REVIEW_LEVEL_GUIDE) as PasteReviewLevel[])
    .map((level) => `${level}(${PASTE_REVIEW_LEVEL_GUIDE[level].description})`)
    .join(" · ");
}

/** JSON 필드명·snake_case 기술 용어를 교수용 자연어로 치환 */
const METRIC_LABELS: Record<string, string> = {
  paste_to_final_answer_similarity_max: "붙여넣은 내용과 최종 답안의 일치도",
  paste_to_ai_response_similarity_max: "붙여넣은 내용과 AI 답변의 유사도",
  ai_to_final_answer_similarity: "최종 답안과 AI 답변의 유사도",
  ratio_to_final_answer: "답안 대비 외부 붙여넣기 비율",
  external_paste_count: "외부 붙여넣기 횟수",
  internal_paste_count: "앱 내 복사(붙여넣기) 횟수",
  total_paste_count: "붙여넣기 총 횟수",
  external_pasted_chars: "외부 붙여넣기 글자 수",
  max_single_paste_size: "한 번에 붙여넣은 최대 글자 수",
  chars_inserted: "붙여넣기 후 추가로 입력한 글자 수",
  chars_deleted: "붙여넣기 후 삭제한 글자 수",
  edit_event_count: "붙여넣기 후 수정(입력·삭제) 횟수",
  ms_to_submission: "마지막 붙여넣기 후 제출까지 시간(밀리초)",
  edit_ratio: "삭제 비율(수정 활동 정도)",
  sudden_spike_count: "비정상적으로 빠른 입력 구간 수",
  input_event_count: "입력 이벤트 수",
  keydown_event_count: "키 입력 수",
  average_chars_per_minute: "평균 타이핑 속도(자/분)",
  max_chars_per_minute: "최대 타이핑 속도(자/분)",
  writing_duration_ms: "작성 소요 시간",
  continuous_typing_segment_count: "연속 타이핑 구간 수",
  idle_gap_count: "입력 멈춤(공백) 횟수",
  total_idle_ms: "입력 멈춤 총 시간",
  ms_from_last_ai_to_submission: "마지막 AI 답변 후 제출까지 시간",
  ms_from_last_ai_to_first_input: "마지막 AI 답변 후 첫 입력까지 시간",
  ai_message_count: "AI 대화 응답 수",
  total_ai_response_chars: "AI 응답 총 글자 수",
  draft_version_count: "초안 버전 수",
  has_write_edit_rewrite_pattern: "작성-수정-재작성 패턴 여부",
  external_paste_suspected: "외부 붙여넣기 의심 여부",
  review_level: "검토 수준",
  authenticity_score: "검토 점수",
  unavailable_metrics: "미수집 지표",
};

const SORTED_METRIC_KEYS = Object.keys(METRIC_LABELS).sort(
  (a, b) => b.length - a.length
);

function formatSimilarityValue(raw: string): string {
  const n = Number(raw);
  if (!Number.isFinite(n)) return raw;
  if (n <= 1 && n >= 0) return `${Math.round(n * 100)}%`;
  return raw;
}

export function humanizeIntegrityText(text: string): string {
  if (!text?.trim()) return text;

  let out = text;

  // snake_case 변수명 = 값 / : 값
  for (const key of SORTED_METRIC_KEYS) {
    const label = METRIC_LABELS[key];
    const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    out = out.replace(
      new RegExp(`\\b${escaped}\\b\\s*[=:]?\\s*([0-9.]+)`, "gi"),
      (_m, val: string) => `${label} ${formatSimilarityValue(val)}`
    );
    out = out.replace(new RegExp(`\\b${escaped}\\b`, "gi"), label);
  }

  out = out
    .replace(/\bPaste\b/g, "붙여넣기")
    .replace(/\bpaste\b/g, "붙여넣기")
    .replace(/\bAI\b/g, "AI")
    .replace(/\btrue\b/gi, "예")
    .replace(/\bfalse\b/gi, "아니오")
    .replace(/\bms\b/gi, "밀리초")
    .replace(/(\d+)\s*밀리초/g, (_m, n: string) => {
      const sec = Math.round(Number(n) / 1000);
      return sec >= 60
        ? `약 ${Math.floor(sec / 60)}분 ${sec % 60}초`
        : `약 ${sec}초`;
    });

  return out;
}

export function humanizeIntegrityTexts(texts: string[]): string[] {
  return texts.map(humanizeIntegrityText);
}

export function sanitizeAnalysisForDisplay(
  analysis: AnswerIntegrityAnalysis
): AnswerIntegrityAnalysis {
  return {
    ...analysis,
    reasoning_summary: humanizeIntegrityText(analysis.reasoning_summary),
    evidence: humanizeIntegrityTexts(analysis.evidence),
    risk_factors: humanizeIntegrityTexts(analysis.risk_factors),
    paste_assessment: analysis.paste_assessment
      ? sanitizePasteAssessmentForDisplay(analysis.paste_assessment)
      : undefined,
  };
}

export function sanitizePasteAssessmentForDisplay(
  assessment: PasteAssessment
): PasteAssessment {
  return {
    ...assessment,
    summary: humanizeIntegrityText(assessment.summary),
    evidence: humanizeIntegrityTexts(assessment.evidence),
  };
}

/** 접힌 지표 요약 — 교수용 자연어 라벨 */
export function formatMetricsSummaryLines(
  metrics: AnswerIntegrityMetrics
): string[] {
  const { paste, typing, ai_usage, submission } = metrics;
  const lines: string[] = [
    `붙여넣기 ${paste.total_paste_count}회 (외부 ${paste.external_paste_count}회, 앱 내 ${paste.internal_paste_count}회)`,
    `답안 길이 ${submission.answer_length.toLocaleString()}자`,
  ];
  if (paste.ratio_to_final_answer != null) {
    lines.push(
      `답안 대비 외부 붙여넣기 비율 ${(paste.ratio_to_final_answer * 100).toFixed(0)}%`
    );
  }
  if (paste.paste_to_final_answer_similarity_max != null) {
    lines.push(
      `붙여넣은 내용과 최종 답안 일치도 ${(paste.paste_to_final_answer_similarity_max * 100).toFixed(0)}%`
    );
  }
  if (paste.after_last_paste.ms_to_submission != null) {
    lines.push(
      `마지막 붙여넣기 후 제출까지 ${Math.round(paste.after_last_paste.ms_to_submission / 1000)}초`
    );
  }
  lines.push(
    `붙여넣기 후 추가 입력 ${paste.after_last_paste.chars_inserted}자 · 삭제 ${paste.after_last_paste.chars_deleted}자 · 수정 ${paste.after_last_paste.edit_event_count}회`
  );
  if (typing.edit_ratio != null) {
    lines.push(`삭제 비율(수정 정도) ${(typing.edit_ratio * 100).toFixed(0)}%`);
  }
  if (typing.average_chars_per_minute != null) {
    lines.push(`평균 타이핑 속도 ${typing.average_chars_per_minute}자/분`);
  }
  if (ai_usage.ai_to_final_answer_similarity != null) {
    lines.push(
      `최종 답안과 AI 답변 유사도 ${(ai_usage.ai_to_final_answer_similarity * 100).toFixed(0)}%`
    );
  }
  if (typing.sudden_spike_count > 0) {
    lines.push(`비정상적으로 빠른 입력 구간 ${typing.sudden_spike_count}건`);
  }
  return lines;
}
