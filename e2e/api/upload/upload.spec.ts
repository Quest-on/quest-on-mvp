import { test, expect } from "../../fixtures/auth.fixture";
import { cleanupTestData } from "../../helpers/seed";

// Minimal valid PDF buffer
const MINIMAL_PDF = Buffer.from(
  "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/MediaBox[0 0 612 792]/Parent 2 0 R>>endobj\nxref\n0 4\n0000000000 65535 f \n0000000009 00000 n \n0000000058 00000 n \n0000000115 00000 n \ntrailer<</Size 4/Root 1 0 R>>\nstartxref\n190\n%%EOF",
  "utf-8"
);

// 스프레드시트와 CSV 는 텍스트 추출 없이 파일로만 저장되므로 내용은 검사되지 않는다 (#507).
const SMALL_DATA_BUFFER = Buffer.from("a,b\n1,2\n", "utf-8");
const SPREADSHEET_UPLOADS = [
  {
    name: "data.xlsx",
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  },
  { name: "legacy.xls", mimeType: "application/vnd.ms-excel" },
  { name: "data.csv", mimeType: "text/csv" },
  // Windows 의 일부 브라우저는 .csv 를 application/vnd.ms-excel 로 보낸다.
  { name: "excel-data.csv", mimeType: "application/vnd.ms-excel" },
] as const;

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

  // ── Spreadsheet / CSV (#507) ──

  for (const { name, mimeType } of SPREADSHEET_UPLOADS) {
    test(`instructor uploads ${name} (${mimeType}) → 201`, async ({
      instructorRequest,
    }) => {
      const res = await instructorRequest.post("/api/upload", {
        multipart: {
          file: { name, mimeType, buffer: SMALL_DATA_BUFFER },
        },
      });

      expect(res.status()).toBe(201);
      const body = await res.json();
      expect(body.ok).toBe(true);
      expect(body.url).toBeTruthy();
      expect(body.meta.originalName).toBe(name);
      expect(body.meta.mime).toBe(mimeType);
    });
  }

  test("macro-enabled .xlsm → 400 INVALID_FILE_EXTENSION", async ({
    instructorRequest,
  }) => {
    const res = await instructorRequest.post("/api/upload", {
      multipart: {
        file: {
          name: "macro.xlsm",
          mimeType: "application/vnd.ms-excel.sheet.macroEnabled.12",
          buffer: SMALL_DATA_BUFFER,
        },
      },
    });

    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.code).toBe("INVALID_FILE_EXTENSION");
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
// 여기서는 URL 발급 판정(확장자·MIME 허용 목록)만 본다. 오브젝트는 만들어지지 않는다.
test.describe("Upload API — /api/upload/signed-url", () => {
  test.afterEach(async () => {
    await cleanupTestData();
  });

  for (const { name, mimeType } of SPREADSHEET_UPLOADS) {
    test(`instructor gets signed URL for ${name} (${mimeType}) → 200`, async ({
      instructorRequest,
    }) => {
      const res = await instructorRequest.post("/api/upload/signed-url", {
        data: { fileName: name, fileSize: 5 * 1024 * 1024, contentType: mimeType },
      });

      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(body.ok).toBe(true);
      expect(body.signedUrl).toBeTruthy();
      expect(body.publicUrl).toBeTruthy();
      expect(body.storagePath).toMatch(
        new RegExp(`\\.${name.split(".").pop()}$`)
      );
      expect(body.meta.originalName).toBe(name);
    });
  }

  test("macro-enabled .xlsm → 400 INVALID_FILE_EXTENSION", async ({
    instructorRequest,
  }) => {
    const res = await instructorRequest.post("/api/upload/signed-url", {
      data: {
        fileName: "macro.xlsm",
        fileSize: 5 * 1024 * 1024,
        contentType: "application/vnd.ms-excel.sheet.macroEnabled.12",
      },
    });

    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.code).toBe("INVALID_FILE_EXTENSION");
  });

  test("unsupported file type → 400 INVALID_FILE_EXTENSION", async ({
    instructorRequest,
  }) => {
    const res = await instructorRequest.post("/api/upload/signed-url", {
      data: {
        fileName: "malicious.exe",
        fileSize: 5 * 1024 * 1024,
        contentType: "application/x-msdownload",
      },
    });

    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.code).toBe("INVALID_FILE_EXTENSION");
  });

  test("allowed extension with unsupported MIME → 400 INVALID_FILE_TYPE", async ({
    instructorRequest,
  }) => {
    const res = await instructorRequest.post("/api/upload/signed-url", {
      data: {
        fileName: "data.xlsx",
        fileSize: 5 * 1024 * 1024,
        contentType: "text/html",
      },
    });

    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.code).toBe("INVALID_FILE_TYPE");
  });

  test("student cannot get signed URL → 403", async ({ studentRequest }) => {
    const res = await studentRequest.post("/api/upload/signed-url", {
      data: {
        fileName: "data.xlsx",
        fileSize: 5 * 1024 * 1024,
        contentType:
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      },
    });

    expect(res.status()).toBe(403);
    const body = await res.json();
    expect(body.code).toBe("FORBIDDEN");
  });

  test("anon cannot get signed URL → 401", async ({ anonRequest }) => {
    const res = await anonRequest.post("/api/upload/signed-url", {
      data: {
        fileName: "data.xlsx",
        fileSize: 5 * 1024 * 1024,
        contentType:
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      },
    });

    expect(res.status()).toBe(401);
    const body = await res.json();
    expect(body.code).toBe("UNAUTHORIZED");
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
