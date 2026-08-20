import { currentUser } from "@/lib/get-current-user";
import { getSupabaseServer } from "@/lib/supabase-server";
import { logError } from "@/lib/logger";
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

    const supabase = getSupabaseServer();

    // 데모 id 도 함께 준다.
    //
    // 대시보드가 "여기서 시작하세요"로 데모를 가리키려 했는데, 데모를
    // 드라이브 목록(exam_nodes)에서 찾고 있었다. 그 조회는 AC-17 때문에
    // .eq("exams.is_demo", false) 로 데모를 걸러낸다(drive-handlers.ts:141).
    // 그래서 그 안내는 한 번도 뜬 적이 없는 죽은 코드였다.
    //
    // 목록에 끼울 수는 없다 - AC-17 은 "목록·통계·발행 카운트 어디에도
    // 나타나지 않는다" 이다. 가리키는 것과 목록에 넣는 것은 다르므로
    // 여기서 id 만 따로 알려준다.
    // 데모 id 조회는 부가 정보다. 실패해도 나머지 상태를 죽이면 안 된다.
    //
    // Promise.all 안에 그냥 넣으면 이 조회가 throw 할 때 전체가 reject 돼
    // 바깥 catch 로 떨어지고 500 이 나간다. 완주 여부는 멀쩡히 알 수 있는데
    // 안내 링크 하나 때문에 화면이 통째로 죽는 셈이다. 여기서 삼킨다.
    const lookupDemoExamId = async (): Promise<string | null> => {
      try {
        const { data, error } = await supabase
          .from("exams")
          .select("id")
          .eq("instructor_id", user.id)
          .eq("is_demo", true)
          .order("created_at", { ascending: true })
          .limit(1)
          .maybeSingle();

        if (error) {
          logError("[onboarding-demo-status] Failed to look up demo", error, {
            path: "/api/onboarding/demo/status",
          });
          return null;
        }
        return data?.id ?? null;
      } catch (err) {
        logError("[onboarding-demo-status] Demo lookup threw", err, {
          path: "/api/onboarding/demo/status",
        });
        return null;
      }
    };

    const [completed, aiRegenerationUnlocked, examId] = await Promise.all([
      isDemoCompleted(user.id),
      isAiDemoRegenerationUnlocked(user.id),
      lookupDemoExamId(),
    ]);

    return successJson({ completed, aiRegenerationUnlocked, examId });
  } catch {
    return errorJson("DEMO_STATUS_FAILED", "Failed to fetch demo status", 500);
  }
}
