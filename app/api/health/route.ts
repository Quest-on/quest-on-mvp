import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { verifyAdminToken } from "@/lib/admin-auth";
import { getAppEnv } from "@/lib/app-env";
import { auditEnv, isEnvAuditHealthy } from "@/lib/env-manifest";

export const runtime = "nodejs";

export async function GET() {
  // P0-1: Only expose detailed checks to authenticated admin requests
  const { isAdmin } = await verifyAdminToken();

  const appEnv = getAppEnv();

  if (!isAdmin) {
    // Unauthenticated: minimal response only
    return NextResponse.json({
      status: "ok",
      timestamp: new Date().toISOString(),
    });
  }

  // Admin-only: full diagnostic checks
  const checks: Record<
    string,
    { ok: boolean; latencyMs?: number; error?: string; warning?: string }
  > = {};

  // 1. Database connectivity check
  const dbStart = Date.now();
  try {
    const supabase = getSupabaseServer();
    const { error } = await supabase.from("exams").select("id").limit(1);
    checks.database = {
      ok: !error,
      latencyMs: Date.now() - dbStart,
      ...(error && { error: error.message }),
    };
  } catch (err) {
    checks.database = {
      ok: false,
      latencyMs: Date.now() - dbStart,
      error: err instanceof Error ? err.message : "Unknown DB error",
    };
  }

  // 2. OpenAI API key presence check (no actual API call)
  checks.openai = {
    ok: !!process.env.OPENAI_API_KEY,
    ...(!process.env.OPENAI_API_KEY && { error: "OPENAI_API_KEY not set" }),
  };

  // 3. Environment variable audit — 환경(APP_ENV)별 필수 목록은 lib/env-manifest.ts.
  //    이름만 노출하고 값은 절대 담지 않는다.
  const audit = auditEnv(process.env, appEnv);
  const envProblems: string[] = [];
  if (audit.missingRequired.length > 0) {
    envProblems.push(`Missing required: ${audit.missingRequired.join(", ")}`);
  }
  if (audit.forbiddenPresent.length > 0) {
    envProblems.push(`Forbidden in ${appEnv}: ${audit.forbiddenPresent.join(", ")}`);
  }
  checks.env = {
    ok: isEnvAuditHealthy(audit),
    ...(envProblems.length > 0 && { error: envProblems.join(" | ") }),
    ...(audit.missingRecommended.length > 0 && {
      warning: `Missing recommended: ${audit.missingRecommended.join(", ")}`,
    }),
  };

  // 4. 배포 식별 + 통합 활성 여부 (스테이징이 프로덕션 자원을 쓰고 있는지 눈으로 확인)
  const runtimeInfo = {
    appEnv,
    vercelEnv: process.env.VERCEL_ENV ?? null,
    commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null,
    integrations: {
      qstash: !!process.env.QSTASH_TOKEN,
      qstashSignatureVerification: !!process.env.QSTASH_CURRENT_SIGNING_KEY,
      redis: !!process.env.UPSTASH_REDIS_REST_URL,
      cronSecret: !!process.env.CRON_SECRET,
      authBypass: !!process.env.TEST_BYPASS_SECRET,
    },
  };

  const allOk = Object.values(checks).every((c) => c.ok);

  return NextResponse.json(
    {
      status: allOk ? "healthy" : "degraded",
      timestamp: new Date().toISOString(),
      runtime: runtimeInfo,
      checks,
    },
    { status: allOk ? 200 : 503 }
  );
}
