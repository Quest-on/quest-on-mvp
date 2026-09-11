// Node.js Runtime 사용
export const runtime = "nodejs";
export const maxDuration = 30;

import { NextRequest } from "next/server";
import { currentUser } from "@/lib/get-current-user";
import { createEmbedding } from "@/lib/embedding";
import { successJson, errorJson } from "@/lib/api-response";
import { checkRateLimitAsync, RATE_LIMITS } from "@/lib/rate-limit";
import { logError } from "@/lib/logger";
import { z } from "zod";

/**
 * POST /api/embed
 * 텍스트를 임베딩 벡터로 변환하는 API
 */
const BodySchema = z.object({ text: z.string().min(1) }).strict();

export async function POST(request: NextRequest) {
  try {
    // Authentication check - only instructors should generate embeddings
    const user = await currentUser();
    if (!user) {
      return errorJson("UNAUTHORIZED", "Unauthorized", 401);
    }

    const userRole = user.role;
    if (userRole !== "instructor") {
      return errorJson("FORBIDDEN", "Instructor access required", 403);
    }

    // Rate limiting
    const rl = await checkRateLimitAsync(`embed:${user.id}`, RATE_LIMITS.ai);
    if (!rl.allowed) {
      return errorJson("RATE_LIMITED", "Too many requests. Please try again later.", 429);
    }

    // API 오류 문구는 사용자 화면에 그대로 뜨지 않는다. 코드로 판정하고
    // 화면 문구는 클라이언트가 고른다.
    const parsed = BodySchema.safeParse(await request.json());
    if (!parsed.success) {
      return errorJson("INVALID_INPUT", "Invalid input", 400);
    }
    const { text } = parsed.data;

    if (text.trim().length === 0) {
      return errorJson("INVALID_INPUT", "Text is empty", 400);
    }

    const embedding = await createEmbedding(text, {
      route: "/api/embed",
      userId: user.id,
      metadata: {
        source: "manual_embed",
      },
    });

    return successJson({
      embedding,
      dimensions: embedding.length,
    });
  } catch (error) {
    logError("Embedding generation failed", error, { path: "/api/embed" });
    return errorJson("INTERNAL_ERROR", "Failed to create embedding", 500);
  }
}
