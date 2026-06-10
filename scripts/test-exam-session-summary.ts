/**
 * 시험 세션 종합평가(ai_summary) 프롬프트 로컬 테스트
 *
 * CASE_SUMMARY_PROMPT_VARIANT 또는 --variant 로 프롬프트 선택.
 * OpenAI 1회 호출 후 터미널 출력. 기본은 DB 미저장.
 *
 * 사용법:
 *   npx tsx scripts/test-exam-session-summary.ts <sessionId>
 *   npx tsx scripts/test-exam-session-summary.ts <sessionId> --save
 *   npx tsx scripts/test-exam-session-summary.ts <sessionId> --variant v6
 *   npx tsx scripts/test-exam-session-summary.ts --list <examCode>
 */
import path from "path";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";
import {
  buildCaseSessionSummarySystemPrompt,
  buildCaseSessionSummaryUserPrompt,
  usesSummaryDelegationPreCheckHint,
  type CaseSessionSummaryUserPromptParams,
} from "../lib/prompts/case-session-summary-prompts";
import {
  formatAiDependencyForPrompt,
  formatSummaryScoreLabel,
  buildSummaryDelegationPreCheckHint,
  isCaseQuestion,
  normalizeQuestions,
} from "../lib/grading-helpers";

dotenv.config({ path: path.resolve(__dirname, "../.env.local") });

const MODEL = process.env.AI_MODEL_SUMMARY_SCRIPT || "gpt-4o-mini";
const args = process.argv.slice(2);
const save = args.includes("--save");
const listIdx = args.indexOf("--list");
const variantIdx = args.indexOf("--variant");
const variantArg =
  variantIdx >= 0 && args[variantIdx + 1] ? args[variantIdx + 1] : undefined;
const sessionId =
  listIdx >= 0
    ? undefined
    : args.find(
        (a, i) =>
          !a.startsWith("--") &&
          args[i - 1] !== "--list" &&
          args[i - 1] !== "--variant",
      );
const examCode = listIdx >= 0 ? args[listIdx + 1] : undefined;

function requireEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;
  if (!url || !key) {
    console.error("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 필요 (.env.local)");
    process.exit(1);
  }
  if (!openaiKey) {
    console.error("OPENAI_API_KEY 필요 (.env.local)");
    process.exit(1);
  }
  return {
    supa: createClient(url, key, { auth: { persistSession: false } }),
    openai: new OpenAI({ apiKey: openaiKey }),
  };
}

async function listSessions(examCodeArg: string) {
  const { supa } = requireEnv();
  const { data: exam, error: examErr } = await supa
    .from("exams")
    .select("id, title, code")
    .eq("code", examCodeArg)
    .maybeSingle();
  if (examErr || !exam) {
    console.error(`시험 코드 "${examCodeArg}" 없음:`, examErr?.message);
    process.exit(1);
  }
  const { data: sessions, error } = await supa
    .from("sessions")
    .select("id, student_id, submitted_at, ai_summary")
    .eq("exam_id", exam.id)
    .not("submitted_at", "is", null)
    .order("submitted_at", { ascending: false })
    .limit(20);
  if (error) {
    console.error(error.message);
    process.exit(1);
  }
  console.log(`시험: ${exam.title} (${exam.code})\n`);
  for (const s of sessions ?? []) {
    const hasSummary =
      s.ai_summary &&
      typeof (s.ai_summary as { summary?: string }).summary === "string" &&
      (s.ai_summary as { summary: string }).summary.trim().length > 0;
    console.log(
      `${s.id}  submitted=${s.submitted_at ?? "?"}  summary=${hasSummary ? "yes" : "no"}`,
    );
  }
  console.log("\n테스트: npx tsx scripts/test-exam-session-summary.ts <sessionId>");
}

async function runSummary(sessionIdArg: string) {
  const { supa, openai } = requireEnv();

  if (variantArg) {
    process.env.CASE_SUMMARY_PROMPT_VARIANT = variantArg;
  }
  const variant = process.env.CASE_SUMMARY_PROMPT_VARIANT?.trim() || "v1";
  if (!["v1", "v4", "v5", "v6"].includes(variant)) {
    console.error(`알 수 없는 variant: ${variant} (v1, v4, v5, v6)`);
    process.exit(1);
  }

  const { data: session, error: sessionErr } = await supa
    .from("sessions")
    .select("id, exam_id, student_id, submitted_at")
    .eq("id", sessionIdArg)
    .single();
  if (sessionErr || !session) {
    console.error("세션 조회 실패:", sessionErr?.message);
    process.exit(1);
  }
  if (!session.submitted_at) {
    console.error("제출되지 않은 세션입니다.");
    process.exit(1);
  }

  const { data: exam, error: examErr } = await supa
    .from("exams")
    .select("id, title, questions, rubric, type")
    .eq("id", session.exam_id)
    .single();
  if (examErr || !exam) {
    console.error("시험 조회 실패:", examErr?.message);
    process.exit(1);
  }
  if (exam.type && exam.type !== "exam") {
    console.error("시험(type=exam) 세션이 아닙니다.");
    process.exit(1);
  }

  const questions = normalizeQuestions(exam.questions).filter((q) =>
    isCaseQuestion(q.type),
  );
  if (questions.length === 0) {
    console.error("CASE 문항이 없습니다.");
    process.exit(1);
  }

  const [{ data: submissions }, { data: messages }, { data: grades }] = await Promise.all([
    supa.from("submissions").select("q_idx, answer").eq("session_id", sessionIdArg),
    supa
      .from("messages")
      .select("q_idx, role, content, created_at")
      .eq("session_id", sessionIdArg)
      .order("created_at", { ascending: true }),
    supa
      .from("grades")
      .select("q_idx, score, comment, stage_grading, grade_type")
      .eq("session_id", sessionIdArg),
  ]);

  const submissionsByQuestion: Record<number, { answer: string }> = {};
  for (const sub of submissions ?? []) {
    submissionsByQuestion[sub.q_idx] = { answer: sub.answer ?? "" };
  }

  const messagesByQuestion: Record<number, Array<{ role: string; content: string }>> = {};
  for (const msg of messages ?? []) {
    if (!messagesByQuestion[msg.q_idx]) messagesByQuestion[msg.q_idx] = [];
    messagesByQuestion[msg.q_idx].push({
      role: msg.role,
      content: msg.content ?? "",
    });
  }

  const gradeRows = (grades ?? []).map((g) => ({
    q_idx: g.q_idx,
    score: g.score ?? 0,
    ungraded: false,
    stage_grading: g.stage_grading as {
      chat?: { score?: number; ai_dependency?: unknown };
      answer?: { score?: number };
    } | null,
  }));

  const rubricText =
    exam.rubric && Array.isArray(exam.rubric) && exam.rubric.length > 0
      ? `
[평가 루브릭]
${(
  exam.rubric as Array<{ evaluationArea: string; detailedCriteria: string }>
).map((item, index) => `${index + 1}. ${item.evaluationArea}\n   - 세부 기준: ${item.detailedCriteria}`).join("\n")}
`
      : "";

  const questionsText = questions
    .map((q) => {
      const qIdx = q.idx;
      const submission = submissionsByQuestion[qIdx];
      const grade = gradeRows.find((g) => g.q_idx === qIdx);
      const questionMessages = messagesByQuestion[qIdx] || [];
      const chatHistoryText =
        questionMessages.length > 0
          ? `\n\n**학생과 AI의 대화 기록:**\n${questionMessages
              .map((msg) => `${msg.role === "user" ? "학생" : "AI"}: ${msg.content}`)
              .join("\n\n")}`
          : "";

      return `문제 ${qIdx + 1}:
${q.prompt || ""}

답안:
${submission?.answer || "답안 없음"}
${chatHistoryText}

점수: ${formatSummaryScoreLabel({
        score: grade?.score,
        ungraded: grade?.ungraded,
        hasSubmission: !!submission,
        questionType: q.type,
        isAssignment: false,
      })}
${grade?.stage_grading?.chat ? `채팅 단계 점수: ${grade.stage_grading.chat.score}점` : ""}
${grade?.stage_grading?.answer ? `답안 단계 점수: ${grade.stage_grading.answer.score}점` : ""}
${
  grade?.stage_grading?.chat?.ai_dependency
    ? `AI 활용/의존 신호:\n${formatAiDependencyForPrompt(
        grade.stage_grading.chat.ai_dependency as Parameters<
          typeof formatAiDependencyForPrompt
        >[0],
      )}`
    : ""
}
`;
    })
    .join("\n---\n\n");

  const summaryUserMessages = questions.flatMap((q) =>
    (messagesByQuestion[q.idx] || [])
      .filter((m) => m.role === "user")
      .map((m) => m.content),
  );

  const userPromptParams: CaseSessionSummaryUserPromptParams = {
    examTitle: exam.title,
    rubricText,
    questionsText,
    ...(usesSummaryDelegationPreCheckHint()
      ? {
          delegationPreCheckHint:
            buildSummaryDelegationPreCheckHint(summaryUserMessages),
        }
      : {}),
  };

  const systemPrompt = buildCaseSessionSummarySystemPrompt();
  const userPrompt = buildCaseSessionSummaryUserPrompt(userPromptParams);

  console.log(
    `→ 모델: ${MODEL} | variant: ${variant} | 세션: ${sessionIdArg} | CASE 문항: ${questions.length}개`,
  );
  console.log("→ OpenAI 호출 중...\n");

  const completion = await openai.chat.completions.create({
    model: MODEL,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    response_format: { type: "json_object" },
  });

  const raw = completion.choices[0]?.message?.content ?? "{}";
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    console.error("JSON 파싱 실패:\n", raw);
    process.exit(1);
  }

  console.log(JSON.stringify(parsed, null, 2));

  const p = parsed as {
    strengths?: string[];
    weaknesses?: string[];
  };
  console.log(
    `\n→ 강점 ${p.strengths?.length ?? 0}개, 개선점 ${p.weaknesses?.length ?? 0}개`,
  );

  if (save) {
    const { error: updErr } = await supa
      .from("sessions")
      .update({ ai_summary: parsed })
      .eq("id", sessionIdArg);
    if (updErr) {
      console.error("DB 저장 실패:", updErr.message);
      process.exit(1);
    }
    console.log("→ sessions.ai_summary 저장 완료 (--save)");
  } else {
    console.log("\n(DB 미저장. 저장하려면 동일 명령에 --save 추가)");
  }
}

async function main() {
  if (listIdx >= 0) {
    if (!examCode) {
      console.error("사용법: npx tsx scripts/test-exam-session-summary.ts --list <examCode>");
      process.exit(1);
    }
    await listSessions(examCode);
    return;
  }
  if (!sessionId) {
    console.error(`사용법:
  npx tsx scripts/test-exam-session-summary.ts <sessionId>
  npx tsx scripts/test-exam-session-summary.ts <sessionId> --save
  npx tsx scripts/test-exam-session-summary.ts <sessionId> --variant v4
  npx tsx scripts/test-exam-session-summary.ts <sessionId> --variant v5
  npx tsx scripts/test-exam-session-summary.ts <sessionId> --variant v6
  npx tsx scripts/test-exam-session-summary.ts --list <examCode>`);
    process.exit(1);
  }
  await runSummary(sessionId);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
