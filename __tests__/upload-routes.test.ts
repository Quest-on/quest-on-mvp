/**
 * 교수 자료 업로드 라우트 두 곳의 허용 목록 판정 (#507)
 *
 * /api/upload (4MB 이하, 서버가 받아 Storage 에 올림)와 /api/upload/signed-url (4MB 초과,
 * 서명 URL 발급)의 POST 를 실제로 호출해 상태 코드와 오류 코드를 본다. 목록 모듈만 검사하면
 * 라우트가 로컬 목록으로 되돌아가거나 한쪽 검사가 지워져도 통과하므로, 핸들러를 직접 부른다.
 * 인증, 레이트리밋, Supabase 클라이언트, 로거만 mock 이다.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

const {
  currentUserMock,
  checkRateLimitAsyncMock,
  logErrorMock,
  storageBucketMock,
  supabaseMock,
} = vi.hoisted(() => {
  const storageBucketMock = {
    upload: vi.fn(),
    createSignedUploadUrl: vi.fn(),
    getPublicUrl: vi.fn(),
  };
  return {
    currentUserMock: vi.fn(),
    checkRateLimitAsyncMock: vi.fn(),
    logErrorMock: vi.fn(),
    storageBucketMock,
    supabaseMock: { storage: { from: vi.fn(() => storageBucketMock) } },
  };
});

vi.mock("@/lib/get-current-user", () => ({
  currentUser: currentUserMock,
}));

vi.mock("@/lib/supabase-server", () => ({
  getSupabaseServer: () => supabaseMock,
}));

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimitAsync: checkRateLimitAsyncMock,
  RATE_LIMITS: {
    upload: { limit: 20, windowSec: 60 },
  },
}));

vi.mock("@/lib/logger", () => ({
  logError: logErrorMock,
}));

import { POST as uploadPOST } from "@/app/api/upload/route";
import { POST as signedUrlPOST } from "@/app/api/upload/signed-url/route";

const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const XLS_MIME = "application/vnd.ms-excel";
const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

type RouteResult = { status: number; body: Record<string, unknown> };

async function callUpload(fileName: string, mimeType: string): Promise<RouteResult> {
  const form = new FormData();
  form.append("file", new File([new Uint8Array([1, 2, 3])], fileName, { type: mimeType }));
  const request = new Request("http://localhost/api/upload", {
    method: "POST",
    body: form,
  }) as NextRequest;
  const response = await uploadPOST(request);
  return { status: response.status, body: await response.json() };
}

async function callSignedUrl(fileName: string, mimeType: string): Promise<RouteResult> {
  const request = new Request("http://localhost/api/upload/signed-url", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fileName, fileSize: 3, contentType: mimeType }),
  }) as NextRequest;
  const response = await signedUrlPOST(request);
  return { status: response.status, body: await response.json() };
}

const routes = [
  { label: "/api/upload", call: callUpload, successStatus: 201 },
  { label: "/api/upload/signed-url", call: callSignedUrl, successStatus: 200 },
] as const;

function storageWasTouched() {
  return (
    storageBucketMock.upload.mock.calls.length > 0 ||
    storageBucketMock.createSignedUploadUrl.mock.calls.length > 0
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  currentUserMock.mockResolvedValue({ id: "instructor-1", role: "instructor" });
  checkRateLimitAsyncMock.mockResolvedValue({
    allowed: true,
    remaining: 19,
    resetAt: Date.now() + 60_000,
  });
  supabaseMock.storage.from.mockImplementation(() => storageBucketMock);
  storageBucketMock.upload.mockImplementation(async (path: string) => ({
    data: { path },
    error: null,
  }));
  storageBucketMock.createSignedUploadUrl.mockImplementation(async (path: string) => ({
    data: { signedUrl: `https://storage.test/signed/${path}`, token: "token-1" },
    error: null,
  }));
  storageBucketMock.getPublicUrl.mockImplementation((path: string) => ({
    data: { publicUrl: `https://storage.test/public/exam-materials/${path}` },
  }));
});

describe.each(routes)("POST $label", ({ call, successStatus }) => {
  describe("허용하는 형식", () => {
    it.each([
      ["data.xlsx", XLSX_MIME],
      ["legacy.xls", XLS_MIME],
      ["data.csv", "text/csv"],
      // Windows 의 일부 브라우저는 .csv 를 application/vnd.ms-excel 로, 일부는 application/csv 로 보낸다.
      ["data.csv", XLS_MIME],
      ["data.csv", "application/csv"],
    ])("%s (%s) 를 받는다", async (fileName, mimeType) => {
      const { status, body } = await call(fileName, mimeType);

      expect(status).toBe(successStatus);
      expect(body.ok).toBe(true);
    });

    it("대문자 확장자(.XLSX)도 받는다", async () => {
      const { status, body } = await call("DATA.XLSX", XLSX_MIME);

      expect(status).toBe(successStatus);
      expect(body.ok).toBe(true);
    });

    it.each([
      ["report.pdf", "application/pdf"],
      ["slides.pptx", "application/vnd.openxmlformats-officedocument.presentationml.presentation"],
      ["essay.docx", DOCX_MIME],
      ["notes.txt", "text/plain"],
      ["doc.hwp", "application/octet-stream"],
      ["bundle.zip", "application/zip"],
      ["photo.png", "image/png"],
    ])("기존 형식 %s (%s) 는 그대로 받는다", async (fileName, mimeType) => {
      const { status, body } = await call(fileName, mimeType);

      expect(status).toBe(successStatus);
      expect(body.ok).toBe(true);
    });

    it("받은 파일은 교수자 폴더 아래 소문자 확장자 키로 저장된다", async () => {
      await call("DATA.XLSX", XLSX_MIME);

      const bucketPath = (
        storageBucketMock.upload.mock.calls[0] ?? storageBucketMock.createSignedUploadUrl.mock.calls[0]
      )[0] as string;
      expect(bucketPath).toMatch(/^instructor-instructor-1\/\d{4}-\d{2}-\d{2}_[0-9a-f-]{36}\.xlsx$/);
      expect(supabaseMock.storage.from).toHaveBeenCalledWith("exam-materials");
    });
  });

  describe("거부하는 형식", () => {
    it.each([
      ["macro.xlsm", "application/vnd.ms-excel.sheet.macroEnabled.12"],
      // 브라우저가 .xlsm 을 xlsx MIME 으로 보내도 확장자에서 막는다.
      ["macro.xlsm", XLSX_MIME],
    ])(".xlsm (%s, %s) 는 400 INVALID_FILE_EXTENSION 이다", async (fileName, mimeType) => {
      const { status, body } = await call(fileName, mimeType);

      expect(status).toBe(400);
      expect(body.code).toBe("INVALID_FILE_EXTENSION");
      expect(storageWasTouched()).toBe(false);
    });

    it.each([
      ["malware.exe", "application/x-msdownload"],
      ["page.html", "text/html"],
      ["vector.svg", "image/svg+xml"],
    ])("허용 목록 밖 %s (%s) 는 400 INVALID_FILE_EXTENSION 이다", async (fileName, mimeType) => {
      const { status, body } = await call(fileName, mimeType);

      expect(status).toBe(400);
      expect(body.code).toBe("INVALID_FILE_EXTENSION");
      expect(storageWasTouched()).toBe(false);
    });

    it("이중 확장자 a.csv.exe 는 마지막 확장자로 판정해 400 이다", async () => {
      const { status, body } = await call("a.csv.exe", "text/csv");

      expect(status).toBe(400);
      expect(body.code).toBe("INVALID_FILE_EXTENSION");
      expect(storageWasTouched()).toBe(false);
    });

    it("확장자가 없으면 400 이다", async () => {
      const { status, body } = await call("noextension", "text/csv");

      expect(status).toBe(400);
      expect(body.code).toBe("INVALID_FILE_EXTENSION");
      expect(storageWasTouched()).toBe(false);
    });

    it.each([
      ["data.xlsx", "text/html"],
      ["data.csv", "application/x-msdownload"],
    ])("허용 확장자 %s 라도 MIME(%s) 이 목록 밖이면 400 INVALID_FILE_TYPE 이다", async (fileName, mimeType) => {
      const { status, body } = await call(fileName, mimeType);

      expect(status).toBe(400);
      expect(body.code).toBe("INVALID_FILE_TYPE");
      expect(storageWasTouched()).toBe(false);
    });
  });

  describe("인증", () => {
    it("강사가 아니면 허용 형식이라도 403 이고 Storage 를 건드리지 않는다", async () => {
      currentUserMock.mockResolvedValue({ id: "student-1", role: "student" });

      const { status, body } = await call("data.xlsx", XLSX_MIME);

      expect(status).toBe(403);
      expect(body.code).toBe("FORBIDDEN");
      expect(storageWasTouched()).toBe(false);
    });
  });
});

describe("POST /api/upload 응답", () => {
  it("스프레드시트도 원본 이름과 MIME 을 메타데이터로 돌려주고 같은 MIME 으로 저장한다", async () => {
    const { status, body } = await callUpload("data.xlsx", XLSX_MIME);

    expect(status).toBe(201);
    expect(body.meta).toEqual({ originalName: "data.xlsx", size: 3, mime: XLSX_MIME });
    expect(storageBucketMock.upload).toHaveBeenCalledWith(
      expect.stringMatching(/\.xlsx$/),
      expect.any(Buffer),
      expect.objectContaining({ contentType: XLSX_MIME })
    );
  });
});

describe("POST /api/upload/signed-url 응답", () => {
  it("스프레드시트도 서명 URL 과 공개 URL 을 돌려준다", async () => {
    const { status, body } = await callSignedUrl("data.csv", "text/csv");

    expect(status).toBe(200);
    expect(body.signedUrl).toMatch(/^https:\/\/storage\.test\/signed\/instructor-instructor-1\//);
    expect(body.publicUrl).toMatch(/^https:\/\/storage\.test\/public\/exam-materials\/instructor-instructor-1\/.*\.csv$/);
    expect(body.meta).toEqual({ originalName: "data.csv", size: 3, mime: "text/csv" });
  });
});
