// Node.js Runtime 사용 (Vercel serverless body 제한: 4.5MB)
export const runtime = "nodejs";
export const maxDuration = 60;

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase-server";
import { currentUser } from "@/lib/get-current-user";
import { randomUUID } from "crypto";
import { logError } from "@/lib/logger";
import { checkRateLimitAsync, RATE_LIMITS } from "@/lib/rate-limit";

import { UPLOAD_ALLOWED_EXTENSIONS, UPLOAD_ALLOWED_MIME_TYPES } from "@/lib/upload-allowlist";
import { makeMaterialObjectKey, materialStoragePath } from "@/lib/material-object-key";
// Initialize Supabase client with service role key for server-side operations
const supabase = getSupabaseServer();

// 표준화된 에러 응답 헬퍼
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

// OPTIONS 요청 처리 (CORS preflight)
export async function OPTIONS(request: NextRequest) {
  return NextResponse.json(
    {},
    {
      status: 200,
      headers: {
        Allow: "POST, OPTIONS",
      },
    }
  );
}

// GET 요청에 대한 명확한 에러 처리
export async function GET(request: NextRequest) {
  return errorJson(
    "METHOD_NOT_ALLOWED",
    "GET 메서드는 지원하지 않습니다. POST 메서드를 사용하세요.",
    { allowedMethods: ["POST", "OPTIONS"] },
    405
  );
}

export async function POST(request: NextRequest) {
  let objectKey: string | null = null;

  try {
    // Get current user
    const user = await currentUser();
    if (!user) {
      return errorJson("UNAUTHORIZED", "로그인이 필요합니다.", null, 401);
    }

    // Check if user is instructor
    const userRole = user.role;

    if (userRole !== "instructor") {
      return errorJson(
        "FORBIDDEN",
        "강사 권한이 필요합니다.",
        { userRole, userId: user.id },
        403
      );
    }

    const rl = await checkRateLimitAsync(`upload:${user.id}`, RATE_LIMITS.upload);
    if (!rl.allowed) {
      return errorJson("RATE_LIMITED", "업로드 요청이 너무 많습니다. 잠시 후 다시 시도하세요.", undefined, 429);
    }

    // 반드시 form-data로만 받기 (쿼리에 파일명 넣지 않기)
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const originalName = file?.name || "unnamed";

    if (!file) {
      return errorJson("NO_FILE", "파일이 존재하지 않습니다.", null, 400);
    }

    // Validate file extension (whitelist, last extension only to prevent double-extension attacks)
    const extMatch = originalName.match(/\.([a-zA-Z0-9]+)$/);
    const fileExtension = extMatch ? `.${extMatch[1].toLowerCase()}` : "";
    if (!fileExtension || !UPLOAD_ALLOWED_EXTENSIONS.has(fileExtension)) {
      return errorJson(
        "INVALID_FILE_EXTENSION",
        "허용되지 않는 파일 확장자입니다.",
        { fileName: originalName, extension: fileExtension, allowedExtensions: [...UPLOAD_ALLOWED_EXTENSIONS] },
        400
      );
    }

    // Validate file type (화이트리스트)
    const allowedTypes = [...UPLOAD_ALLOWED_MIME_TYPES];

    if (!allowedTypes.includes(file.type)) {
      return errorJson(
        "INVALID_FILE_TYPE",
        "지원되지 않는 파일 형식입니다.",
        { fileType: file.type, allowedTypes },
        400
      );
    }

    // Validate file size (4MB - Vercel serverless body 제한 4.5MB 대응)
    // 4MB 초과 파일은 signed URL 방식(/api/upload/signed-url)으로 업로드
    const maxSize = 4 * 1024 * 1024;
    if (file.size > maxSize) {
      return errorJson(
        "FILE_TOO_LARGE",
        "파일 크기가 4MB를 초과합니다. 큰 파일은 자동으로 다른 방식으로 업로드됩니다.",
        { fileSize: file.size, maxSize },
        413
      );
    }

    // 안전한 저장용 키 생성 (원본명은 메타데이터로만)
    objectKey = makeMaterialObjectKey(originalName);

    // Supabase Storage 경로: instructor-{userId}/{objectKey}
    // objectKey는 이미 날짜/uuid.ext 형식이므로 그대로 사용 (규칙은 lib/material-object-key.ts)
    const storagePath = materialStoragePath(user.id, objectKey);

    // Convert file to buffer (no compression - direct upload)
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Supabase Storage 업로드 시도
    const { data, error } = await supabase.storage
      .from("exam-materials")
      .upload(storagePath, buffer, {
        contentType: file.type,
        upsert: true, // 임시로 덮어쓰기 허용 (중복 파일 에러 방지)
      });

    if (error) {
      // 에러 타입별 구체적인 메시지
      let userMessage = "파일 저장 중 오류가 발생했습니다.";
      let errorCode = "STORAGE_ERROR";

      if (error.message.includes("Bucket not found")) {
        userMessage = "스토리지 버킷을 찾을 수 없습니다.";
        errorCode = "BUCKET_NOT_FOUND";
      } else if (
        error.message.includes("row-level security") ||
        error.message.includes("policy")
      ) {
        userMessage = "파일 업로드 권한이 없습니다. RLS 정책을 확인하세요.";
        errorCode = "POLICY_VIOLATION";
      } else if (error.message.includes("already exists")) {
        userMessage = "같은 이름의 파일이 이미 존재합니다.";
        errorCode = "FILE_EXISTS";
      } else if (
        error.message.includes("Invalid JWT") ||
        error.message.includes("JWT")
      ) {
        userMessage = "인증 토큰이 유효하지 않습니다.";
        errorCode = "INVALID_TOKEN";
      }

      logError("Supabase storage upload failed", error, {
        path: "/api/upload",
        user_id: user.id,
        additionalData: { storagePath, bucket: "exam-materials", errorCode },
      });

      return errorJson(
        errorCode,
        userMessage,
        undefined,
        500
      );
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from("exam-materials")
      .getPublicUrl(data.path);

    // 표준화된 성공 응답 (원본명은 메타데이터로만)
    return NextResponse.json(
      {
        ok: true,
        objectKey: data.path, // 클라이언트는 이 key로만 접근
        url: urlData.publicUrl,
        meta: {
          originalName: originalName,
          size: file.size,
          mime: file.type,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    logError("Unexpected upload error", error, {
      path: "/api/upload",
      additionalData: { objectKey },
    });

    return errorJson(
      "UPLOAD_FAILED",
      "업로드 중 예상치 못한 오류가 발생했습니다.",
      undefined,
      500
    );
  }
}
