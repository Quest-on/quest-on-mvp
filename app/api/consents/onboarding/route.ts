import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { currentUser } from "@/lib/supabase-auth";
import {
  REQUIRED_CONSENT_KEYS,
  recordConsentDecisions,
  type ConsentDecisionInput,
} from "@/lib/consent-records";
import { evaluateConsentGate, getCurrentPolicyRelease } from "@/lib/consent-gate";

/**
 * 온보딩 필수 동의 기록·조회.
 *
 * 계약:
 *   · 인증 검증 **전에** 어떤 데이터도 건드리지 않는다. 미인증은 401 + INSERT 0회
 *   · `user_id`·`controller_type`·`policy_version` 은 **서버가 정한다.**
 *     클라이언트가 보내면 strict Zod 가 400 으로 거절한다(INSERT 0회)
 *   · 정상 요청은 필수 2건을 **단일 배열 INSERT** 로 기록한다
 *   · 기록 실패를 성공처럼 처리하지 않는다. 비-2xx 를 내고 게이트는 미완료로 남는다
 */

/**
 * strict() 가 핵심이다. 알 수 없는 키가 하나라도 있으면 거절한다.
 * 이게 없으면 클라이언트가 `controller_type: "institution"` 같은 값을 끼워 넣어
 * 서버 상수를 덮어쓸 여지가 생긴다.
 */
const OnboardingConsentSchema = z
  .object({
    ageOver14: z.literal(true, {
      errorMap: () => ({ message: "만 14세 이상 확인이 필요하다." }),
    }),
    terms: z.literal(true, {
      errorMap: () => ({ message: "이용약관 동의가 필요하다." }),
    }),
  })
  .strict();

export async function POST(request: NextRequest) {
  // 1. 인증이 먼저다. 이 앞에서 DB 를 건드리지 않는다.
  const user = await currentUser();
  if (!user) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  // 2. 입력 검증. 파싱 실패도 DB 접근 없이 끝난다.
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 });
  }

  const parsed = OnboardingConsentSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "INVALID_PAYLOAD", issues: parsed.error.issues.map((i) => i.path.join(".")) },
      { status: 400 },
    );
  }

  // 3. 정책 버전은 서버가 정한다. 클라이언트 입력을 쓰지 않는다.
  let release;
  try {
    release = await getCurrentPolicyRelease();
  } catch {
    return NextResponse.json({ error: "CONSENT_BACKEND_UNAVAILABLE" }, { status: 503 });
  }

  if (!release) {
    // 최초 릴리스가 없으면 기록할 대상 버전이 없다. 임의로 만들지 않는다.
    return NextResponse.json({ error: "CONSENT_NOT_ACTIVE" }, { status: 503 });
  }

  // 4. 필수 2건을 한 번에 기록한다.
  const decisions: ConsentDecisionInput[] = REQUIRED_CONSENT_KEYS.map((consentKey) => ({
    consentKey,
    granted: true,
  }));

  try {
    const { insertedCount } = await recordConsentDecisions(
      user.id,
      decisions,
      release.releaseId,
    );

    if (insertedCount !== decisions.length) {
      // 부분 성공은 성공이 아니다.
      return NextResponse.json({ error: "CONSENT_RECORD_INCOMPLETE" }, { status: 500 });
    }
  } catch {
    return NextResponse.json({ error: "CONSENT_RECORD_FAILED" }, { status: 500 });
  }

  return NextResponse.json({ recorded: decisions.length, policyVersion: release.releaseId });
}

/** 현재 사용자의 필수 동의 완료 여부. 온보딩 UI 와 게이트가 함께 쓴다. */
export async function GET() {
  const user = await currentUser();
  if (!user) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const result = await evaluateConsentGate(user.id);

  if (result.complete) {
    return NextResponse.json({
      complete: true,
      policyVersion: result.currentRelease.releaseId,
    });
  }

  return NextResponse.json({
    complete: false,
    reason: result.reason,
    missingKeys: result.missingKeys,
    policyVersion: result.currentRelease?.releaseId ?? null,
  });
}
