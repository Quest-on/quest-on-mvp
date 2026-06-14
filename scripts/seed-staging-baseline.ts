/**
 * staging 합성 시드 baseline (G005)
 *
 * staging 전용 Supabase 에 리뷰 가능한 최소 데이터(테스트 강사/학생 계정 + 샘플 시험/세션/
 * 제출/메시지/채점)를 생성한다. prod 데이터는 일절 참조하지 않는 100% 합성 데이터다.
 *
 * 안전 원칙:
 *  - STAGING_* env + STAGING_CONFIRM_PROJECT_REF 필수. 실제 ref 와 불일치면 중단.
 *  - PROD_SUPABASE_REF 가 주어지면 그 ref 를 denylist 로 차단.
 *  - staging 계정은 Supabase Auth Admin API 로 생성. 비밀번호는 env(STAGING_SEED_PASSWORD)로만 주입.
 *  - 모든 시드 row 는 staging-seed 태그(시험 code 'STG-' prefix)로 idempotent cleanup 가능.
 *  - 데이터를 파일로 쓰지 않고 Supabase 에 직접 upsert.
 *
 * 실행:
 *   npx tsx scripts/seed-staging-baseline.ts --dry-run
 *   npx tsx scripts/seed-staging-baseline.ts            # 실제 시드
 *   npx tsx scripts/seed-staging-baseline.ts --cleanup  # 시드 제거
 */
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { assertStagingTarget, assertNotProd } from "@/lib/env-target";

const SEED_EXAM_CODE = "STG-REVIEW-1";
const INSTRUCTOR_EMAIL = "reviewer.instructor+staging@quest-on.invalid";
const STUDENT_EMAIL = "reviewer.student+staging@quest-on.invalid";

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`[seed] 필수 환경변수 누락: ${name}`);
  return v;
}

async function main() {
  const argv = process.argv.slice(2);
  const dryRun = argv.includes("--dry-run");
  const cleanup = argv.includes("--cleanup");

  const url = requireEnv("STAGING_SUPABASE_URL");
  const key = requireEnv("STAGING_SUPABASE_SERVICE_ROLE_KEY");
  const password = requireEnv("STAGING_SEED_PASSWORD");
  const confirmRef = requireEnv("STAGING_CONFIRM_PROJECT_REF");

  // ── 안전 가드 (fail-closed) ──────────────────────────────────────────────
  assertStagingTarget(url, confirmRef);
  if (process.env.PROD_SUPABASE_REF) {
    assertNotProd(url, [process.env.PROD_SUPABASE_REF]);
  }

  console.log(`[seed] mode=${cleanup ? "CLEANUP" : dryRun ? "DRY-RUN" : "SEED"} ref=${confirmRef}`);
  const sb = createClient(url, key, { auth: { persistSession: false } });

  if (cleanup) {
    if (dryRun) {
      console.log(`[seed] (dry-run) 시험 code ${SEED_EXAM_CODE} 및 연관 세션/계정 제거 예정`);
      return;
    }
    await sb.from("exams").delete().eq("code", SEED_EXAM_CODE);
    for (const email of [INSTRUCTOR_EMAIL, STUDENT_EMAIL]) {
      const { data } = await sb.auth.admin.listUsers();
      const u = data?.users.find((x) => x.email === email);
      if (u) await sb.auth.admin.deleteUser(u.id);
    }
    console.log("[seed] cleanup 완료");
    return;
  }

  if (dryRun) {
    console.log("[seed] (dry-run) 생성 예정: instructor/student 계정 2개, 샘플 시험 1개(+문항/세션/제출/메시지/채점)");
    return;
  }

  // 1) reviewer 계정 (Admin API)
  async function ensureUser(email: string, role: string): Promise<string> {
    const { data: created, error } = await sb.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { role, staging_seed: true },
    });
    if (created?.user) return created.user.id;
    if (error && /already/i.test(error.message)) {
      const { data } = await sb.auth.admin.listUsers();
      const u = data?.users.find((x) => x.email === email);
      if (u) return u.id;
    }
    throw new Error(`[seed] 계정 생성 실패(${email}): ${error?.message ?? "unknown"}`);
  }

  const instructorId = await ensureUser(INSTRUCTOR_EMAIL, "instructor");
  const studentId = await ensureUser(STUDENT_EMAIL, "student");

  // 2) 샘플 시험 + 문항
  const examId = randomUUID();
  await sb.from("exams").upsert({
    id: examId,
    title: "[STAGING] 리뷰용 샘플 시험",
    code: SEED_EXAM_CODE,
    duration: 60,
    questions: [{ idx: 0, type: "case", prompt: "샘플 케이스 질문(합성 데이터)" }],
    status: "draft",
    instructor_id: instructorId,
    language: "ko",
  });

  // 3) 세션 + 제출 + 메시지 + 채점
  const sessionId = randomUUID();
  await sb.from("sessions").upsert({
    id: sessionId,
    exam_id: examId,
    student_id: studentId,
    status: "submitted",
  });
  await sb.from("submissions").upsert({
    id: randomUUID(),
    session_id: sessionId,
    q_idx: 0,
    answer: "샘플 학생 답안(합성 데이터)",
  });
  await sb.from("messages").upsert({
    id: randomUUID(),
    session_id: sessionId,
    q_idx: 0,
    role: "user",
    content: "샘플 학생 질문(합성 데이터)",
  });
  await sb.from("grades").upsert({
    id: randomUUID(),
    session_id: sessionId,
    q_idx: 0,
    score: 80,
    comment: "샘플 채점 코멘트(합성 데이터)",
    grade_type: "manual",
  });

  console.log(`[seed] 완료: exam=${SEED_EXAM_CODE} instructor=${INSTRUCTOR_EMAIL} student=${STUDENT_EMAIL}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
