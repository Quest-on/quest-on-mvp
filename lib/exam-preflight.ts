/**
 * 시험 입장 전 preflight 모달을 띄울지, 그리고 수락 뒤 init 캐시를 어떻게
 * 맞출지 (이슈 #474).
 *
 * 두 판정을 한 파일에 두는 이유: 앞의 판정이 읽는 필드를 뒤의 패치가 전부
 * 고쳐야 한다. 둘이 갈라지면 수락 직후 모달이 다시 뜬다 — 실제로 그랬다.
 *
 * `useExamSession` 의 init effect 는 `[initData, router]` 에 의존한다. 고지
 * 확인 뒤 init 캐시를 `setQueryData` 로 고치면 effect 가 **전체** 다시 돈다.
 * 예전 패치는 `disclosureAcknowledged` 만 바꿨고, 캐시 안의
 * `session.preflight_accepted_at` 은 `null` 그대로였다. 그래서 effect 가
 * `needsPreflight` 를 다시 참으로 보고 모달을 한 번 더 열었다. 두 번째 수락
 * 때는 패치 결과가 구조적으로 같아 effect 가 안 돌아서 정확히 두 번이었다.
 *
 * 모달보다 나쁜 건 effect 재실행이 init **시점**의 상태 — 세션 상태, 남은
 * 시간, "세션 복원" 토스트 — 를 되살린다는 점이다. `preflight_accepted_at`
 * 하나만 고치면 모달은 사라지지만, 시작된 시험의 학생을 대기실로 되돌리는
 * 되돌림은 남는다. 그래서 패치는 preflight 응답이 말하는 사실을 **전부**
 * 캐시에 옮긴다. 그러면 effect 가 다시 돌아도 핸들러가 세운 것과 같은 상태를
 * 세우고, 재마운트도 올바른 사실을 읽는다.
 */

/** init 응답 중 이 판정과 패치가 읽는 부분. 나머지 필드는 그대로 통과한다. */
export type PreflightInitSession = {
  status?: string | null;
  preflight_accepted_at?: string | null;
  submitted_at?: string | null;
};

export type PreflightInit = {
  ok?: boolean;
  disclosureAcknowledged?: boolean;
  sessionStatus?: string | null;
  sessionStartTime?: string | null;
  timeRemaining?: number | null;
  sessionReactivated?: boolean;
  session?: PreflightInitSession | null;
};

/** `POST /api/session/[sessionId]/preflight` 의 성공 응답. */
export type PreflightAccepted = {
  preflightAcceptedAt: string;
  status?: string;
  sessionStartTime?: string | null;
  timeRemaining?: number | null;
};

const PREFLIGHT_STATUSES = new Set(["joined", "waiting", "late_pending", "in_progress"]);
const COMPLETED_STATUSES = new Set(["submitted", "auto_submitted"]);

/**
 * 이 init 으로 preflight 모달을 띄워야 하는가.
 *
 * 세션 수락 여부와 사람 단위 고지 확인은 별개다. 전자만 보면 레거시 장기
 * 세션과 지각 입장이 AI 고지를 건너뛴다(AC-15).
 */
export function needsPreflight(init: PreflightInit): boolean {
  const session = init.session;
  if (!session) return false;

  const status = init.sessionStatus || session.status || "not_joined";
  return (
    PREFLIGHT_STATUSES.has(status) &&
    !COMPLETED_STATUSES.has(status) &&
    !session.submitted_at &&
    (!session.preflight_accepted_at || !init.disclosureAcknowledged)
  );
}

/**
 * preflight 수락 뒤의 서버 사실을 init 캐시에 옮긴다.
 *
 * 결과에 대해 `needsPreflight` 는 항상 거짓이어야 한다 — 수락했는데 다시
 * 묻는 모양이 #474 다.
 */
export function applyPreflightAccepted<T extends PreflightInit>(
  current: T,
  accepted: PreflightAccepted
): T {
  if (!current?.ok || !current.session) return current;

  const status = accepted.status ?? current.sessionStatus ?? current.session.status ?? null;

  return {
    ...current,
    disclosureAcknowledged: true,
    sessionStatus: status,
    sessionStartTime:
      accepted.sessionStartTime !== undefined ? accepted.sessionStartTime : current.sessionStartTime,
    timeRemaining:
      accepted.timeRemaining !== undefined ? accepted.timeRemaining : current.timeRemaining,
    // 복원 토스트는 입장 때 한 번이다. 캐시에 남겨 두면 effect 재실행마다 또 뜬다.
    sessionReactivated: false,
    session: {
      ...current.session,
      status,
      preflight_accepted_at: accepted.preflightAcceptedAt,
    },
  };
}
