/**
 * 부하/대시보드 테스트용 더미 학생 시드 스크립트
 *
 * 지정한 시험 코드에 랜덤 학생 + 랜덤 답안으로 N명의 "제출 완료" 세션을 채운다.
 * 객관식/OX는 자동채점(grade_type: auto) 결과까지 함께 넣어 실제 제출 직후 상태를 재현한다.
 * 서술형(essay/case)은 미채점 상태로 남겨 강사 채점 흐름을 그대로 둔다.
 *
 * ⚠️  .env.local 의 Supabase(클라우드) 프로젝트에 직접 INSERT 한다.
 *     실제 시험 데이터와 같은 DB이므로, 모든 더미 데이터는 student_id 접두사 `loadtest-` 로 태깅한다.
 *
 * 사용법:
 *   npx tsx scripts/seed-load-test-students.ts <CODE> [count]
 *   npx tsx scripts/seed-load-test-students.ts LIX7BQ 55
 *
 * 정리(태깅된 더미만 삭제):
 *   npx tsx scripts/seed-load-test-students.ts <CODE> --cleanup
 */
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import path from "path";
import crypto from "crypto";
import dotenv from "dotenv";

dotenv.config({ path: path.resolve(__dirname, "../.env.local") });

const TAG = "loadtest-"; // student_id 접두사 — 정리 시 이 접두사로 한 번에 삭제
const CORRECT_BIAS = 0.6; // 객관식/OX에서 정답을 고를 확률 (현실적인 점수 분포용)

// --------------- 인자 파싱 ---------------
const code = process.argv[2];
const isCleanup = process.argv.includes("--cleanup");
const countArg = process.argv[3] && !process.argv[3].startsWith("--") ? Number(process.argv[3]) : 55;

if (!code) {
  console.error("사용법: npx tsx scripts/seed-load-test-students.ts <CODE> [count|--cleanup]");
  process.exit(1);
}

// --------------- 랜덤 데이터 풀 ---------------
const SURNAMES = ["김", "이", "박", "최", "정", "강", "조", "윤", "장", "임", "한", "오", "서", "신", "권", "황", "안", "송", "전", "홍", "유", "고", "문", "양", "손"];
const GIVEN = ["민준", "서연", "도윤", "예은", "시우", "하준", "지호", "주원", "지민", "수아", "지우", "서준", "하은", "지윤", "예준", "유진", "채원", "다은", "현우", "준서", "soyeon", "건우", "서윤", "지아", "은우", "수빈", "정우", "다현", "재윤", "가은"];
const SCHOOLS = ["서울대학교", "연세대학교", "고려대학교", "성균관대학교", "한양대학교", "중앙대학교", "경희대학교", "서강대학교"];
const ESSAY_POOL = [
  "사용성 테스트는 실제 사용자가 과업을 수행하며 겪는 문제를 발견하는 데 목적이 있다. 관찰을 통해 어디서 혼란이나 오류가 생기는지 파악하고, 심각도에 따라 우선순위를 정해 개선안을 도출한 뒤 재테스트로 효과를 검증한다.",
  "A/B 테스트는 두 가지 이상의 대안을 사용자에게 무작위로 노출해 성과 지표 차이를 비교하는 방법이다. 충분한 표본과 통계적 유의성을 확보해야 신뢰할 수 있는 결론을 내릴 수 있다.",
  "정량 지표(과업 완료율, 소요 시간)와 정성 데이터(인터뷰, 관찰 메모)를 함께 활용하면 문제의 규모와 원인을 균형 있게 이해할 수 있다고 생각한다.",
  "유도 질문을 피하고 과거 경험을 구체적으로 회상하도록 묻는 것이 핵심이다. 사용자의 실제 행동과 맥락을 끌어내야 의미 있는 인사이트를 얻을 수 있다.",
  "발견한 문제는 심각도와 영향 범위로 분류해 우선순위를 정하고, 해결 아이디어를 도출한 뒤 다시 테스트하는 반복적 개선 과정을 거쳐야 한다.",
  "사용자 만족도 같은 주관적 지표만으로는 한계가 있으므로, 과업 완료율과 오류율 같은 객관적 지표를 함께 측정해야 한다.",
];

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
function pick<T>(arr: T[]): T {
  return arr[randInt(0, arr.length - 1)];
}

function getSupabase(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 누락 (.env.local 확인)");
    process.exit(1);
  }
  console.log(`→ 대상 Supabase: ${url.replace(/https:\/\/([a-z0-9]+).*/, "$1")} (클라우드 프로젝트)`);
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

async function getExam(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from("exams")
    .select("id, title, code, type, questions")
    .eq("code", code)
    .single();
  if (error || !data) {
    console.error(`시험 코드 "${code}" 조회 실패:`, error?.message);
    process.exit(1);
  }
  return data as { id: string; title: string; type: string; questions: unknown };
}

interface NQ {
  idx: number;
  type: string;
  options?: string[];
  correctOptionIndex?: number;
}
function normalize(questions: unknown): NQ[] {
  if (!Array.isArray(questions)) return [];
  return questions.map((q: Record<string, unknown>, i: number) => ({
    idx: typeof q.idx === "number" ? q.idx : i,
    type: typeof q.type === "string" ? q.type : "essay",
    options: Array.isArray(q.options) ? (q.options as string[]) : undefined,
    correctOptionIndex: typeof q.correctOptionIndex === "number" ? q.correctOptionIndex : undefined,
  }));
}
const isObjective = (t: string) => t === "multiple-choice" || t === "true-false";

// --------------- 정리 모드 ---------------
async function cleanup(supabase: SupabaseClient, examId: string) {
  const { data: sessions } = await supabase
    .from("sessions")
    .select("id")
    .eq("exam_id", examId)
    .like("student_id", `${TAG}%`);
  const ids = (sessions ?? []).map((s: { id: string }) => s.id);
  console.log(`삭제 대상 더미 세션: ${ids.length}개`);
  if (ids.length > 0) {
    // grades/submissions/messages 등은 sessions FK onDelete:Cascade 로 함께 삭제됨
    const { error } = await supabase.from("sessions").delete().in("id", ids);
    if (error) {
      console.error("세션 삭제 실패:", error.message);
      process.exit(1);
    }
  }
  const { error: profErr } = await supabase
    .from("student_profiles")
    .delete()
    .like("student_id", `${TAG}%`);
  if (profErr) console.warn("프로필 삭제 경고:", profErr.message);
  console.log("✅ 정리 완료 (loadtest- 태깅 데이터 삭제)");
}

// --------------- 시드 모드 ---------------
async function seed(supabase: SupabaseClient, exam: { id: string; title: string }, questions: NQ[], count: number) {
  const profiles: Record<string, unknown>[] = [];
  const sessions: Record<string, unknown>[] = [];
  const submissions: Record<string, unknown>[] = [];
  const grades: Record<string, unknown>[] = [];

  const now = Date.now();

  for (let i = 0; i < count; i++) {
    const studentId = `${TAG}${crypto.randomUUID()}`;
    const sessionId = crypto.randomUUID();
    const name = `${pick(SURNAMES)}${pick(GIVEN)}`;

    // 제출 시각을 지난 2시간 내로 분산
    const submittedAt = new Date(now - randInt(0, 120) * 60_000);
    const startedAt = new Date(submittedAt.getTime() - randInt(5, 40) * 60_000);

    profiles.push({
      student_id: studentId,
      name,
      student_number: `20${randInt(21, 24)}${randInt(100000, 999999)}`,
      school: pick(SCHOOLS),
    });

    sessions.push({
      id: sessionId,
      exam_id: exam.id,
      student_id: studentId,
      status: "submitted",
      started_at: startedAt.toISOString(),
      attempt_timer_started_at: startedAt.toISOString(),
      preflight_accepted_at: new Date(startedAt.getTime() - 5_000).toISOString(),
      submitted_at: submittedAt.toISOString(),
      auto_submitted: false,
      used_clarifications: randInt(0, 5),
      is_active: false,
    });

    for (const q of questions) {
      let answer: string;
      if (isObjective(q.type) && q.options && q.options.length > 0) {
        const correct = q.correctOptionIndex ?? -1;
        const chooseCorrect = correct >= 0 && Math.random() < CORRECT_BIAS;
        const idx = chooseCorrect ? correct : randInt(0, q.options.length - 1);
        answer = String(idx);

        // 객관식/OX 자동채점 (결정론적, AI 호출 없음)
        if (correct >= 0) {
          const isRight = idx === correct;
          grades.push({
            session_id: sessionId,
            q_idx: q.idx,
            score: isRight ? 100 : 0,
            grade_type: "auto",
            comment: isRight
              ? `정답입니다. 선택: ${q.options[idx]}`
              : `오답입니다. 선택: ${q.options[idx]} / 정답: ${q.options[correct]}`,
          });
        }
      } else {
        answer = pick(ESSAY_POOL);
      }

      submissions.push({
        session_id: sessionId,
        q_idx: q.idx,
        answer,
      });
    }
  }

  // --------------- 배치 INSERT ---------------
  const chunk = async (table: string, rows: Record<string, unknown>[], size: number, opts?: { upsert?: string }) => {
    for (let i = 0; i < rows.length; i += size) {
      const slice = rows.slice(i, i + size);
      const q = opts?.upsert
        ? supabase.from(table).upsert(slice, { onConflict: opts.upsert })
        : supabase.from(table).insert(slice);
      const { error } = await q;
      if (error) throw new Error(`${table} insert 실패 (offset ${i}): ${error.message}`);
    }
  };

  console.log(`\n시드 시작: 학생 ${count}명 × 문항 ${questions.length}개`);
  await chunk("student_profiles", profiles, 500, { upsert: "student_id" });
  console.log(`  ✓ student_profiles ${profiles.length}건`);
  await chunk("sessions", sessions, 500);
  console.log(`  ✓ sessions ${sessions.length}건`);
  await chunk("submissions", submissions, 1000);
  console.log(`  ✓ submissions ${submissions.length}건`);
  await chunk("grades", grades, 1000);
  console.log(`  ✓ grades(auto) ${grades.length}건`);

  // 최종 세션 수 확인
  const { count: total } = await supabase
    .from("sessions")
    .select("id", { count: "exact", head: true })
    .eq("exam_id", exam.id);
  console.log(`\n✅ 완료. "${exam.title}" 총 세션 수: ${total}개 (더미 ${count}명 추가)`);
  console.log(`   정리하려면: npx tsx scripts/seed-load-test-students.ts ${code} --cleanup`);
}

async function main() {
  const supabase = getSupabase();
  const exam = await getExam(supabase);
  const questions = normalize(exam.questions);
  console.log(`시험: "${exam.title}" (${code}) | 문항 ${questions.length}개`);

  if (isCleanup) {
    await cleanup(supabase, exam.id);
    return;
  }

  if (!Number.isInteger(countArg) || countArg < 1 || countArg > 1000) {
    console.error(`count 값이 올바르지 않습니다: ${countArg} (1~1000)`);
    process.exit(1);
  }
  await seed(supabase, exam, questions, countArg);
}

main().catch((e) => {
  console.error("❌ 오류:", e instanceof Error ? e.message : e);
  process.exit(1);
});
