/**
 * 리서치 과제 종합평가(ai_summary) 재생성 스크립트
 *
 * /api/instructor/generate-summary 의 assignment 분기를 복제하되,
 * system 프롬프트는 buildAssignmentResearchSummarySystemPrompt(개선된 종합평가 프롬프트)를 그대로 쓴다.
 * 새 프롬프트가 "최종 답안 vs 리서치 과정 일관성"을 평가하므로, user 프롬프트에
 * 학생의 채팅 기반 수행 기록 + 최종 제출 답안(final_answer) + 대화 기록을 함께 제공한다.
 *
 * 저장 스키마(리포트가 읽는 형태): { sentiment, summary, strengths[], weaknesses[], keyQuotes[] }
 *
 * ⚠️  실제 학생 데이터. 기존 ai_summary 를 먼저 백업 파일로 저장한 뒤 덮어쓴다.
 *
 * 사용법:
 *   npx tsx scripts/regenerate-assignment-summaries.ts LX4J78
 */
import path from "path";
import fs from "fs";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";
import { buildAssignmentResearchSummarySystemPrompt } from "../lib/prompts";

dotenv.config({ path: path.resolve(__dirname, "../.env.local") });

const MODEL = process.env.AI_MODEL_SUMMARY_SCRIPT || "gpt-4o-mini";
const code = process.argv[2];
if (!code) {
  console.error("사용법: npx tsx scripts/regenerate-assignment-summaries.ts <CODE>");
  process.exit(1);
}

function stripHtml(s: unknown): string {
  return String(s ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

async function main() {
  const supa = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

  const { data: exam, error: examErr } = await supa
    .from("exams")
    .select("id, title, type, questions, rubric")
    .eq("code", code)
    .single();
  if (examErr || !exam) {
    console.error(`과제 "${code}" 조회 실패:`, examErr?.message);
    process.exit(1);
  }
  const questions = Array.isArray(exam.questions) ? (exam.questions as Record<string, unknown>[]) : [];

  const { data: sessions } = await supa
    .from("sessions")
    .select("id, student_id, final_answer, ai_summary, submitted_at")
    .eq("exam_id", exam.id)
    .not("submitted_at", "is", null);
  const targets = sessions ?? [];

  console.log(`과제: "${exam.title}" (${code}) | type: ${exam.type} | 제출 세션: ${targets.length}개 | 모델: ${MODEL}\n`);
  if (targets.length === 0) {
    console.log("대상이 없습니다.");
    return;
  }

  // 기존 ai_summary 백업
  const backupPath = path.resolve(__dirname, `../lx4j78-ai-summary-backup-${Date.now()}.json`);
  fs.writeFileSync(
    backupPath,
    JSON.stringify(
      targets.map((s: { id: string; ai_summary: unknown }) => ({ id: s.id, ai_summary: s.ai_summary })),
      null,
      2,
    ),
  );
  console.log(`기존 ai_summary 백업 → ${backupPath}\n`);

  const systemPrompt = buildAssignmentResearchSummarySystemPrompt();
  const rubricText = Array.isArray(exam.rubric) && exam.rubric.length > 0
    ? (exam.rubric as Record<string, unknown>[]).map((r) => `- ${r.evaluationArea}: ${r.detailedCriteria}`).join("\n")
    : "별도의 루브릭 없음";

  let done = 0;
  let failed = 0;

  for (const s of targets as Array<{ id: string; student_id: string; final_answer: string | null }>) {
    const [{ data: subs }, { data: msgs }] = await Promise.all([
      supa.from("submissions").select("q_idx, answer").eq("session_id", s.id),
      supa.from("messages").select("q_idx, role, content, created_at").eq("session_id", s.id).order("created_at", { ascending: true }),
    ]);

    const msgsByQ: Record<number, Array<{ role: string; content: string }>> = {};
    for (const m of msgs ?? []) (msgsByQ[m.q_idx] ??= []).push({ role: m.role, content: m.content ?? "" });

    const questionsText = questions
      .map((q, i) => {
        const qIdx = (q.idx ?? i) as number;
        const sub = (subs ?? []).find((x: { q_idx: number }) => x.q_idx === qIdx);
        const ms = msgsByQ[qIdx] ?? [];
        const chat = ms.length > 0
          ? `\n\n**학생과 AI의 대화 기록:**\n${ms.map((m) => `${m.role === "user" ? "학생" : "AI"}: ${m.content}`).join("\n\n")}`
          : "";
        return `과제 ${i + 1}: ${q.prompt || q.text}\n\n학생의 채팅 기반 리서치 수행 기록:\n${sub ? sub.answer : "기록 없음"}${chat}`;
      })
      .join("\n\n");

    const finalAnswer = (s.final_answer ?? "").trim();

    const userPrompt = `
과제 제목: ${exam.title}

[평가 루브릭]
${rubricText}

[학생의 채팅 기반 리서치 과정]
${questionsText}

[학생이 작성한 최종 제출 답안]
${finalAnswer || "(작성되지 않음)"}

위 내용을 바탕으로 학생의 리서치 대화 과정과 최종 답안의 일관성을 분석하여 종합평가를 작성해주세요.
반드시 아래 JSON 형식으로만 응답하세요:
{
  "sentiment": "positive" | "negative" | "neutral",
  "summary": "상세한 종합 의견 텍스트",
  "strengths": ["강점1", "강점2", ...],
  "weaknesses": ["개선점1", "개선점2", ...],
  "keyQuotes": ["인용구1", "인용구2"]
}
`;

    try {
      const completion = await openai.chat.completions.create({
        model: MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        response_format: { type: "json_object" },
      });
      const parsed = JSON.parse(completion.choices[0]?.message?.content || "{}");
      if (typeof parsed.summary !== "string" || !parsed.summary.trim()) {
        failed++;
        console.log(`  ✗ ${s.id.slice(0, 8)} summary 비어있음`);
        continue;
      }
      const { error: upErr } = await supa.from("sessions").update({ ai_summary: parsed }).eq("id", s.id);
      if (upErr) {
        failed++;
        console.log(`  ✗ ${s.id.slice(0, 8)} 저장 실패: ${upErr.message}`);
      } else {
        done++;
        console.log(`  ✓ ${s.id.slice(0, 8)} (${stripHtml(parsed.summary).slice(0, 70)}...)`);
      }
    } catch (e) {
      failed++;
      console.log(`  ✗ ${s.id.slice(0, 8)} 예외: ${e instanceof Error ? e.message : e}`);
    }
  }

  console.log(`\n✅ 완료 — 생성 ${done} / 실패 ${failed} / 대상 ${targets.length}`);
  console.log(`   되돌리려면 백업 파일(${path.basename(backupPath)})로 복원하면 됩니다.`);
}

main().catch((e) => {
  console.error("❌ 오류:", e instanceof Error ? e.message : e);
  process.exit(1);
});
