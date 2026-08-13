import { requireAdmin } from "@/lib/admin-auth";
import { successJson, errorJson } from "@/lib/api-response";
import { checkRateLimitAsync, RATE_LIMITS } from "@/lib/rate-limit";
import { logError } from "@/lib/logger";
import { getSupabaseServer } from "@/lib/supabase-server";
import {
  buildOnboardingFunnel,
  INSTRUCTOR_FUNNEL,
  type OnboardingEventRow,
} from "@/lib/onboarding-funnel";

/**
 * 온보딩 퍼널 조회 (관리자 전용)
 *
 * 이벤트는 계속 쌓이고 있었지만 읽는 곳이 없어서 어디서 이탈하는지 아무도 몰랐다.
 * 온보딩을 고치기 전에 먼저 재려고 만든다.
 *
 * 집계는 순수 함수(`lib/onboarding-funnel.ts`)가 하고 여기서는 행만 가져온다.
 */

/** 조회 상한. 퍼널 5단계 × 사용자 수라 현실적으로 이 안에 들어온다. */
const MAX_ROWS = 20_000;

export async function GET() {
  try {
    const denied = await requireAdmin();
    if (denied) return denied;

    const rl = await checkRateLimitAsync("admin", RATE_LIMITS.general);
    if (!rl.allowed) {
      return errorJson("RATE_LIMITED", "Too many requests. Please try again later.", 429);
    }

    const { data, error } = await getSupabaseServer()
      .from("onboarding_events")
      .select("user_id, event, occurred_at")
      // 퍼널에 없는 이벤트(학생 고지 확인 등)까지 끌어오면 표본 수가 부풀려진다.
      .in("event", [...INSTRUCTOR_FUNNEL])
      .order("occurred_at", { ascending: false })
      .limit(MAX_ROWS);

    if (error) throw error;

    const rows = (data ?? []) as OnboardingEventRow[];
    const funnel = buildOnboardingFunnel(rows);

    return successJson({
      ...funnel,
      // 상한에 걸리면 숫자가 실제보다 작다. 화면이 그 사실을 밝혀야 한다.
      truncated: rows.length >= MAX_ROWS,
    });
  } catch (error) {
    logError("admin onboarding-funnel: GET failed", error, {
      path: "/api/admin/onboarding-funnel",
    });
    return errorJson("INTERNAL_ERROR", "Failed to load onboarding funnel", 500);
  }
}
