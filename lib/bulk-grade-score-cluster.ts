/**
 * Detect and fix bulk-grade score clustering (e.g. everyone gets 85).
 * Per-student workers grade in isolation, so models often pick the same "good" score.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { getOpenAI } from "@/lib/openai";
import {
  applyProfileToChatBody,
  resolveAiTaskProfile,
  validatePinnedProfile,
} from "@/lib/ai-task-profile";
import { callTrackedChatCompletion, buildAiTextMetadata } from "@/lib/ai-tracking";
import { logError } from "@/lib/logger";
import {
  asStringArray,
  getBulkGradableQuestions,
  loadSingleStudentCaseData,
  parseGradesFromAiResponse,
  type ProposedGradesMap,
} from "@/lib/bulk-grading";
import {
  formatScoreRangeGuidance,
  type ExtractedCriteria,
  type GradingScoreRange,
  type PromptLanguage,
} from "@/lib/prompts";
import { stripEmoji } from "@/lib/sanitize";

/**
 * 강사가 인터뷰에서 확정한 점수 범위(min/max)로 점수를 강제한다.
 * 범위 미지정 시 기본 0~100. 원본 채점 경로와 재보정 경로가 동일 clamp 를 공유해,
 * AI 가 지시를 무시하고 범위 밖 점수를 내도 학생 성적에 그대로 저장되지 않게 한다.
 */
export function clampScore(score: number, range?: GradingScoreRange): number {
  const min = range?.min ?? 0;
  const max = range?.max ?? 100;
  return Math.min(max, Math.max(min, Math.round(score)));
}

export function buildScoreAntiClusterBlock(
  language: PromptLanguage,
  scoreRange?: GradingScoreRange,
): string {
  const rangeHint = scoreRange
    ? language === "en"
      ? `Every score must stay within ${scoreRange.min}–${scoreRange.max}.`
      : `모든 점수는 ${scoreRange.min}~${scoreRange.max}점 안이어야 합니다.`
    : language === "en"
      ? "Use the instructor's min/max — no default score."
      : "강사 min/max만 따르세요. 기본 점수 없음.";

  if (language === "en") {
    return `
**Scoring discipline (mandatory):**
- Follow the instructor interview criteria verbatim. Do NOT invent a rubric or pick a habitual round number.
- ${rangeHint}
- One student per call — still differentiate; similar answers should NOT get identical scores unless the instructor said so.
- If unsure, choose the lower defensible score inside the range.
- Comments must cite concrete evidence from the answer/chat.`.trim();
  }

  return `
**채점 규율 (필수):**
- 강사 인터뷰 기준을 그대로 따르세요. 임의 루브릭·습관적 고정 점수 금지.
- ${rangeHint}
- 한 명씩 채점해도 차등 필수 — 비슷한 답에 같은 점수 남발 금지(강사가 같게 하라고 한 경우 제외).
- 애매하면 범위 안에서 낮은 쪽.
- comment에는 답안/대화의 구체적 근거를 적으세요.`.trim();
}

export type ClusterAnalysis = {
  needsRecalibration: boolean;
  scores: number[];
  reason?: string;
};

/** True when scores are suspiciously identical (e.g. 85,85,85,86). */
export function analyzeScoreClustering(scores: number[]): ClusterAnalysis {
  const valid = scores.filter((s) => Number.isFinite(s));
  if (valid.length < 3) {
    return { needsRecalibration: false, scores: valid };
  }

  const mean = valid.reduce((a, b) => a + b, 0) / valid.length;
  const variance =
    valid.reduce((acc, s) => acc + (s - mean) ** 2, 0) / valid.length;
  const stdev = Math.sqrt(variance);

  const rounded = valid.map((s) => Math.round(s));
  const counts = new Map<number, number>();
  for (const s of rounded) {
    counts.set(s, (counts.get(s) ?? 0) + 1);
  }
  const maxCount = Math.max(...counts.values());
  const modeShare = maxCount / valid.length;

  if (stdev < 4) {
    return {
      needsRecalibration: true,
      scores: valid,
      reason: `stdev=${stdev.toFixed(1)}`,
    };
  }
  if (modeShare >= 0.6 && maxCount >= 3) {
    return {
      needsRecalibration: true,
      scores: valid,
      reason: `mode_share=${(modeShare * 100).toFixed(0)}%`,
    };
  }

  return { needsRecalibration: false, scores: valid };
}

function buildRecalibrationPrompt(params: {
  criteria: ExtractedCriteria;
  caseQuestions: Array<{ qIdx: number; questionPrompt: string }>;
  students: Array<{
    sessionId: string;
    studentName: string;
    answers: Array<{ qIdx: number; answer: string; chatSummary: string }>;
    currentScore: number;
    currentComment: string;
  }>;
  qIdx: number;
  language: PromptLanguage;
  isAssignment: boolean;
}): string {
  const { criteria, caseQuestions, students, qIdx, language, isAssignment } = params;
  const question = caseQuestions.find((q) => q.qIdx === qIdx);
  const scoreGuidance = formatScoreRangeGuidance(criteria.score_range, language);

  const studentBlocks = students
    .map((s, i) => {
      const ans = s.answers.find((a) => a.qIdx === qIdx);
      return `[Student ${i + 1}] session_id=${s.sessionId}
Name: ${s.studentName}
Current score: ${s.currentScore}
Current comment: ${s.currentComment}
Answer: ${(ans?.answer ?? "").slice(0, 2500)}
${isAssignment ? `Chat: ${(ans?.chatSummary ?? "").slice(0, 1500)}` : ""}`;
    })
    .join("\n\n---\n\n");

  if (language === "en") {
    return `
You recalibrate bulk grades because initial per-student scoring clustered too tightly (often all ~85).

**Criteria:** ${criteria.criteria_summary}
**Score distribution:** ${scoreGuidance}

**Question (q_idx=${qIdx}):** ${question?.questionPrompt ?? ""}

**Students with current scores:**
${studentBlocks}

Re-score ALL students comparatively. Spread scores across the instructor's range — do NOT keep everyone at 85.
Output ONLY JSON:
{"grades":[{"session_id":"...","q_idx":${qIdx},"score":0,"comment":"..."}, ...]}
Include every session_id listed above exactly once.`.trim();
  }

  return `
1차 가채점 점수가 지나치게 몰렸습니다(대개 85점대). **상대 비교**로 다시 채점하세요.

**채점 기준:** ${criteria.criteria_summary}
**점수 분포:** ${scoreGuidance}

**문항 (q_idx=${qIdx}):** ${question?.questionPrompt ?? ""}

**학생별 현재 점수:**
${studentBlocks}

전원 85점대로 두지 말고, 강사 Range 안에서 **차등**을 주세요.
JSON만 출력:
{"grades":[{"session_id":"...","q_idx":${qIdx},"score":0,"comment":"..."}, ...]}
위 session_id를 빠짐없이 1회씩 포함하세요.`.trim();
}

/**
 * After bulk grading completes, if scores cluster, run one comparative recalibration pass.
 */
export async function recalibrateBulkGradesIfClustered(
  supabase: SupabaseClient,
  gradingSessionId: string,
  examId: string,
): Promise<boolean> {
  const { data: sessionRow, error } = await supabase
    .from("exam_grading_sessions")
    .select("proposed_grades, grading_criteria, expected_session_ids, status, ai_config_version_id, ai_profile_snapshot, exams!inner(questions, language, type)")
    .eq("id", gradingSessionId)
    .eq("exam_id", examId)
    .single();

  if (error || !sessionRow || sessionRow.status !== "grading_done") {
    return false;
  }

  // 재보정도 같은 런의 일부다. 런에 고정된 프로필이 있으면 그걸 쓰고, 없으면
  // (레거시 런) 코드 기본값으로 해석한다. 라벨을 새로 읽으면 런 안에서 설정이 갈린다.
  const pinnedCluster = (sessionRow.ai_profile_snapshot as Record<string, unknown> | null)?.
    bulk_grading_score_cluster;
  const clusterProfile = pinnedCluster
    ? validatePinnedProfile("bulk_grading_score_cluster", pinnedCluster)
    : resolveAiTaskProfile({ task: "bulk_grading_score_cluster" }).profile;

  let criteria: ExtractedCriteria;
  try {
    criteria = JSON.parse(sessionRow.grading_criteria as string) as ExtractedCriteria;
  } catch {
    return false;
  }

  const proposed = (sessionRow.proposed_grades ?? {}) as ProposedGradesMap;
  const sessionIds = asStringArray(sessionRow.expected_session_ids);
  if (sessionIds.length < 3) return false;

  type ExamRow = { questions: unknown; language: string | null; type: string | null };
  const exam = sessionRow.exams as unknown as ExamRow;
  const caseQuestions = getBulkGradableQuestions({ type: exam.type, questions: exam.questions });
  if (caseQuestions.length === 0) return false;

  const language: PromptLanguage = exam.language === "en" ? "en" : "ko";
  const isAssignment = exam.type === "assignment";

  let anyRecalibrated = false;

  for (const q of caseQuestions) {
    const scoresForQ = sessionIds
      .map((sid) => proposed[sid]?.[q.qIdx]?.score)
      .filter((s): s is number => typeof s === "number");

    const analysis = analyzeScoreClustering(scoresForQ);
    if (!analysis.needsRecalibration) continue;

    const students = await Promise.all(
      sessionIds.map(async (sid) => {
        const data = await loadSingleStudentCaseData(supabase, sid, [q.qIdx], isAssignment);
        const grade = proposed[sid]?.[q.qIdx];
        return {
          sessionId: sid,
          studentName: data.studentName,
          answers: data.answers,
          currentScore: grade?.score ?? 0,
          currentComment: grade?.comment ?? "",
        };
      }),
    );

    const prompt = buildRecalibrationPrompt({
      criteria,
      caseQuestions,
      students,
      qIdx: q.qIdx,
      language,
      isAssignment,
    });

    try {
      const tracked = await callTrackedChatCompletion(
        () =>
          getOpenAI().chat.completions.create(
            applyProfileToChatBody(clusterProfile, {
              messages: [{ role: "system" as const, content: prompt }],
              response_format: { type: "json_object" as const },
            }),
            { timeout: clusterProfile.timeoutMs, maxRetries: clusterProfile.maxRetries }
          ),
        {
          feature: "bulk_grading_score_cluster",
          route: "lib/bulk-grade-score-cluster",
          model: clusterProfile.model,
          configVersion: (sessionRow.ai_config_version_id as string | null) ?? null,
          examId,
          metadata: buildAiTextMetadata({ inputText: [prompt] }),
        },
        {
          metadataBuilder: (result) =>
            buildAiTextMetadata({
              outputText:
                (result as { choices?: Array<{ message?: { content?: string | null } }> })
                  .choices?.[0]?.message?.content ?? null,
            }),
        },
      );

      const content = tracked.data.choices[0]?.message?.content?.trim() ?? "";
      const validIds = new Set(sessionIds);
      const parsed = parseGradesFromAiResponse(content, validIds, new Set([q.qIdx]));

      if (!parsed || parsed.length < sessionIds.length) continue;

      const newScores = parsed.map((g) => g.score);
      const after = analyzeScoreClustering(newScores);
      if (after.needsRecalibration) {
        continue;
      }

      for (const g of parsed) {
        if (!proposed[g.session_id]) proposed[g.session_id] = {};
        proposed[g.session_id][g.q_idx] = {
          score: clampScore(g.score, criteria.score_range),
          comment: stripEmoji(g.comment).trim(),
        };
      }
      anyRecalibrated = true;
    } catch (err) {
      logError("bulk-grade recalibration failed", err, {
        path: "lib/bulk-grade-score-cluster.ts",
        additionalData: { gradingSessionId, qIdx: q.qIdx },
      });
    }
  }

  if (!anyRecalibrated) return false;

  await supabase
    .from("exam_grading_sessions")
    .update({ proposed_grades: proposed, updated_at: new Date().toISOString() })
    .eq("id", gradingSessionId);

  return true;
}
