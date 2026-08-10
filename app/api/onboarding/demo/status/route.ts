import { currentUser } from "@/lib/get-current-user";
import { successJson, errorJson } from "@/lib/api-response";
import { checkRateLimitAsync, RATE_LIMITS } from "@/lib/rate-limit";
import {
  isAiDemoRegenerationUnlocked,
  isDemoCompleted,
} from "@/lib/demo-completion";

/**
 * GET /api/onboarding/demo/status — 데모 완주와 AI 재생성 개방 상태를 조회한다.
 *
 * ADR-002에 따라 온보딩 상태도 액션 스위치가 아닌 리소스로 제공한다.
 */
export async function GET() {
  try {
    const user = await currentUser();
    if (!user) {
      return errorJson("UNAUTHORIZED", "Unauthorized", 401);
    }
    if (user.role !== "instructor") {
      return errorJson("INSTRUCTOR_REQUIRED", "Instructor access required", 403);
    }

    const rl = await checkRateLimitAsync(
      `onboarding-demo-status:${user.id}`,
      RATE_LIMITS.sessionRead
    );
    if (!rl.allowed) {
      return errorJson("RATE_LIMITED", "Too many requests. Please try again later.", 429);
    }

    const [completed, aiRegenerationUnlocked] = await Promise.all([
      isDemoCompleted(user.id),
      isAiDemoRegenerationUnlocked(user.id),
    ]);

    return successJson({ completed, aiRegenerationUnlocked });
  } catch {
    return errorJson("DEMO_STATUS_FAILED", "Failed to fetch demo status", 500);
  }
}
