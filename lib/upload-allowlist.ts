/**
 * 교수 자료 업로드 허용 목록. /api/upload 와 /api/upload/signed-url 이 같은 목록을 쓴다.
 *
 * 확장자와 MIME 을 모두 검사한다(마지막 확장자만 본다). 목록에 형식을 더할 때는 여기 한
 * 곳만 고친다. 텍스트 추출 대상(pdf, docx, pptx)은 hooks/useFileUpload.ts 가 따로 정하며,
 * 스프레드시트와 CSV 는 추출하지 않고 파일로만 저장된다.
 *
 * .xlsm 은 일부러 넣지 않았다. VBA 매크로를 담는 것을 전제로 하는 형식을 새로 열지 않는다는
 * 뜻이지 매크로 방어책은 아니다. 구형 .xls 와 이미 허용 중인 .doc, .ppt, .zip 도 매크로나 실행
 * 파일을 담을 수 있다. 그쪽 방어선은 이 목록이 아니라 받는 사람의 Office 보호된 보기와 인터넷
 * 출처 표시다.
 */

/**
 * 파일 하나의 최대 크기. 큰 파일은 서명 URL(/api/upload/signed-url)로 직접 올리므로 그 상한이 곧
 * 앱의 상한이다. /api/upload 는 Vercel 본문 제한(4.5MB) 때문에 4MB 까지만 받고 넘으면 클라이언트가
 * 서명 URL 로 바꾼다. 시드 스크립트도 이 값으로 검사한다.
 */
export const UPLOAD_MAX_FILE_SIZE = 50 * 1024 * 1024;

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
