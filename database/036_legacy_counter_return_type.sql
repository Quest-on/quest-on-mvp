-- 036: upgrade the legacy int-returning clarification counter (issue #375).
-- Some existing installations predate 032 and have the same argument signature
-- with RETURNS int DEFAULT 1. CREATE OR REPLACE cannot change that return type.
-- On those installations apply 036 BEFORE retrying 032, then continue 033/034.
-- Fresh installations can apply 032 then 036 in normal numeric order.
-- Callers pass both arguments and consume only the RPC error, not its result.
-- Only the incompatible function is replaced; no table or row is removed.
-- RESTRICT fails if dependent objects exist. One transaction preserves the old
-- function and grants on any failure and avoids a visible missing-function gap.
-- Remote execution still requires explicit target/migration approval.

BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc
    WHERE oid = to_regprocedure('public.increment_used_clarifications(uuid,integer)')
      AND prorettype <> 'void'::regtype
  ) THEN
    DROP FUNCTION public.increment_used_clarifications(uuid, integer) RESTRICT;
  END IF;
END;
$$;

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
