/**
 * Capture actual Quest-On product screens for presentation guide.
 * Creates test accounts via Clerk, signs in, seeds exam data, captures screenshots.
 */
import { createClerkClient } from '@clerk/backend';
import { createClient } from '@supabase/supabase-js';
import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import crypto from 'crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const BASE = 'http://localhost:3000';
const OUT = path.resolve(__dirname, '../test-results/product-screens');
fs.mkdirSync(OUT, { recursive: true });

// --- Clients ---
const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

const TEST_EMAIL_STUDENT = `qtest.student.${Date.now()}@gmail.com`;
const TEST_EMAIL_INSTRUCTOR = `qtest.instructor.${Date.now()}@gmail.com`;
const TEST_PASSWORD = 'QuestOn_Test_2026!';

let studentClerkId = null;
let instructorClerkId = null;

// --- Helpers ---
function uuid() { return crypto.randomUUID(); }
function examCode() {
  const a = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from(crypto.randomBytes(6), b => a[b % a.length]).join('');
}

async function screenshot(page, name) {
  const p = path.join(OUT, `${name}.png`);
  await page.screenshot({ path: p, fullPage: false });
  console.log(`  ✓ ${name}.png`);
}

// --- Clerk User Management ---
async function createTestUsers() {
  console.log('\n📋 Creating test accounts via Clerk...');

  try {
    const student = await clerk.users.createUser({
      emailAddress: [TEST_EMAIL_STUDENT],
      password: TEST_PASSWORD,
      firstName: '김',
      lastName: '테스트',
      skipPasswordChecks: true,
    });
    studentClerkId = student.id;
    console.log(`  ✓ Student: ${TEST_EMAIL_STUDENT} (${studentClerkId})`);
  } catch (e) {
    console.error(`  ✗ Student creation failed:`, JSON.stringify(e.errors || e.message, null, 2));
    throw e;
  }

  try {
    const instructor = await clerk.users.createUser({
      emailAddress: [TEST_EMAIL_INSTRUCTOR],
      password: TEST_PASSWORD,
      firstName: '이',
      lastName: '교수',
      skipPasswordChecks: true,
    });
    instructorClerkId = instructor.id;
    console.log(`  ✓ Instructor: ${TEST_EMAIL_INSTRUCTOR} (${instructorClerkId})`);
  } catch (e) {
    console.error(`  ✗ Instructor creation failed:`, JSON.stringify(e.errors || e.message, null, 2));
    throw e;
  }
}

async function setUserRole(clerkId, role) {
  await clerk.users.updateUser(clerkId, {
    unsafeMetadata: { role },
  });
  console.log(`  ✓ Set ${role} role for ${clerkId}`);
}

async function cleanupTestUsers() {
  console.log('\n🧹 Cleaning up test accounts...');
  try {
    if (studentClerkId) {
      await clerk.users.deleteUser(studentClerkId);
      console.log(`  ✓ Deleted student ${studentClerkId}`);
    }
    if (instructorClerkId) {
      await clerk.users.deleteUser(instructorClerkId);
      console.log(`  ✓ Deleted instructor ${instructorClerkId}`);
    }
  } catch (e) {
    console.warn(`  ⚠ Cleanup warning: ${e.message}`);
  }
}

// --- Seed Exam Data ---
async function seedExamData() {
  console.log('\n📝 Seeding exam data...');
  const code = examCode();
  const examId = uuid();
  const now = new Date().toISOString();

  const { error: examErr } = await supabase.from('exams').insert({
    id: examId,
    title: '경영학원론 중간고사',
    code,
    status: 'running',
    instructor_id: instructorClerkId,
    duration: 60,
    started_at: now,
    questions: [
      {
        id: 'q-0', idx: 0, type: 'essay',
        text: '디지털 전환(Digital Transformation)이 기업 경쟁력에 미치는 영향을 설명하고, 성공적인 디지털 전환을 위한 핵심 요소 3가지를 논하시오.',
        prompt: '디지털 전환(Digital Transformation)이 기업 경쟁력에 미치는 영향을 설명하고, 성공적인 디지털 전환을 위한 핵심 요소 3가지를 논하시오.',
        ai_context: '경영학원론 디지털 전환 단원. 기업 사례 중심으로 답변 유도.',
      },
      {
        id: 'q-1', idx: 1, type: 'essay',
        text: 'SWOT 분석의 개념과 각 요소를 설명하고, 실제 기업 사례를 들어 SWOT 분석을 수행하시오.',
        prompt: 'SWOT 분석의 개념과 각 요소를 설명하고, 실제 기업 사례를 들어 SWOT 분석을 수행하시오.',
        ai_context: '경영전략 단원. SWOT 프레임워크 적용 능력 평가.',
      },
      {
        id: 'q-2', idx: 2, type: 'essay',
        text: '마이클 포터의 5가지 경쟁요인(Five Forces) 모델을 설명하시오.',
        prompt: '마이클 포터의 5가지 경쟁요인(Five Forces) 모델을 설명하시오.',
        ai_context: '산업 분석 프레임워크.',
      },
    ],
    rubric: [
      { evaluationArea: '디지털 전환 이해도', detailedCriteria: '디지털 전환의 정의, 영향, 핵심 요소를 명확히 설명' },
      { evaluationArea: 'SWOT 분석 적용력', detailedCriteria: 'SWOT 4요소를 정확히 설명하고 실제 기업에 적용' },
      { evaluationArea: '5 Forces 이해도', detailedCriteria: '포터의 5가지 경쟁요인을 정확히 나열하고 설명' },
    ],
  });
  if (examErr) throw new Error(`Exam seed failed: ${examErr.message}`);

  // Create exam_node for instructor drive
  await supabase.from('exam_nodes').insert({
    id: uuid(), instructor_id: instructorClerkId,
    parent_id: null, kind: 'exam', name: '경영학원론 중간고사',
    exam_id: examId, sort_order: 0,
  });

  // Create student profile
  await supabase.from('student_profiles').upsert({
    student_id: studentClerkId,
    name: '김테스트',
    student_number: '2024-12345',
    school: '고려대학교',
  }, { onConflict: 'student_id' });

  // Create session (in_progress state for exam screenshots)
  const sessionId = uuid();
  await supabase.from('sessions').insert({
    id: sessionId,
    exam_id: examId,
    student_id: studentClerkId,
    status: 'in_progress',
    started_at: now,
    preflight_accepted_at: now,
    attempt_timer_started_at: now,
  });

  // Seed some chat messages
  await supabase.from('messages').insert([
    {
      id: uuid(), session_id: sessionId, q_idx: 0, role: 'assistant',
      content: '안녕하세요! 이 문제에 대해 궁금한 점이 있으면 자유롭게 질문해주세요.',
    },
    {
      id: uuid(), session_id: sessionId, q_idx: 0, role: 'user',
      content: '디지털 전환의 핵심 요소가 뭐야?',
    },
    {
      id: uuid(), session_id: sessionId, q_idx: 0, role: 'assistant',
      content: '디지털 전환의 핵심 요소를 정리해볼게요.\n\n일반적으로 다음 세 가지 관점에서 접근할 수 있습니다:\n1. **기술적 인프라** — 클라우드, 데이터 분석 등\n2. **조직 문화** — 변화 수용, 디지털 리터러시\n3. **리더십과 전략** — 경영진의 비전과 로드맵\n\n어떤 측면에서 더 깊이 알아보고 싶으신가요?',
    },
    {
      id: uuid(), session_id: sessionId, q_idx: 0, role: 'user',
      content: '조직 문화 관점에서 더 자세히 알려줘',
    },
  ]);

  // Seed a partial answer
  await supabase.from('submissions').insert({
    id: uuid(), session_id: sessionId, q_idx: 0,
    answer: '<p>디지털 전환은 기업이 디지털 기술을 활용하여 비즈니스 모델, 운영 프로세스, 고객 경험을 근본적으로 변화시키는 전략적 활동이다.</p><p></p><p>첫째, 디지털 전환이 경쟁력에 미치는 영향을 살펴보면, 데이터 기반 의사결정이 가능해지면서 시장 변화에 대한 민첩한 대응이 가능해진다.</p><p></p><p>둘째, 고객 접점의 디지털화를 통해...</p>',
  });

  console.log(`  ✓ Exam "${code}" seeded (id: ${examId})`);
  return { examId, code, sessionId };
}

async function cleanupExamData(examId) {
  console.log('\n🧹 Cleaning up exam data...');
  const tables = ['grades', 'messages', 'submissions', 'paste_logs', 'sessions', 'exam_nodes', 'exams', 'student_profiles'];
  for (const t of tables) {
    await supabase.from(t).delete().neq('id', '00000000-0000-0000-0000-000000000000');
  }
  console.log('  ✓ Test data cleaned');
}

// --- Sign in via email/password (Clerk single-step form) ---
async function signIn(page, email) {
  await page.goto(`${BASE}/sign-in`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(4000);

  // Clerk Elements form: email + password shown together
  // Fill email
  const emailInput = page.locator('input[name="identifier"], input[type="email"]').first();
  await emailInput.waitFor({ state: 'visible', timeout: 15000 });
  await emailInput.fill(email);

  // Fill password (same form)
  const pwInput = page.locator('input[name="password"], input[type="password"]').first();
  await pwInput.waitFor({ state: 'visible', timeout: 5000 });
  await pwInput.fill(TEST_PASSWORD);

  // Click "로그인" submit button
  await page.locator('button:has-text("로그인"), button[type="submit"]').first().click();
  await page.waitForTimeout(5000);

  // Check if we're past sign-in
  const url = page.url();
  if (url.includes('sign-in')) {
    console.log(`  ⚠ Still on sign-in page after submit (${url})`);
    await page.screenshot({ path: path.join(OUT, '_debug-sign-in-stuck.png') });
  } else {
    console.log(`  ✓ Signed in as ${email} → ${url}`);
  }
}

// --- Main ---
async function main() {
  console.log('🚀 Quest-On Product Screenshot Capture');
  console.log('=========================================');

  // 1. Create test users
  await createTestUsers();

  // 2. Set roles via Clerk metadata
  await setUserRole(instructorClerkId, 'instructor');
  await setUserRole(studentClerkId, 'student');

  // 3. Seed exam data
  const { examId, code, sessionId } = await seedExamData();

  const browser = await chromium.launch({ headless: true });

  try {
    // ===== INSTRUCTOR SCREENSHOTS =====
    console.log('\n📸 Capturing instructor screens...');
    const instructorCtx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
    const iPage = await instructorCtx.newPage();

    await signIn(iPage, TEST_EMAIL_INSTRUCTOR);

    // Instructor dashboard
    await iPage.goto(`${BASE}/instructor`, { waitUntil: 'networkidle' });
    await iPage.waitForTimeout(2000);
    await screenshot(iPage, 'instructor-dashboard');

    // Instructor exam detail
    await iPage.goto(`${BASE}/instructor`, { waitUntil: 'networkidle' });
    await iPage.waitForTimeout(2000);
    // Try clicking on the exam if visible
    const examLink = iPage.locator(`text=경영학원론`).first();
    if (await examLink.isVisible({ timeout: 3000 }).catch(() => false)) {
      await examLink.click();
      await iPage.waitForTimeout(2000);
      await screenshot(iPage, 'instructor-exam-detail');
    }

    await instructorCtx.close();

    // ===== STUDENT SCREENSHOTS =====
    console.log('\n📸 Capturing student screens...');
    const studentCtx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
    const sPage = await studentCtx.newPage();

    await signIn(sPage, TEST_EMAIL_STUDENT);

    // Student dashboard
    await sPage.goto(`${BASE}/student`, { waitUntil: 'networkidle' });
    await sPage.waitForTimeout(2000);
    await screenshot(sPage, 'student-dashboard');

    // Join page (code entry)
    await sPage.goto(`${BASE}/join`, { waitUntil: 'networkidle' });
    await sPage.waitForTimeout(1000);
    await screenshot(sPage, 'student-join-page');

    // Enter exam code
    const otpInput = sPage.locator('[data-input-otp]').first();
    if (await otpInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      await otpInput.click();
      await sPage.keyboard.type(code, { delay: 100 });
      await sPage.waitForTimeout(3000);
    }

    // Exam page (should redirect to exam)
    await sPage.goto(`${BASE}/exam/${code}`, { waitUntil: 'networkidle' });
    await sPage.waitForTimeout(3000);
    await screenshot(sPage, 'student-exam-main');

    // Try to capture different states
    await sPage.waitForTimeout(2000);
    await screenshot(sPage, 'student-exam-with-chat');

    await studentCtx.close();

  } catch (e) {
    console.error('\n❌ Error during capture:', e.message);
  } finally {
    await browser.close();
  }

  // Cleanup
  await cleanupExamData(examId);
  await cleanupTestUsers();

  console.log('\n✅ Done! Screenshots saved to:', OUT);
  console.log('\nCaptured files:');
  const files = fs.readdirSync(OUT).filter(f => f.endsWith('.png'));
  files.forEach(f => console.log(`  📄 ${f}`));
}

main().catch(async (e) => {
  console.error('\n💥 Fatal error:', e.message);
  // Still try to cleanup
  await cleanupTestUsers().catch(() => {});
  process.exit(1);
});
