import { redirect } from "next/navigation";

/**
 * AC-3 (이슈 #81): 학생 프로필 설정 진입 경로를 하나로 모은다.
 *
 * 이전에는 이 페이지가 `/onboarding` 의 프로필 단계와 거의 동일한 폼을 따로
 * 구현하고 있었다. 두 벌이면 한쪽만 고쳐지고 다른 쪽이 남는다 — 실제로
 * 프로필 이중 기록 버그(AC-2)도 한쪽에만 있었다.
 *
 * URL 은 유지한다. `components/student/StudentDashboardClient.tsx` 와
 * `app/(app)/profile/page.tsx` 가 이 경로로 보내고 있고, e2e 도 이 경로를 쓴다.
 * 구현만 `/onboarding` 하나로 합친다.
 *
 * ⚠️ 쿼리스트링을 반드시 그대로 넘긴다. `/student/profile-setup?redirect=/exam/ABC`
 * 처럼 응시 도중 프로필을 채우러 온 학생은 저장 후 원래 시험으로 돌아가야 한다.
 * 삭제된 구현이 `params.get("redirect")` 를 읽고 있었고, `/onboarding` 도 같은
 * 파라미터를 소비하므로 넘기기만 하면 동작이 보존된다.
 */
export default async function StudentProfileSetupPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const query = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (Array.isArray(value)) {
      for (const v of value) query.append(key, v);
    } else if (value !== undefined) {
      query.append(key, value);
    }
  }

  const qs = query.toString();
  redirect(qs ? `/onboarding?${qs}` : "/onboarding");
}
