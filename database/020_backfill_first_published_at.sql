-- 020: 기존 시험의 최초 발행 시점 백필 (이슈 #151 / ADR-006)
--
-- first_published_at를 기록하기 전 생성된 세션은 이력에 이미 남아 있다.
-- 이 백필이 없으면 기존 교수자가 "한 번도 발행 안 함"으로 보여 무료 발행 3회를 새로 얻는다.
-- NULL 행만 갱신하므로 재실행해도 이미 기록된 최초 발행 시점은 바뀌지 않는다.

BEGIN;

-- 학생의 첫 세션 생성 시점이 이 서비스에서의 실제 최초 공개 시점이다.
UPDATE public.exams AS exams
SET first_published_at = first_sessions.first_session_created_at
FROM (
  SELECT exam_id, MIN(created_at) AS first_session_created_at
  FROM public.sessions
  GROUP BY exam_id
) AS first_sessions
WHERE exams.id = first_sessions.exam_id
  AND exams.first_published_at IS NULL;

COMMIT;

-- ─────────────────────────────────────────────────────────────
-- 롤백 (020 적용 후 새로 기록된 값과 구분할 수 없으므로, 운영 데이터에서 실행하지 말 것)
-- ─────────────────────────────────────────────────────────────
-- UPDATE public.exams AS exams
-- SET first_published_at = NULL
-- FROM (
--   SELECT exam_id, MIN(created_at) AS first_session_created_at
--   FROM public.sessions
--   GROUP BY exam_id
-- ) AS first_sessions
-- WHERE exams.id = first_sessions.exam_id
--   AND exams.first_published_at = first_sessions.first_session_created_at;
