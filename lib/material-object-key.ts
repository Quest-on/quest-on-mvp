import { randomUUID } from "crypto";

/**
 * 교수 자료의 Storage 객체 키 규칙 (`exam-materials` 버킷). 단일 출처.
 *
 * `/api/upload`, `/api/upload/signed-url`, 모의시험 시드 스크립트(`scripts/seed-mock-exam.ts`)가
 * 이 함수로 경로를 만든다. 셋이 따로 만들면 시드로 올린 파일만 다른 폴더나 이름 규칙을 갖게 된다.
 *
 * 경로: `instructor-<교수자 id>/<YYYY-MM-DD>_<uuid>.<확장자>`
 *   - 원래 파일 이름은 키에 넣지 않는다(한글, 공백, 슬래시가 키를 깨뜨린다). 업로드 응답의
 *     `meta.originalName` 으로만 돌려준다. 그래서 URL 에서 원래 이름을 되살릴 수 없다.
 *   - 확장자는 원래 이름의 마지막 점 뒤 1~8자 영숫자를 소문자로 바꾼 것이다. 없으면 `extFallback`.
 *   - 날짜는 UTC 기준 ISO 날짜다.
 */
export function makeMaterialObjectKey(
  originalName: string,
  options: { extFallback?: string; now?: Date; uuid?: string } = {}
): string {
  const ts = (options.now ?? new Date()).toISOString().slice(0, 10); // YYYY-MM-DD
  const id = options.uuid ?? randomUUID();
  // 확장자 추출 (마지막 점 기준, 너무 긴/이상한 건 버림)
  const m = originalName.match(/\.([a-zA-Z0-9]{1,8})$/);
  const ext = m ? `.${m[1].toLowerCase()}` : (options.extFallback ?? ".bin");
  // 슬래시를 언더스코어로 변경 (일부 storage는 중첩 폴더 미지원)
  return `${ts}_${id}${ext}`;
}

/** 버킷 안 전체 경로. 교수자 폴더 아래에 둔다. */
export function materialStoragePath(instructorId: string, objectKey: string): string {
  return `instructor-${instructorId}/${objectKey}`;
}
