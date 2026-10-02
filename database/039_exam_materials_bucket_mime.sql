-- 039: exam-materials 버킷 허용 MIME 에 스프레드시트와 CSV 를 더한다 (이슈 #507)
--
-- 교수 자료 업로드(/api/upload, /api/upload/signed-url)는 앱 허용 목록
-- (lib/upload-allowlist.ts)을 통과해도 Supabase Storage 가 버킷의
-- allowed_mime_types 로 한 번 더 거른다. 스테이징과 운영 모두 이 버킷의 목록이
-- pdf, doc, docx, ppt, pptx, jpeg, png, gif, webp 아홉 개뿐이라(2026-10-03 Storage
-- API 읽기 전용 조회) 코드만 배포하면 xlsx 업로드는 Storage 단계에서 거부된다.
--
-- 이 파일은 아래 네 개만 합집합으로 **추가**한다. 기존 값은 지우지도 바꾸지도 않는다.
--   application/vnd.ms-excel                                                  (.xls, 일부 브라우저의 .csv)
--   application/vnd.openxmlformats-officedocument.spreadsheetml.sheet         (.xlsx)
--   text/csv                                                                  (.csv)
--   application/csv                                                           (.csv)
-- txt, hwp, hwpx, zip, octet-stream 은 앱 목록에는 있으나 이 이슈 범위 밖이라 더하지 않는다.
--
-- ⚠️ 반드시 코드보다 먼저 적용할 것 (database/018 헤더와 같은 선적용 규칙).
--   스테이징 Supabase 에 먼저 적용 → staging 배포에서 xlsx 업로드 QA → staging → main
--   머지 직전에 운영 Supabase 에 적용. 이 SQL 이 없는 환경에 코드가 먼저 나가면 앱은
--   .xlsx 를 허용하는데 Storage 가 거부해 교수자는 "파일 저장 중 오류가 발생했습니다."
--   (500 STORAGE_ERROR)를 본다. 반대로 이 SQL 만 먼저 적용하는 것은 해롭지 않다
--   (앱이 아직 같은 형식을 막고 있다).
--
-- 안전장치:
--   - allowed_mime_types 가 NULL 이거나 빈 배열이면 건드리지 않는다. Storage 에서 그 값은
--     "제한 없음"이므로 네 개를 넣는 순간 오히려 그 네 개만 허용하는 버킷이 된다.
--   - 네 개가 이미 다 들어 있으면 행을 갱신하지 않는다.
--   - 멱등: 여러 번 실행해도 결과가 같다. 기존 배열 순서를 유지하고 빠진 것만 뒤에 붙인다.
--   - id = 'exam-materials' 한 행만 대상이다. 다른 버킷, file_size_limit, public 은 그대로.
--   - 이 DB 에 버킷이 없으면(예: 새 CI DB) 0 행 갱신으로 끝난다.
--
-- 확인 쿼리 (적용 전후):
--   select allowed_mime_types from storage.buckets where id = 'exam-materials';
--   적용 후 allowed_mime_types 에 위 네 개가 들어 있어야 한다. 기존 아홉 개는 그대로 남아 있어야
--   한다. Storage API 로 읽어도 같은 값이 보인다: GET /storage/v1/bucket/exam-materials

BEGIN;

UPDATE storage.buckets
SET allowed_mime_types = allowed_mime_types || ARRAY(
  SELECT t.m
  FROM unnest(ARRAY[
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/csv',
    'application/csv'
  ]) AS t(m)
  WHERE t.m <> ALL (allowed_mime_types)
  ORDER BY t.m
)
WHERE id = 'exam-materials'
  AND allowed_mime_types IS NOT NULL
  AND cardinality(allowed_mime_types) > 0
  AND NOT (allowed_mime_types @> ARRAY[
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/csv',
    'application/csv'
  ]::text[]);

COMMIT;

-- ─────────────────────────────────────────────────────────────
-- 롤백 (롤백 프로시저 검토 후 수동 실행)
-- ─────────────────────────────────────────────────────────────
-- 추가한 네 개만 뺀다. 코드를 먼저 되돌리거나 코드와 같이 되돌린다. 이미 올라간 xlsx, csv 파일은
-- 이 UPDATE 가 지우지 않는다.
--
-- UPDATE storage.buckets
-- SET allowed_mime_types = ARRAY(
--   SELECT t.m
--   FROM unnest(allowed_mime_types) AS t(m)
--   WHERE t.m <> ALL (ARRAY[
--     'application/vnd.ms-excel',
--     'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
--     'text/csv',
--     'application/csv'
--   ])
-- )
-- WHERE id = 'exam-materials'
--   AND allowed_mime_types IS NOT NULL;
