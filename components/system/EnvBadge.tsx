import { getAppEnv } from "@/lib/app-env";

/**
 * 프로덕션이 아닌 배포에만 뜨는 환경 표식.
 * 스테이징과 프로덕션이 같은 UI라서, 표식이 없으면 스테이징에서 실제 수업용 시험을
 * 만들거나 프로덕션에서 테스트 데이터를 만드는 사고가 난다.
 *
 * 표시 문자열은 환경 식별자(토큰)이므로 next-intl 메시지 대상이 아니다.
 */
export function EnvBadge() {
  const appEnv = getAppEnv();
  if (appEnv === "production") return null;

  return (
    <div
      role="status"
      className="pointer-events-none fixed bottom-3 left-3 z-[9999] rounded-full border border-amber-500/40 bg-amber-500/90 px-2.5 py-1 font-mono text-xs font-semibold uppercase tracking-wide text-amber-950 shadow-sm"
    >
      {appEnv}
    </div>
  );
}
