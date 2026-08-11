import { deriveSubjectRef, isValidSubjectRef } from "@/lib/consent-subject-ref";

/**
 * 권리요청(열람·정정·삭제) 대응 재료 생성.
 *
 * 설계상 **앱은 동의 감사 테이블에 접근하지 않는다.** `019` 가
 * `consent_subject_map` 과 `consent_retention_index` 에 대한 service_role
 * 직접 권한을 회수했고, 조회는 전용 `consent_auditor` role 로만 가능하다.
 *
 * 따라서 이 모듈은 DB 에 붙지 않는다. 붙으면 그 자체가 접근분리 위반이다.
 * 대신 검증된 user_id 로부터 조회에 필요한 `subject_ref` 를 도출하고,
 * 승인된 operator 가 자신의 감사 권한으로 실행할 SQL 을 만들어 준다.
 *
 * 이 구조의 장점:
 *   · 앱 코드에 감사 DB 자격증명이 아예 등장하지 않는다
 *   · Vercel 런타임에 `CONSENT_AUDIT_DATABASE_URL` 을 넣을 이유가 사라진다
 *   · 조회 실행 주체가 사람으로 남아 감사 로그에 그대로 남는다
 */

export interface RightsLookupPlan {
  /** 원장에서 이 주체를 가리키는 값. 원 user_id 는 어디에도 남지 않는다. */
  subjectRef: string;
  /** operator 가 감사 권한으로 실행할 SQL. */
  statements: readonly string[];
}

export class ConsentAuditError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConsentAuditError";
  }
}

/**
 * 검증된 user_id 로 조회 계획을 만든다.
 *
 * `userId` 는 **이미 신원 확인이 끝난 값**이어야 한다. 요청자가 주장한
 * 값을 그대로 넣으면 타인의 동의 이력을 들여다볼 수 있다.
 */
export function buildRightsLookupPlan(userId: string): RightsLookupPlan {
  const subjectRef = deriveSubjectRef(userId);

  if (!isValidSubjectRef(subjectRef)) {
    throw new ConsentAuditError("subject_ref 도출 결과가 형식을 벗어났다.");
  }

  // 값은 파라미터로 넘긴다. 문자열 보간은 하지 않는다.
  const statements = [
    "-- 1) 동의 이력 (최신순)",
    "SELECT consent_key, granted, policy_version, recorded_at\n" +
      "  FROM public.consent_records\n" +
      " WHERE subject_ref = $1\n" +
      " ORDER BY recorded_at DESC;",
    "-- 2) 탈퇴 여부와 파기 기한 (탈퇴자만 행이 있다)",
    "SELECT deleted_at, destroy_after\n" +
      "  FROM public.consent_retention_index\n" +
      " WHERE subject_ref = $1;",
  ] as const;

  return { subjectRef, statements };
}

/**
 * 수령증에 남길 요약. **식별자를 넣지 않는다.**
 * 권리요청 처리 기록 자체가 새 개인정보가 되면 안 된다.
 */
export function buildRightsLookupReceipt(caseId: string, rowCount: number): string {
  if (!caseId.trim()) {
    throw new ConsentAuditError("case ID 없이 수령증을 만들 수 없다.");
  }
  return `case=${caseId} rows=${rowCount} at=${new Date().toISOString()}`;
}
