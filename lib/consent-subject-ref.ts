import { createHmac, timingSafeEqual } from "crypto";

/**
 * subject_ref 파생. Option C 의 핵심이다.
 *
 * 동의 원장(`consent_records`)은 `user_id` 를 저장하지 않는다.
 * 대신 `subject_ref = 'v1:' + hex HMAC-SHA256(user_id)` 만 쓰고,
 * 식별은 접근통제된 `consent_subject_map` 이 담당한다.
 *
 * 이 구조 덕분에:
 *   · 탈퇴가 매핑 1행 DELETE 로 끝나고 원장은 손대지 않는다
 *     → append-only 불변식이 그대로 유지된다 (UPDATE 예외 0개)
 *   · 매핑이 사라지면 원 user_id 로 역추적할 수 없다
 *     → "탈퇴 후 원 user_id 조회 0건" 이 설계상 자동 보장된다
 *
 * 키는 이 모듈만 읽는다. 다른 곳에서 process.env 로 직접 꺼내 쓰면
 * 파생 규칙이 갈라져 원장이 둘로 쪼개진다.
 *
 * ⚠️ 키를 분실하면 기존 원장의 재식별 경로가 영구 소실된다.
 *    환경별 escrow 와 복구 리허설이 운영 책임으로 따라온다.
 *    기존 원장이 만료되기 전에는 키를 회전하지 않는다.
 */

const KEY_ENV = "CONSENT_SUBJECT_HMAC_KEY_V1";
const VERSION_PREFIX = "v1:";

/** HMAC 키의 최소 길이. 32바이트 미만은 SHA-256 블록 대비 너무 짧다. */
const MIN_KEY_BYTES = 32;

export class ConsentSubjectRefError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConsentSubjectRefError";
  }
}

function loadKey(): Buffer {
  const raw = process.env[KEY_ENV];

  if (!raw || raw.trim() === "") {
    // fail-closed. 키가 없으면 동의를 기록할 수 없고, 기록할 수 없으면
    // 게이트를 통과시켜서도 안 된다.
    throw new ConsentSubjectRefError(
      `${KEY_ENV} 가 설정되지 않았다. 동의 기록·판정을 진행할 수 없다.`,
    );
  }

  let key: Buffer;
  try {
    key = Buffer.from(raw, "base64");
  } catch {
    throw new ConsentSubjectRefError(`${KEY_ENV} 를 base64 로 디코드할 수 없다.`);
  }

  if (key.length < MIN_KEY_BYTES) {
    // 값 자체는 절대 로그에 남기지 않는다. 길이만 알린다.
    throw new ConsentSubjectRefError(
      `${KEY_ENV} 가 너무 짧다: ${key.length} bytes (최소 ${MIN_KEY_BYTES} bytes).`,
    );
  }

  return key;
}

/**
 * user_id 에서 subject_ref 를 만든다. 같은 입력이면 항상 같은 출력이다.
 * 원 user_id 는 반환값 어디에도 남지 않는다.
 */
export function deriveSubjectRef(userId: string): string {
  if (!userId || userId.trim() === "") {
    throw new ConsentSubjectRefError("빈 user_id 로 subject_ref 를 만들 수 없다.");
  }

  const digest = createHmac("sha256", loadKey())
    .update(userId, "utf8")
    .digest("hex");

  return `${VERSION_PREFIX}${digest}`;
}

/** 형태 검사. 'v1:' + 64자리 소문자 hex. */
export function isValidSubjectRef(value: string): boolean {
  return /^v1:[0-9a-f]{64}$/.test(value);
}

/**
 * 두 subject_ref 가 같은지 상수 시간으로 비교한다.
 * 매핑 불일치 판정에서 타이밍 정보를 흘리지 않기 위해서다.
 */
export function subjectRefEquals(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a, "utf8"), Buffer.from(b, "utf8"));
}

/** 키가 준비돼 있는지 확인한다. 헬스체크·기동 시 fail-fast 용. */
export function isSubjectRefKeyConfigured(): boolean {
  try {
    loadKey();
    return true;
  } catch {
    return false;
  }
}
