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
 * `/onboarding` 은 `profiles.role` 이 이미 있는 사용자의 역할 단계를 건너뛰므로,
 * 기존 학생이 프로필을 수정하러 와도 곧바로 프로필 폼을 보게 된다.
 */
export default function StudentProfileSetupPage() {
  redirect("/onboarding");
}
