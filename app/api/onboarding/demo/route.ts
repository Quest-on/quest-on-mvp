import { NextRequest } from "next/server";
import { z } from "zod";
import { currentUser } from "@/lib/get-current-user";
import { getSupabaseServer } from "@/lib/supabase-server";
import { successJson, errorJson } from "@/lib/api-response";
import { checkRateLimitAsync, RATE_LIMITS } from "@/lib/rate-limit";
import { logError } from "@/lib/logger";
import { createExam } from "@/app/api/supa/handlers/exam-handlers";
import {
  SUBJECT_CATEGORIES,
  selectDemoTemplate,
} from "@/lib/demo-templates";
import {
  ONBOARDING_EVENTS,
  recordOnboardingEvent,
} from "@/lib/onboarding-events";

/**
 * POST /api/onboarding/demo — 과목 맞춤 데모 시험 생성 (이슈 #82 / AC-4~AC-6).
 *
 * 신규 교수자의 첫 화면이 빈 대시보드면 아무것도 안 하고 나간다. 가입 직후
 * JTBD 2문항을 받아 그 답에 맞는 데모를 즉시 깔아준다.
 *
 * **OpenAI 호출 0회가 인수 조건이다.** 생성물은 `lib/demo-templates.ts` 의 고정
 * 텍스트다. 엉터리 생성물로 첫인상을 망치지 않고, 미인증 계정에 AI 비용을
 * 노출하지도 않는다. AI 기반 재생성은 데모 완주 후 개방된다(#83).
 *
 * ADR-002 에 따라 `/api/supa` 액션 스위치가 아니라 리소스형 라우트다. 다만
 * exam 생성 자체는 `createExam` 을 그대로 쓴다 — 코드 중복 발급 재시도,
 * 문항 정제, 배점 검증, 드라이브 트리(exam_nodes) 삽입이 전부 거기 있고,
 * 데모만 다른 경로로 만들면 그 로직이 두 벌이 된다.
 */
const BodySchema = z
  .object({
    subject: z.enum(SUBJECT_CATEGORIES).optional(),
    /** 2문항을 건너뛰었는가 (AC-6) */
    skipped: z.boolean().optional(),
    language: z.enum(["ko", "en"]).optional(),
  })
  .strict();

function generateExamCode(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let result = "";
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

export async function POST(request: NextRequest) {
  try {
    const user = await currentUser();
    if (!user) {
      return errorJson("UNAUTHORIZED", "Unauthorized", 401);
    }
    if (user.role !== "instructor") {
      return errorJson("INSTRUCTOR_REQUIRED", "Instructor access required", 403);
    }

    const rl = await checkRateLimitAsync(
      `onboarding-demo:${user.id}`,
      RATE_LIMITS.examControl
    );
    if (!rl.allowed) {
      return errorJson("RATE_LIMITED", "Too many requests.", 429);
    }

    let body: unknown = {};
    try {
      body = await request.json();
    } catch {
      // 본문 없이 부르면 건너뛴 것으로 본다 — 기본 템플릿이 나간다.
    }

    const parsed = BodySchema.safeParse(body ?? {});
    if (!parsed.success) {
      return errorJson("INVALID_INPUT", "Invalid input", 400);
    }
    const { subject, skipped, language } = parsed.data;

    const supabase = getSupabaseServer();

    // 이미 데모가 있으면 새로 만들지 않는다. 온보딩 재진입·새로고침·뒤로가기가
    // 데모를 쌓으면 드라이브가 지저분해지고, 무엇이 "그" 데모인지 알 수 없게 된다.
    const { data: existing, error: existingError } = await supabase
      .from("exams")
      .select("id, code, title")
      .eq("instructor_id", user.id)
      .eq("is_demo", true)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (existingError) {
      logError("[onboarding-demo] Failed to look up existing demo", existingError, {
        path: "/api/onboarding/demo",
      });
      return errorJson("DATABASE_ERROR", "Failed to create demo", 500);
    }

    if (existing) {
      return successJson({
        examId: existing.id,
        code: existing.code,
        title: existing.title,
        created: false,
      });
    }

    const template = selectDemoTemplate({
      subject,
      language,
    });

    const now = new Date().toISOString();
    const response = await createExam({
      title: template.title,
      code: generateExamCode(),
      duration: template.duration,
      questions: [
        {
          id: "demo-q1",
          text: template.questionText,
          type: "essay",
        },
      ],
      status: "draft",
      created_at: now,
      updated_at: now,
      language: language === "en" ? "en" : "ko",
      type: template.examType,
      assignment_prompt: template.assignmentPrompt,
      rubric: template.rubric,
      is_demo: true,
    });

    if (!response.ok) {
      // createExam 이 이미 구조화된 오류를 만들었다. 다시 포장하면 원인이 흐려진다.
      return response;
    }

    const created = (await response.json()) as {
      exam?: { id?: string; code?: string; title?: string };
    };
    const examId = created.exam?.id ?? null;

    // 마일스톤 (AC-7 계측). 실패해도 데모 생성은 성공이다 — 계측이 제품을 막지 않는다.
    await recordOnboardingEvent({
      userId: user.id,
      role: "instructor",
      event: ONBOARDING_EVENTS.INTAKE_SUBMITTED,
      examId,
      metadata: {
        subject: subject ?? null,
        // 건너뛴 교수자는 발행 직전에 같은 질문을 다시 받아야 한다(AC-6).
        // 그 판단 근거가 이 플래그다 — 별도 테이블 없이 여기 남긴다.
        skipped: skipped === true,
      },
    });
    await recordOnboardingEvent({
      userId: user.id,
      role: "instructor",
      event: ONBOARDING_EVENTS.DEMO_CREATED,
      examId,
      metadata: { template: `${template.examType}:${subject ?? "general"}` },
    });

    return successJson({
      examId,
      code: created.exam?.code ?? null,
      title: created.exam?.title ?? template.title,
      created: true,
    });
  } catch (error) {
    logError("[onboarding-demo] Unhandled error", error, {
      path: "/api/onboarding/demo",
    });
    return errorJson("DEMO_CREATE_FAILED", "Failed to create demo", 500);
  }
}
