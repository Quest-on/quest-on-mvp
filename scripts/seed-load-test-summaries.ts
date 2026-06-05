/**
 * 부하/대시보드 테스트용 더미 학생의 "종합평가(sessions.ai_summary)" 채우기 스크립트
 *
 * 강사용 종합평가 생성 라우트(/api/instructor/generate-summary)와 동일한
 * 시스템 프롬프트 규칙(buildSummaryGenerationSystemPrompt) + user 프롬프트 구성을 그대로 재사용해,
 * 각 더미 학생의 실제 시험 데이터(답안 + 채팅 + 객관식)를 근거로 종합평가를 생성한다.
 * 모델만 경량 gpt-4o-mini 로 바꿔 비용을 낮춘다.
 *
 * 저장 스키마(리포트 ReportCardTemplate 가 읽는 형태):
 *   { sentiment, summary, strengths[], weaknesses[], keyQuotes[] }
 *
 * ⚠️  .env.local 의 클라우드 Supabase 에 직접 쓴다. loadtest- 태깅 세션만 대상.
 *     OpenAI 호출 발생(학생당 1콜). 동시성 낮게(4) + 재시도(2).
 *
 * 사용법:
 *   npx tsx scripts/seed-load-test-summaries.ts LIX7BQ            # 기존 ai_summary 있으면 건너뜀
 *   npx tsx scripts/seed-load-test-summaries.ts LIX7BQ --force    # 전부 재생성
 */
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import OpenAI from "openai";
import path from "path";
import dotenv from "dotenv";
import { buildSummaryGenerationSystemPrompt } from "../lib/prompts";

dotenv.config({ path: path.resolve(__dirname, "../.env.local") });

const TAG = "loadtest-";
const MODEL = process.env.AI_MODEL_SUMMARY_SCRIPT || "gpt-4o-mini";
const CONCURRENCY = 4;
const MAX_RETRY = 2;

const code = process.argv[2];
const force = process.argv.includes("--force");
if (!code) {
  console.error("사용법: npx tsx scripts/seed-load-test-summaries.ts <CODE> [--force]");
  process.exit(1);
}

function getSupabase(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 누락 (.env.local)");
    process.exit(1);
  }
  console.log(`→ Supabase: ${url.replace(/https:\/\/([a-z0-9]+).*/, "$1")} | 모델: ${MODEL}`);
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

function getOpenAI(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error("OPENAI_API_KEY 누락 (.env.local)");
    process.exit(1);
  }
  return new OpenAI({ apiKey });
}

type ExamRow = {
  id: string;
  title: string;
  questions: Record<string, unknown>[];
  rubric: unknown;
  type: string | null;
};

/** /api/instructor/generate-summary 의 user 프롬프트 구성을 동일하게 재현 (exam 경로) */
function buildUserPrompt(
  exam: ExamRow,
  submissions: Array<{ q_idx: number; answer: string }>,
  messagesByQ: Record<number, Array<{ role: string; content: string }>>,
): string {
  const questionsText = exam.questions
    .map((q, i) => {
      const qIdx = (q.idx ?? i) as number;
      const sub = submissions.find((s) => s.q_idx === qIdx);
      const msgs = messagesByQ[qIdx] ?? [];
      const chatText =
        msgs.length > 0
          ? `\n\n**학생과 AI의 대화 기록:**\n${msgs
              .map((m) => `${m.role === "user" ? "학생" : "AI"}: ${m.content}`)
              .join("\n\n")}`
          : "";
      return `문제 ${i + 1}: ${q.prompt || q.text}\n학생 답안: ${sub ? sub.answer : "답안 없음"}${chatText}`;
    })
    .join("\n\n");

  const rubricText = Array.isArray(exam.rubric)
    ? (exam.rubric as Record<string, unknown>[])
        .map((r) => `- ${r.evaluationArea}: ${r.detailedCriteria}`)
        .join("\n")
    : "별도의 루브릭 없음";

  return `
시험 제목: ${exam.title}

[평가 루브릭]
${rubricText}

[학생의 답안]
${questionsText}

위 내용을 바탕으로 학생의 전체적인 수행 능력을 상세하게 분석하여 요약 평가해주세요.
다음 항목을 반드시 포함해야 합니다:
1. 전체적인 평가 (긍정적/부정적/중립적)
2. 종합 의견: 학생의 답안 전반에 대한 깊이 있는 분석. 답안의 논리성, 정확성, 창의성 등을 종합적으로 고려하세요.
3. 주요 강점 (3가지 이내): 구체적인 예시를 들어 설명하세요.
4. 개선이 필요한 점 (3가지 이내): 구체적인 개선 방안과 함께 제시하세요.
5. 핵심 인용구 (2가지): 학생의 답안 또는 채팅 대화 중 평가에 결정적인 영향을 미친 문장이나 구절을 2개 뽑아주세요.

JSON 형식으로 응답해주세요:
{
  "sentiment": "positive" | "negative" | "neutral",
  "summary": "상세한 종합 의견 텍스트",
  "strengths": ["강점1", "강점2", ...],
  "weaknesses": ["약점1", "약점2", ...],
  "keyQuotes": ["인용구1", "인용구2"]
}
`;
}

async function generateOne(
  openai: OpenAI,
  systemPrompt: string,
  userPrompt: string,
): Promise<Record<string, unknown> | null> {
  for (let attempt = 0; attempt <= MAX_RETRY; attempt++) {
    try {
      const completion = await openai.chat.completions.create({
        model: MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        response_format: { type: "json_object" },
      });
      const raw = completion.choices[0]?.message?.content || "{}";
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      if (typeof parsed.summary === "string" && parsed.summary.trim().length > 0) {
        return parsed;
      }
      // summary 비어있으면 재시도
    } catch (err) {
      if (attempt === MAX_RETRY) {
        console.warn("  생성 실패:", err instanceof Error ? err.message : err);
        return null;
      }
      await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
    }
  }
  return null;
}

async function main() {
  const supabase = getSupabase();
  const openai = getOpenAI();

  const { data: exam, error: examErr } = await supabase
    .from("exams")
    .select("id, title, questions, rubric, type")
    .eq("code", code)
    .single();
  if (examErr || !exam) {
    console.error(`시험 "${code}" 조회 실패:`, examErr?.message);
    process.exit(1);
  }
  const examRow = exam as ExamRow;
  const systemPrompt = buildSummaryGenerationSystemPrompt();

  const { data: sessions, error: sErr } = await supabase
    .from("sessions")
    .select("id, ai_summary")
    .eq("exam_id", examRow.id)
    .like("student_id", `${TAG}%`);
  if (sErr) {
    console.error("세션 조회 실패:", sErr.message);
    process.exit(1);
  }

  const all = sessions ?? [];
  const targets = force
    ? all
    : all.filter((s: { ai_summary: unknown }) => {
        const sum = s.ai_summary as { summary?: unknown } | null;
        return !(sum && typeof sum.summary === "string" && sum.summary.trim().length > 0);
      });

  console.log(`시험: "${examRow.title}" (${code}) | 더미 세션 ${all.length}개, 생성 대상 ${targets.length}개\n`);
  if (targets.length === 0) {
    console.log("생성할 대상이 없습니다. (--force 로 전체 재생성 가능)");
    return;
  }

  let done = 0;
  let failed = 0;

  // 동시성 풀
  let cursor = 0;
  async function worker(workerId: number) {
    void workerId;
    while (cursor < targets.length) {
      const idx = cursor++;
      const sess = targets[idx] as { id: string };

      const [{ data: subs }, { data: msgs }] = await Promise.all([
        supabase.from("submissions").select("q_idx, answer").eq("session_id", sess.id),
        supabase
          .from("messages")
          .select("q_idx, role, content, created_at")
          .eq("session_id", sess.id)
          .order("created_at", { ascending: true }),
      ]);

      const messagesByQ: Record<number, Array<{ role: string; content: string }>> = {};
      for (const m of msgs ?? []) {
        (messagesByQ[m.q_idx] ??= []).push({ role: m.role, content: m.content ?? "" });
      }

      const userPrompt = buildUserPrompt(
        examRow,
        (subs ?? []) as Array<{ q_idx: number; answer: string }>,
        messagesByQ,
      );

      const result = await generateOne(openai, systemPrompt, userPrompt);
      if (!result) {
        failed++;
        process.stdout.write("✗");
        continue;
      }

      const { error: upErr } = await supabase
        .from("sessions")
        .update({ ai_summary: result })
        .eq("id", sess.id);
      if (upErr) {
        failed++;
        process.stdout.write("✗");
      } else {
        done++;
        process.stdout.write(".");
      }
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, (_, i) => worker(i)));

  console.log(`\n\n✅ 완료 — 생성 ${done}건, 실패 ${failed}건 / 대상 ${targets.length}건`);
  if (failed > 0) console.log("   실패분은 다시 실행하면 됩니다(기존 성공분은 건너뜀).");
}

main().catch((e) => {
  console.error("❌ 오류:", e instanceof Error ? e.message : e);
  process.exit(1);
});
