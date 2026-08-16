import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { successJson, errorJson } from "@/lib/api-response";
import { checkRateLimitAsync, RATE_LIMITS } from "@/lib/rate-limit";
import { logError } from "@/lib/logger";
import { loadCurrentVersion, publishVersion } from "@/lib/ai-config-store";
import {
  AI_TASKS,
  AiProfileInvalidError,
  parseSparseOverrides,
  resolveAiTaskProfile,
  type AiTask,
  type ResolvedAiTaskProfile,
  type AiTaskProfileSources,
} from "@/lib/ai-task-profile";

/**
 * 관리자 AI 설정 API (이슈 #118)
 *
 * GET  현재 production 버전의 **원본 sparse override** 와 **해석된 effective 값**,
 *      그리고 필드별 출처를 함께 돌려준다. 셋을 분리하는 이유: effective 만 주면
 *      UI 가 상속받은 값을 사용자가 지정한 값처럼 되돌려 보내게 되고, 첫 저장에서
 *      env/코드 기본값이 영구히 물질화된다.
 * POST sparse override 만 받는다. 키 부재=상속, optional 의 명시적 null=제거.
 *      actor 는 서버가 파생한다 — 페이로드로 받지 않는다.
 */

type EffectiveProfiles = Record<AiTask, ResolvedAiTaskProfile>;
type ProfileSources = Record<AiTask, AiTaskProfileSources>;

function resolveAll(overrides: Parameters<typeof resolveAiTaskProfile>[0]["overrides"]) {
  const effectiveProfiles = {} as EffectiveProfiles;
  const sources = {} as ProfileSources;

  for (const task of AI_TASKS) {
    const { profile, sources: fieldSources } = resolveAiTaskProfile({ task, overrides });
    effectiveProfiles[task] = profile;
    sources[task] = fieldSources;
  }

  return { effectiveProfiles, sources };
}

export async function GET() {
  try {
    const denied = await requireAdmin();
    if (denied) return denied;

    const rl = await checkRateLimitAsync("admin", RATE_LIMITS.general);
    if (!rl.allowed) {
      return errorJson("RATE_LIMITED", "Too many requests. Please try again later.", 429);
    }

    const version = await loadCurrentVersion();
    const { effectiveProfiles, sources } = resolveAll(version.overrides);

    return successJson({
      versionId: version.versionId,
      // 저장된 그대로 — missing 과 explicit null 이 보존된다.
      overrides: version.overrides,
      effectiveProfiles,
      sources,
      tasks: AI_TASKS,
    });
  } catch (error) {
    logError("admin ai-config: GET failed", error, { path: "/api/admin/ai-config" });
    return errorJson("INTERNAL_ERROR", "Failed to load AI config", 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    const denied = await requireAdmin();
    if (denied) return denied;

    const rl = await checkRateLimitAsync("admin", RATE_LIMITS.general);
    if (!rl.allowed) {
      return errorJson("RATE_LIMITED", "Too many requests. Please try again later.", 429);
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return errorJson("VALIDATION_ERROR", "Invalid JSON body", 400);
    }

    if (body === null || typeof body !== "object" || Array.isArray(body)) {
      return errorJson("VALIDATION_ERROR", "Body must be an object", 400);
    }

    const { overrides, reason } = body as { overrides?: unknown; reason?: unknown };

    if (typeof reason !== "string" || reason.trim() === "") {
      return errorJson("VALIDATION_ERROR", "변경 사유를 입력해야 합니다.", 400);
    }

    // 저장 전에 의미 검증까지 한다. 모델이 가격표에 없거나 모델×effort 조합이
    // 지원되지 않으면 여기서 걸린다 — I/O 전에 막는 것이 이 이슈의 계약이다.
    let parsed;
    try {
      parsed = parseSparseOverrides(overrides ?? {});
      resolveAll(parsed);
    } catch (error) {
      if (error instanceof AiProfileInvalidError) {
        return errorJson("VALIDATION_ERROR", error.message, 400);
      }
      throw error;
    }

    // actor 는 서버가 만든다. 페이로드의 actor/versionId 는 무시된다.
    const actor = `admin:${process.env.ADMIN_USERNAME ?? "unknown"}`;

    const result = await publishVersion({
      overrides: parsed,
      actor,
      reason: reason.trim(),
    });

    return successJson({
      versionId: result.newVersionId,
      previousVersionId: result.previousVersionId,
      cacheWarning: result.cacheWarning,
    });
  } catch (error) {
    if (error instanceof AiProfileInvalidError) {
      return errorJson("VALIDATION_ERROR", error.message, 400);
    }
    logError("admin ai-config: POST failed", error, { path: "/api/admin/ai-config" });
    return errorJson("INTERNAL_ERROR", "Failed to publish AI config", 500);
  }
}
