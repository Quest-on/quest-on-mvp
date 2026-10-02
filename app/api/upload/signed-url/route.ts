export const runtime = "nodejs";
export const maxDuration = 30;

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { currentUser } from "@/lib/get-current-user";
import { randomUUID } from "crypto";
import { logError } from "@/lib/logger";
import { checkRateLimitAsync, RATE_LIMITS } from "@/lib/rate-limit";

import { UPLOAD_ALLOWED_EXTENSIONS, UPLOAD_ALLOWED_MIME_TYPES } from "@/lib/upload-allowlist";
const supabase = getSupabaseServer();

function errorJson(
  code: string,
  message: string,
  details?: unknown,
  status = 400
) {
  const traceId = randomUUID();
  return NextResponse.json(
    { ok: false, code, message, details, traceId },
    { status }
  );
}

function makeSafeObjectKey(originalName: string, extFallback = ".bin") {
  const ts = new Date().toISOString().slice(0, 10);
  const id = randomUUID();
  const m = originalName.match(/\.([a-zA-Z0-9]{1,8})$/);
  const ext = m ? `.${m[1].toLowerCase()}` : extFallback;
  return `${ts}_${id}${ext}`;
}

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

export async function POST(request: NextRequest) {
  try {
    const user = await currentUser();
    if (!user) {
      return errorJson("UNAUTHORIZED", "로그인이 필요합니다.", null, 401);
    }

    const userRole = user.role;
    if (userRole !== "instructor") {
      return errorJson("FORBIDDEN", "강사 권한이 필요합니다.", null, 403);
    }

    const rl = await checkRateLimitAsync(`upload:${user.id}`, RATE_LIMITS.upload);
    if (!rl.allowed) {
      return errorJson("RATE_LIMITED", "업로드 요청이 너무 많습니다. 잠시 후 다시 시도하세요.", undefined, 429);
    }

    const body = await request.json();
    const { fileName, fileSize, contentType } = body as {
      fileName: string;
      fileSize: number;
      contentType: string;
    };

    if (!fileName || !fileSize || !contentType) {
      return errorJson(
        "INVALID_REQUEST",
        "fileName, fileSize, contentType이 필요합니다.",
        null,
        400
      );
    }

    // Validate extension
    const extMatch = fileName.match(/\.([a-zA-Z0-9]+)$/);
    const fileExtension = extMatch ? `.${extMatch[1].toLowerCase()}` : "";
    if (!fileExtension || !UPLOAD_ALLOWED_EXTENSIONS.has(fileExtension)) {
      return errorJson(
        "INVALID_FILE_EXTENSION",
        "허용되지 않는 파일 확장자입니다.",
        { fileName, extension: fileExtension },
        400
      );
    }

    // Validate MIME type
    if (!UPLOAD_ALLOWED_MIME_TYPES.has(contentType)) {
      return errorJson(
        "INVALID_FILE_TYPE",
        "지원되지 않는 파일 형식입니다.",
        { contentType },
        400
      );
    }

    // Validate size
    if (fileSize > MAX_FILE_SIZE) {
      return errorJson(
        "FILE_TOO_LARGE",
        "파일 크기가 50MB를 초과합니다.",
        { fileSize, maxSize: MAX_FILE_SIZE },
        413
      );
    }

    const objectKey = makeSafeObjectKey(fileName);
    const storagePath = `instructor-${user.id}/${objectKey}`;

    // Create signed upload URL using service role key
    const { data, error } = await supabase.storage
      .from("exam-materials")
      .createSignedUploadUrl(storagePath);

    if (error) {
      logError("Signed URL creation failed", error, {
        path: "/api/upload/signed-url",
        user_id: user.id,
        additionalData: { storagePath, bucket: "exam-materials" },
      });
      return errorJson(
        "SIGNED_URL_FAILED",
        "업로드 URL 생성에 실패했습니다.",
        undefined,
        500
      );
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from("exam-materials")
      .getPublicUrl(storagePath);

    return NextResponse.json(
      {
        ok: true,
        signedUrl: data.signedUrl,
        token: data.token,
        storagePath,
        publicUrl: urlData.publicUrl,
        meta: {
          originalName: fileName,
          size: fileSize,
          mime: contentType,
        },
      },
      { status: 200 }
    );
  } catch (error) {
    logError("Unexpected signed URL error", error, {
      path: "/api/upload/signed-url",
    });

    return errorJson(
      "SIGNED_URL_FAILED",
      "업로드 URL 생성 중 예상치 못한 오류가 발생했습니다.",
      undefined,
      500
    );
  }
}
