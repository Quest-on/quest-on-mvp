/**
 * 교수 자료 업로드 허용 목록. /api/upload 와 /api/upload/signed-url 이 같은 목록을 쓴다.
 *
 * 확장자와 MIME 을 모두 검사한다(마지막 확장자만 본다). 목록에 형식을 더할 때는 여기 한
 * 곳만 고친다. 텍스트 추출 대상(pdf, docx, pptx)은 hooks/useFileUpload.ts 가 따로 정하며,
 * 스프레드시트와 CSV 는 추출하지 않고 파일로만 저장된다.
 */

export const UPLOAD_ALLOWED_EXTENSIONS: ReadonlySet<string> = new Set([
  ".pdf", ".ppt", ".pptx", ".doc", ".docx",
  ".xls", ".xlsx", ".csv",
  ".txt", ".hwp", ".hwpx", ".zip",
  ".jpg", ".jpeg", ".png", ".gif", ".webp",
]);

export const UPLOAD_ALLOWED_MIME_TYPES: ReadonlySet<string> = new Set([
  "application/pdf",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  // 스프레드시트와 CSV. Windows 의 일부 브라우저는 .csv 를 application/vnd.ms-excel 로 보낸다.
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/csv",
  "application/csv",
  "text/plain",
  "application/x-hwp",
  "application/haansofthwp",
  "application/vnd.hancom.hwp",
  "application/vnd.hancom.hwpx",
  "application/zip",
  "application/x-zip-compressed",
  "application/octet-stream", // 일부 브라우저는 .hwp/.hwpx 를 octet-stream 으로 보낸다
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
]);
