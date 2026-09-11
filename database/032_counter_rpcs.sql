-- 032: 운영 DB 에만 존재하고 마이그레이션으로 잡히지 않던 카운터 RPC 2개를 회수한다 (이슈 #199)
--
-- `increment_used_clarifications` 는 ff277e8d 가 호출부(`app/api/chat/route.ts`)만
-- 추가했고 함수 정의는 운영 DB 에 수작업으로만 존재했다. `increment_student_count` 는
-- `sql/002_add_unique_constraints.sql` 에 정의됐지만 CI 적용 목록(test-setup action)이
-- sql/002 를 적용하지 않는다. 그 결과 CI·로컬 테스트 DB 는 두 함수가 없어
-- `/api/chat`·`/api/feedback` 경로가 "Could not find the function ... in the schema
-- cache" 로 실패한다.
--
-- 둘 다 단일 UPDATE 라 Postgres 행 잠금으로 원자적이다 — 동시 요청의 lost update 를
-- 막는 것이 존재 이유다(`app/api/chat/route.ts` 의 "Atomic increment via RPC" 주석).
-- CREATE OR REPLACE 라 운영의 기존 정의와 같은 시맨틱으로 덮어쓰며, 재적용필 안전하다.

BEGIN;

CREATE OR REPLACE FUNCTION public.increment_used_clarifications(
  p_session_id uuid,
  p_amount     int
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.sessions
  SET used_clarifications = COALESCE(used_clarifications, 0) + p_amount
  WHERE id = p_session_id;
END;
$$;

REVOKE ALL ON FUNCTION public.increment_used_clarifications(uuid, int) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.increment_used_clarifications(uuid, int) FROM anon;
REVOKE ALL ON FUNCTION public.increment_used_clarifications(uuid, int) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.increment_used_clarifications(uuid, int) TO service_role;

CREATE OR REPLACE FUNCTION public.increment_student_count(p_exam_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.exams
  SET student_count = COALESCE(student_count, 0) + 1
  WHERE id = p_exam_id;
END;
$$;

REVOKE ALL ON FUNCTION public.increment_student_count(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.increment_student_count(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.increment_student_count(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.increment_student_count(uuid) TO service_role;

COMMIT;
