import { verifySignatureAppRouter } from "@upstash/qstash/nextjs";
import { NextRequest, NextResponse } from "next/server";

/**
 * QStash 워커 라우트의 서명 검증 가드.
 *
 * 기존 워커는 `QSTASH_CURRENT_SIGNING_KEY ? verify(handler) : handler` 로,
 * 서명키가 없으면 **무인증으로 열려버렸다**(fail-open). 배포 시 키를 한 번만
 * 누락해도 누구나 임의 sessionId 에 대해 채점/벌크채점을 트리거할 수 있었다
 * (OpenAI 과금 DoS·데이터 오염). cron 라우트의 fail-closed 패턴과 정책을 통일한다.
 */

type RouteHandler = (req: NextRequest) => Promise<Response> | Response;

export type QStashGuardMode = "verify" | "reject" | "passthrough";

/**
 * 순수 정책 판정 (테스트 대상).
 * - 서명키 있음 → 항상 검증(verify).
 * - 서명키 없음 + 프로덕션(Vercel 또는 NODE_ENV=production) → 거부(reject, fail-closed).
 * - 서명키 없음 + 로컬 개발 → 통과(passthrough, QStash 없이 워커 실행 가능).
 */
export function qstashGuardMode(env: {
  QSTASH_CURRENT_SIGNING_KEY?: string;
  VERCEL?: string;
  NODE_ENV?: string;
}): QStashGuardMode {
  if (env.QSTASH_CURRENT_SIGNING_KEY) return "verify";
  if (env.VERCEL === "1" || env.NODE_ENV === "production") return "reject";
  return "passthrough";
}

/** 워커 POST 핸들러를 서명 검증 정책으로 감싼다. */
export function withQStashSignature(handler: RouteHandler): RouteHandler {
  switch (qstashGuardMode(process.env)) {
    case "verify":
      return verifySignatureAppRouter(handler) as RouteHandler;
    case "reject":
      return () =>
        NextResponse.json(
          { error: "QSTASH_SIGNING_KEY_NOT_CONFIGURED" },
          { status: 401 }
        );
    case "passthrough":
      return handler;
  }
}
