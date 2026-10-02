/**
 * 교수 자료 업로드 허용 목록 모듈 가드 (#507)
 *
 * 교수자가 데이터 분석 시험용 xlsx, xls, csv 를 올리려 하면 파일 선택창은 허용하지만
 * 서버가 확장자와 MIME 을 거부(INVALID_FILE_EXTENSION)했다. 허용 목록을 한 모듈로 모았고
 * 여기서는 그 목록의 내용을 잠근다. 두 라우트(/api/upload, /api/upload/signed-url)가 이 목록을
 * 실제로 쓰는지는 핸들러를 직접 호출하는 __tests__/upload-routes.test.ts 가 잠근다.
 */
import { describe, expect, it } from "vitest";
import {
  UPLOAD_ALLOWED_EXTENSIONS,
  UPLOAD_ALLOWED_MIME_TYPES,
} from "@/lib/upload-allowlist";

const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

describe("upload allowlist", () => {
  it("스프레드시트와 CSV 확장자를 허용한다", () => {
    for (const ext of [".xlsx", ".xls", ".csv"]) {
      expect(UPLOAD_ALLOWED_EXTENSIONS.has(ext)).toBe(true);
    }
  });

  it("스프레드시트와 CSV MIME 을 허용한다 (브라우저마다 CSV MIME 이 다르다)", () => {
    for (const mime of [XLSX_MIME, "application/vnd.ms-excel", "text/csv", "application/csv"]) {
      expect(UPLOAD_ALLOWED_MIME_TYPES.has(mime)).toBe(true);
    }
  });

  it("기존에 허용하던 형식은 그대로 허용한다", () => {
    for (const ext of [
      ".pdf", ".ppt", ".pptx", ".doc", ".docx", ".txt", ".hwp", ".hwpx", ".zip",
      ".jpg", ".jpeg", ".png", ".gif", ".webp",
    ]) {
      expect(UPLOAD_ALLOWED_EXTENSIONS.has(ext)).toBe(true);
    }
    for (const mime of ["application/pdf", "text/plain", "application/zip", "image/png"]) {
      expect(UPLOAD_ALLOWED_MIME_TYPES.has(mime)).toBe(true);
    }
  });

  it("실행 파일과 스크립트, HTML 은 거부한다", () => {
    for (const ext of [".exe", ".js", ".html", ".svg", ".sh", ".bat", ".php", ".xlsm"]) {
      expect(UPLOAD_ALLOWED_EXTENSIONS.has(ext)).toBe(false);
    }
    for (const mime of ["text/html", "application/x-msdownload", "application/javascript", "image/svg+xml"]) {
      expect(UPLOAD_ALLOWED_MIME_TYPES.has(mime)).toBe(false);
    }
  });

  it("확장자는 점으로 시작하는 소문자다", () => {
    for (const ext of UPLOAD_ALLOWED_EXTENSIONS) {
      expect(ext).toMatch(/^\.[a-z0-9]+$/);
    }
  });
});
