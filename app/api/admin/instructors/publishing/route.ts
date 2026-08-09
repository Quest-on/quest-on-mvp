import { getSupabaseServer } from "@/lib/supabase-server";
import { requireAdmin } from "@/lib/admin-auth";
import { successJson, errorJson } from "@/lib/api-response";
import { logError } from "@/lib/logger";

/**
 * GET /api/admin/instructors/publishing — 교수자별 발행 현황 (이슈 #86 / AC-19).
 *
 * 승인이 "차단"에서 "무료 한도"로 바뀌면 관리자가 볼 것은 대기열이 아니라
 * **누가 얼마나 쓰고 있는가**다. plan 승격(#84) 판단의 유일한 근거가 이 화면이다.
 *
 * 발행 기준은 `first_published_at IS NOT NULL AND is_demo = false` 로,
 * `lib/plan-limits.ts::countPublishedExams` 와 같은 정의다. 데모를 세면 아무것도
 * 안 한 교수자가 활동한 것처럼 보인다.
 *
 * 집계는 앱에서 한다. 교수자 수가 RPC 를 새로 만들 규모가 아니고, 없는 RPC 를
 * 추가하면 마이그레이션이 하나 더 붙는다.
 */
type PublishingRow = {
  instructorId: string;
  name: string | null;
  email: string | null;
  school: string | null;
  plan: string;
  status: string | null;
  publishedCount: number;
  demoCount: number;
  lastPublishedAt: string | null;
};

export async function GET() {
  try {
    const denied = await requireAdmin();
    if (denied) return denied;

    const supabase = getSupabaseServer();

    const [{ data: exams, error: examsError }, { data: profiles, error: profilesError }] =
      await Promise.all([
        supabase
          .from("exams")
          .select("instructor_id, is_demo, first_published_at")
          .not("instructor_id", "is", null),
        supabase
          .from("profiles")
          .select("id, display_name, school, plan, status")
          .eq("role", "instructor"),
      ]);

    if (examsError) throw examsError;
    if (profilesError) throw profilesError;

    const published = new Map<string, number>();
    const demos = new Map<string, number>();
    const lastPublished = new Map<string, string>();

    for (const exam of exams ?? []) {
      const id = exam.instructor_id as string;
      if (exam.is_demo) {
        demos.set(id, (demos.get(id) ?? 0) + 1);
        continue;
      }
      if (!exam.first_published_at) continue;

      published.set(id, (published.get(id) ?? 0) + 1);
      const at = exam.first_published_at as string;
      const seen = lastPublished.get(id);
      if (!seen || at > seen) lastPublished.set(id, at);
    }

    const rows: PublishingRow[] = (profiles ?? []).map((p) => ({
      instructorId: p.id as string,
      name: (p.display_name as string | null) ?? null,
      // 이메일은 profiles 에 없다. 대기 목록(instructor_profiles)이 갖고 있으므로
      // 여기서는 이름·소속으로 식별한다. 두 테이블을 조인하려고 조회를 늘리지 않는다.
      email: null,
      school: (p.school as string | null) ?? null,
      plan: (p.plan as string | null) ?? "free",
      status: (p.status as string | null) ?? null,
      publishedCount: published.get(p.id as string) ?? 0,
      demoCount: demos.get(p.id as string) ?? 0,
      lastPublishedAt: lastPublished.get(p.id as string) ?? null,
    }));

    // 많이 쓰는 순. 한도에 가까운 계정이 위로 온다.
    rows.sort((a, b) => b.publishedCount - a.publishedCount);

    return successJson({ instructors: rows });
  } catch (error) {
    logError("[admin-publishing] Failed to build publishing overview", error, {
      path: "/api/admin/instructors/publishing",
    });
    return errorJson("DATABASE_ERROR", "Failed to fetch publishing overview", 500);
  }
}
