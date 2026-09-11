import { NextRequest } from "next/server";
import { searchUniversities } from "@/lib/seoul-universities";
import { successJson, errorJson } from "@/lib/api-response";
import { checkRateLimitAsync, RATE_LIMITS } from "@/lib/rate-limit";

export async function GET(request: NextRequest) {
  try {
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    const rl = await checkRateLimitAsync(`university-search:${ip}`, RATE_LIMITS.publicSearch);
    if (!rl.allowed) {
      return errorJson("RATE_LIMITED", "Too many requests", 429);
    }

    const searchParams = request.nextUrl.searchParams;
    const query = searchParams.get("q") || "";
    // limit 파라미터가 있으면 사용하고, 없으면 제한 없음 (또는 충분히 큰 값)
    const limitParam = searchParams.get("limit");
    const limit = limitParam ? parseInt(limitParam, 10) : undefined;

    const results = await searchUniversities(query, limit);

    return successJson({ universities: results });
  } catch {
    return errorJson("INTERNAL_ERROR", "Failed to search universities", 500);
  }
}
