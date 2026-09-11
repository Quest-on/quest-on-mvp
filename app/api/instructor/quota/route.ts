import { NextRequest } from "next/server";
import { currentUser } from "@/lib/get-current-user";
import { successJson, errorJson } from "@/lib/api-response";
import { logError } from "@/lib/logger";
import { getSupabaseServer } from "@/lib/supabase-server";
import { getPlanLimits, countPublishedExams } from "@/lib/plan-limits";

/**
 * GET /api/instructor/quota
 *
 * 교수자가 **코드를 건네기 전에** 한도를 알 수 있게 한다 (이슈 #84).
 *
 * 이게 없으면 벌어지는 일: 네 번째 시험 코드를 수업 자료에 배포한 뒤, 수업
 * 중에 학생 30명이 전원 입장 거부를 당한다. 최종 강제는 세션 생성 시
 * `admit_exam_session` 이 하지만, 그건 이미 늦은 시점이다.
 *
 * 실패하면 무제한으로 답한다(fail-open). 한도 조회 장애로 교수자가 시험을
 * 못 여는 것보다 잠시 한도가 풀리는 쪽이 낫다 — 최종 강제는 DB 가 하므로
 * 여기서 열려도 실제 초과는 일어나지 않는다.
 */
export async function GET(_request: NextRequest) {
  try {
    const user = await currentUser();
    if (!user) return errorJson("UNAUTHORIZED", "Unauthorized", 401);
    if (user.role !== "instructor") {
      return errorJson("FORBIDDEN", "Instructor only", 403);
    }

    // plan 은 AppUser 에 없다(인증 클레임이 아니라 요금제 사실이다).
    // profiles 에서 직접 읽는다.
    const { data: profile } = await getSupabaseServer()
      .from("profiles")
      .select("plan")
      .eq("id", user.id)
      .maybeSingle();

    const limits = await getPlanLimits(profile?.plan ?? "free");

    if (limits.maxPublishes === null) {
      return successJson({
        publishesRemaining: null,
        studentsRemaining: limits.maxStudents,
        plan: limits.plan,
      });
    }

    const used = await countPublishedExams(user.id);

    return successJson({
      publishesRemaining: Math.max(0, limits.maxPublishes - used),
      // 시험별 잔여는 상세 화면이 계산한다. 여기서는 플랜 상한만 알린다 -
      // 목록에서 시험마다 학생 수를 세면 조회가 N 배로 늘어난다.
      studentsRemaining: limits.maxStudents,
      plan: limits.plan,
    });
  } catch (error) {
    logError("[instructor-quota] quota_fail_open", error, {
      path: "/api/instructor/quota",
    });
    // 판정 불능은 무제한으로 답한다. 최종 강제는 DB 함수가 한다.
    return successJson({
      publishesRemaining: null,
      studentsRemaining: null,
      plan: null,
    });
  }
}
