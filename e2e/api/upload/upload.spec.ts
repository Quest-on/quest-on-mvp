/**
 * 업로드 API 통합 테스트 (/api/upload, /api/upload/signed-url).
 *
 * 레이트 리밋 — 케이스를 더하기 전에 읽을 것.
 * 두 업로드 라우트는 같은 키 `upload:<user.id>` 를 쓰고 한도는 RATE_LIMITS.upload,
 * 즉 사용자당 10회/60초다(lib/rate-limit.ts). 서버는 한 프로세스이고 한도는 메모리 고정 창이라
 * 파일 실행이 재시도(CI retries: 1)돼도 같은 60초 창에 쌓이고 풀리지 않는다. 한도는 인증과 강사
 * 권한 확인 뒤에 세므로 student(403), anon(401), GET(405)은 세지 않고, 강사 요청은 400/413 으로
 * 끝나도 센다. /api/extract-text 는 다른 키(`extract-text:`)라 세지 않는다.
 *
 *   공용 instructorRequest("test-instructor-id") 한 번 실행당 3회:
 *     PDF 201 (1) + .exe 400 (1) + 5MB 413 (1). 전부 재시도돼도 6회.
 *   스프레드시트 케이스 4개(#507)는 테스트마다 고유한 강사 id 로 1회씩이다. 공용 한도를 쓰지 않고,
 *     재시도하면 새 id 를 받으므로 한도와 무관하다. 케이스 행렬(확장자, MIME, 대소문자, 이중 확장자)은
 *     핸들러를 직접 호출하는 __tests__/upload-routes.test.ts 가 덮는다. 여기는 통합 스모크다.
 *
 * 공용 instructorRequest 로 업로드 케이스를 더한다면 위 3회에 더해 10회를 넘지 않게 하고(재시도까지
 * 두 배로 센다), 가능하면 아래 newInstructorContext 로 고유한 id 를 쓴다.
 */
import { randomUUID } from "crypto";
import type {
  APIRequestContext,
  PlaywrightWorkerArgs,
} from "@playwright/test";
import { test, expect, BYPASS_SECRET } from "../../fixtures/auth.fixture";
import { cleanupTestData } from "../../helpers/seed";

// 한도는 사용자별이라, 이 id 로 요청하는 컨텍스트는 다른 케이스와 한도를 나누지 않는다
// (e2e/api/session/session-detail.spec.ts 가 다른 강사를 흉내 내는 방식과 같다).
async function newInstructorContext(
  playwright: PlaywrightWorkerArgs["playwright"]
): Promise<APIRequestContext> {
  return playwright.request.newContext({
    baseURL: "http://localhost:3000",
    extraHTTPHeaders: {
      "x-test-user-id": `test-instructor-upload-${randomUUID()}`,
      "x-test-user-role": "instructor",
      "x-test-bypass-token": BYPASS_SECRET,
      Accept: "application/json",
    },
  });
}

// Minimal valid PDF buffer
const MINIMAL_PDF = Buffer.from(
  "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/MediaBox[0 0 612 792]/Parent 2 0 R>>endobj\nxref\n0 4\n0000000000 65535 f \n0000000009 00000 n \n0000000058 00000 n \n0000000115 00000 n \ntrailer<</Size 4/Root 1 0 R>>\nstartxref\n190\n%%EOF",
  "utf-8"
);

// 스프레드시트는 텍스트 추출 없이 파일로만 저장되므로 내용은 검사되지 않는다 (#507).
const SMALL_DATA_BUFFER = Buffer.from("a,b\n1,2\n", "utf-8");
const XLSX_MIME =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const XLSM_MIME = "application/vnd.ms-excel.sheet.macroEnabled.12";

test.describe("Upload API — /api/upload", () => {
  test.afterEach(async () => {
    await cleanupTestData();
  });

  // ── Instructor (authorized) ──

  test("instructor uploads valid PDF → 201 with url", async ({
    instructorRequest,
  }) => {
    const res = await instructorRequest.post("/api/upload", {
      multipart: {
        file: {
          name: "test-document.pdf",
          mimeType: "application/pdf",
          buffer: MINIMAL_PDF,
        },
      },
    });

    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.url).toBeTruthy();
    expect(body.objectKey).toBeTruthy();
    expect(body.meta.originalName).toBe("test-document.pdf");
  });

  // ── Spreadsheet (#507) — 고유한 강사 id, 1회씩 ──

  test("instructor uploads xlsx → 201 with url", async ({ playwright }) => {
    const instructor = await newInstructorContext(playwright);
    try {
      const res = await instructor.post("/api/upload", {
        multipart: {
          file: {
            name: "data.xlsx",
            mimeType: XLSX_MIME,
            buffer: SMALL_DATA_BUFFER,
          },
        },
      });

      expect(res.status()).toBe(201);
      const body = await res.json();
      expect(body.ok).toBe(true);
      expect(body.url).toBeTruthy();
      expect(body.meta.originalName).toBe("data.xlsx");
      expect(body.meta.mime).toBe(XLSX_MIME);
    } finally {
      await instructor.dispose();
    }
  });

  test("macro-enabled .xlsm → 400 INVALID_FILE_EXTENSION", async ({
    playwright,
  }) => {
    const instructor = await newInstructorContext(playwright);
    try {
      const res = await instructor.post("/api/upload", {
        multipart: {
          file: {
            name: "macro.xlsm",
            mimeType: XLSM_MIME,
            buffer: SMALL_DATA_BUFFER,
          },
        },
      });

      expect(res.status()).toBe(400);
      const body = await res.json();
      expect(body.code).toBe("INVALID_FILE_EXTENSION");
    } finally {
      await instructor.dispose();
    }
  });

  // ── Student (forbidden) ──

  test("student cannot upload → 403", async ({ studentRequest }) => {
    const res = await studentRequest.post("/api/upload", {
      multipart: {
        file: {
          name: "test.pdf",
          mimeType: "application/pdf",
          buffer: MINIMAL_PDF,
        },
      },
    });

    expect(res.status()).toBe(403);
    const body = await res.json();
    expect(body.code).toBe("FORBIDDEN");
  });

  // ── Anonymous (unauthorized) ──

  test("anon cannot upload → 401", async ({ anonRequest }) => {
    const res = await anonRequest.post("/api/upload", {
      multipart: {
        file: {
          name: "test.pdf",
          mimeType: "application/pdf",
          buffer: MINIMAL_PDF,
        },
      },
    });

    expect(res.status()).toBe(401);
    const body = await res.json();
    expect(body.code).toBe("UNAUTHORIZED");
  });

  // ── Invalid file type ──

  test("unsupported file type → 400", async ({ instructorRequest }) => {
    const res = await instructorRequest.post("/api/upload", {
      multipart: {
        file: {
          name: "malicious.exe",
          mimeType: "application/x-msdownload",
          buffer: Buffer.from("MZ fake exe content"),
        },
      },
    });

    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.code).toBe("INVALID_FILE_EXTENSION");
  });

  // ── Oversized file ──

  test("file exceeding 4MB → 413", async ({ instructorRequest }) => {
    // Create a buffer slightly over 4MB (Vercel serverless body limit: 4.5MB)
    const oversizedBuffer = Buffer.alloc(5 * 1024 * 1024, "a");

    const res = await instructorRequest.post("/api/upload", {
      multipart: {
        file: {
          name: "huge-file.pdf",
          mimeType: "application/pdf",
          buffer: oversizedBuffer,
        },
      },
    });

    // Either 413 (request entity too large), 400, or 500 (Next.js body size limit)
    expect([400, 413, 500]).toContain(res.status());
  });

  // ── GET method not allowed ──

  test("GET /api/upload → 405", async ({ instructorRequest }) => {
    const res = await instructorRequest.get("/api/upload");

    expect(res.status()).toBe(405);
    const body = await res.json();
    expect(body.code).toBe("METHOD_NOT_ALLOWED");
  });
});

// 4MB 를 넘는 파일은 클라이언트가 /api/upload/signed-url 로 서명 URL 을 받아 올린다.
// 여기서는 URL 발급 판정(확장자 허용 목록)만 본다. 오브젝트는 만들어지지 않는다.
// 레이트 리밋: 케이스마다 고유한 강사 id 로 1회씩이다(파일 머리 주석 참고).
test.describe("Upload API — /api/upload/signed-url", () => {
  test.afterEach(async () => {
    await cleanupTestData();
  });

  test("instructor gets signed URL for xlsx → 200", async ({ playwright }) => {
    const instructor = await newInstructorContext(playwright);
    try {
      const res = await instructor.post("/api/upload/signed-url", {
        data: {
          fileName: "data.xlsx",
          fileSize: 5 * 1024 * 1024,
          contentType: XLSX_MIME,
        },
      });

      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(body.ok).toBe(true);
      expect(body.signedUrl).toBeTruthy();
      expect(body.publicUrl).toBeTruthy();
      expect(body.storagePath).toMatch(/.xlsx$/);
      expect(body.meta.originalName).toBe("data.xlsx");
    } finally {
      await instructor.dispose();
    }
  });

  test("macro-enabled .xlsm → 400 INVALID_FILE_EXTENSION", async ({
    playwright,
  }) => {
    const instructor = await newInstructorContext(playwright);
    try {
      const res = await instructor.post("/api/upload/signed-url", {
        data: {
          fileName: "macro.xlsm",
          fileSize: 5 * 1024 * 1024,
          contentType: XLSM_MIME,
        },
      });

      expect(res.status()).toBe(400);
      const body = await res.json();
      expect(body.code).toBe("INVALID_FILE_EXTENSION");
    } finally {
      await instructor.dispose();
    }
  });
});

test.describe("Extract Text API — /api/extract-text", () => {
  test.afterEach(async () => {
    await cleanupTestData();
  });

  test("anon cannot extract text → 401", async ({ anonRequest }) => {
    const res = await anonRequest.post("/api/extract-text", {
      data: {
        fileUrl: "https://example.com/test.pdf",
        fileName: "test.pdf",
        mimeType: "application/pdf",
      },
    });

    expect(res.status()).toBe(401);
  });

  test("student cannot extract text → 403", async ({ studentRequest }) => {
    const res = await studentRequest.post("/api/extract-text", {
      data: {
        fileUrl: "https://example.com/test.pdf",
        fileName: "test.pdf",
        mimeType: "application/pdf",
      },
    });

    expect(res.status()).toBe(403);
  });

  test("missing required fields → 400", async ({ instructorRequest }) => {
    const res = await instructorRequest.post("/api/extract-text", {
      data: {},
    });

    expect(res.status()).toBe(400);
  });
});
