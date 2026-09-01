import { getAppEnv } from "@/lib/app-env";

/**
 * 프로덕션이 아닌 배포에만 뜨는 환경 표식.
 * 스테이징과 프로덕션이 같은 UI라서, 표식이 없으면 스테이징에서 실제 수업용 시험을
 * 만들거나 프로덕션에서 테스트 데이터를 만드는 사고가 난다.
 *
 * 표시 문자열은 환경 식별자(토큰)이므로 next-intl 메시지 대상이 아니다.
 *
 * 왼쪽 아래가 아니라 아래 가운데에 둔다. 교수자 사이드바의 사용자 카드가
 * 왼쪽 아래를 차지해서 이름·역할 글자가 배지에 가렸다. pointer-events-none 이라
 * 클릭을 막지는 않았지만, 내가 누구로 로그인해 있는지를 가리는 건 배지가
 * 할 일이 아니다. 토스트는 top-center 라(components/ui/sonner.tsx) 아래 가운데와
 * 겹치지 않는다.
 */
export function EnvBadge() {
  const appEnv = getAppEnv();
  if (appEnv === "production") return null;

  return (
    <div
      role="status"
      className="pointer-events-none fixed bottom-3 left-1/2 -translate-x-1/2 z-[9999] rounded-full border border-warning-border/40 bg-warning-solid/90 px-2.5 py-1 font-mono text-xs font-semibold uppercase tracking-wide text-warning-solid-foreground shadow-sm"
    >
      {appEnv}
    </div>
  );
}
