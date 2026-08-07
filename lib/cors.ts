import { NextRequest, NextResponse } from "next/server";

/**
 * Production origins used when ALLOWED_ORIGINS is not set.
 *
 * 반드시 실제로 소유·서비스 중인 오리진만 넣는다. 소유하지 않은 도메인을
 * 넣어두면 허용 목록이 사실과 어긋나고, 나중에 그 도메인을 제3자가 등록했을 때
 * 정책을 다시 검토해야 한다.
 */
const PRODUCTION_ORIGINS = [
  "https://quest-on.app",
  "https://quest-on.vercel.app",
];

/** Non-production 폴백에만 추가되는 로컬 개발 오리진. */
const DEVELOPMENT_ORIGINS = [
  "http://localhost:3000",
  "http://localhost:3001",
];

/**
 * Allowed origins for CORS.
 * Set ALLOWED_ORIGINS env var as comma-separated list, or uses defaults.
 *
 * 프로덕션 폴백에는 localhost가 절대 포함되지 않는다.
 */
function getAllowedOrigins(): string[] {
  const envOrigins = process.env.ALLOWED_ORIGINS;
  if (envOrigins) {
    return envOrigins.split(",").map((o) => o.trim()).filter(Boolean);
  }

  if (process.env.NODE_ENV === "production") {
    return PRODUCTION_ORIGINS;
  }

  return [...PRODUCTION_ORIGINS, ...DEVELOPMENT_ORIGINS];
}

function isOriginAllowed(origin: string | null): boolean {
  if (!origin) return false;
  if (process.env.NODE_ENV === "development") return true;
  return getAllowedOrigins().includes(origin);
}

/**
 * Get CORS headers for a given request origin.
 * Returns empty object if origin is not allowed.
 */
export function getCorsHeaders(
  request: NextRequest,
  methods = "POST, OPTIONS"
): Record<string, string> {
  const origin = request.headers.get("origin");
  if (!isOriginAllowed(origin)) {
    return {};
  }

  return {
    "Access-Control-Allow-Origin": origin!,
    "Access-Control-Allow-Methods": methods,
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

/**
 * Handle OPTIONS preflight with proper CORS headers.
 */
export function handleCorsPreFlight(
  request: NextRequest,
  methods = "POST, OPTIONS"
): NextResponse {
  const headers = getCorsHeaders(request, methods);
  return new NextResponse(null, {
    status: 204,
    headers,
  });
}
