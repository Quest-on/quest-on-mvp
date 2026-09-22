/**
 * `admit_exam_session` RPC 가 실패했을 때의 처리 (이슈 #326).
 *
 * 발행·학생 한도는 그 SQL 함수 한 곳에서만 판정한다. 교수자 단위 advisory lock
 * 으로 동시 입장까지 직렬화하므로, 호출부가 세션을 직접 만들면 한도가 통째로
 * 우회된다 — 게다가 그렇게 들어온 학생은 이후 "기존 학생 통과" 분기에 걸려
 * 영구히 grandfather 된다.
 *
 * 그런데 RPC 가 **에러**를 내면 호출부는 로그만 남기고 세션을 직접 만들었다.
 * RPC 장애 = 모든 free 계정 무제한이고, 장애가 조용해서 언제부터 샜는지도
 * 알 수 없었다.
 *
 * "한도 계산 장애로 수업을 멈추면 안 된다" 는 판단 자체는 맞다. 다만 그건
 * **이미 응시 중인 학생**에게만 맞는 말이다. RPC 는 원래 그 둘을 가른다 —
 * 기존 세션이 있으면 한도를 보지 않고 `admitted=true, created=false` 로 즉시
 * 돌려준다. 에러가 나는 순간 호출부가 그 구분을 잃는 것이 결함의 실체였다.
 *
 * 그래서 규칙은 하나다: **RPC 가 실패하면 세션을 새로 만들지 않는다.**
 * 있으면 이어 가고(지속), 없으면 새 입장이므로 막는다.
 *
 * 막힌 학생은 영구히 막히는 게 아니다 — RPC 가 돌아오면 정상 입장한다.
 * 반대로 열어 두면 그 사이 들어온 학생은 되돌릴 수 없다.
 *
 * ## 데모 소유자 미리보기도 예외로 두지 않는다 (이슈 #451)
 *
 * 한때 예외를 뒀다. 논리는 이랬다 — `database/026` 의 `v_owner_preview` 가
 * `is_demo AND instructor_id = p_student_id` 일 때 두 한도를 통째로
 * 건너뛰므로, **소비하는 한도가 없는 입장**을 판정 불가를 이유로 막는 건
 * 얻는 것 없이 가입 직후 데모만 끊는다는 것이었다.
 *
 * 되돌렸다. 이유는 둘이다.
 *
 * 1. RPC 는 한도 게이트이기만 한 게 아니라 **세션 생성의 단일 관문**이다.
 *    교수자 단위 advisory lock 으로 동시 입장을 직렬화하고, `first_published_at`
 *    기록을 세션 삽입과 같은 트랜잭션에 묶는다. 밖에서 만들면 생성 경로가
 *    둘로 갈라지고, 그 둘이 갈라진 채로 오래 남는다.
 * 2. "실패 경로에서는 아무것도 쓰지 않는다" 는 **구조로 검사할 수 있는**
 *    불변식이다(`__tests__/quota-admission.test.ts`, `publish-quota.test.ts`).
 *    조건부 예외를 하나 열면 그 검사가 불가능해지고, 다음 사람이 조건을
 *    넓혀도 아무도 못 본다. 이 저장소는 그 자리에서 이미 두 번 샜다(#84, #326).
 *
 * 그래서 RPC 장애 중에는 데모 미리보기도 503 을 받는다. 장애가 끝나면 바로
 * 들어간다. 드문 창에서의 편의보다 단일 관문이 크다.
 */

export type AdmissionFallback =
  /** 기존 세션이 있다 — 지속이므로 이어 간다. */
  | { kind: "continue"; sessionId: string }
  /** 새 입장인데 한도를 모른다 — 막는다. */
  | { kind: "deny" };

/**
 * @param existingSessionId 이 학생·시험의 기존 세션 id. 없으면 null/undefined.
 */
export function resolveAdmissionFallback(
  existingSessionId: string | null | undefined
): AdmissionFallback {
  if (typeof existingSessionId === "string" && existingSessionId.length > 0) {
    return { kind: "continue", sessionId: existingSessionId };
  }
  return { kind: "deny" };
}

/** 한도 판정이 불가능할 때 쓰는 에러 코드. 한도 초과(403)와 구분한다. */
export const QUOTA_UNAVAILABLE_CODE = "QUOTA_CHECK_UNAVAILABLE";
