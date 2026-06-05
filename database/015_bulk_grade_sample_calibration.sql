-- ============================================================
-- 015: Bulk Grade Progress Tracking
-- ============================================================
-- Adds attempt/progress tracking for full CASE bulk grading.
-- The calibration-prefixed columns are retained for compatibility with
-- previously deployed intermediate code, but the active flow starts full
-- grading directly from instructor natural-language criteria.

ALTER TABLE public.exam_grading_sessions
  ADD COLUMN IF NOT EXISTS calibration_sample_session_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS calibration_sample_grades      jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS calibration_status             text  NOT NULL DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS grading_scope                  text  NOT NULL DEFAULT 'full',
  ADD COLUMN IF NOT EXISTS calibration_attempt            integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS current_attempt_id             text,
  ADD COLUMN IF NOT EXISTS processed_session_ids          jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.exam_grading_sessions
  DROP CONSTRAINT IF EXISTS exam_grading_sessions_calibration_status_check;

ALTER TABLE public.exam_grading_sessions
  ADD CONSTRAINT exam_grading_sessions_calibration_status_check
  CHECK (calibration_status IN (
    'draft',
    'sample_selected',
    'interviewing',
    'sample_grading',
    'sample_review',
    'sample_failed',
    'approved'
  ));

ALTER TABLE public.exam_grading_sessions
  DROP CONSTRAINT IF EXISTS exam_grading_sessions_grading_scope_check;

ALTER TABLE public.exam_grading_sessions
  ADD CONSTRAINT exam_grading_sessions_grading_scope_check
  CHECK (grading_scope IN ('sample', 'full'));

DROP FUNCTION IF EXISTS public.merge_bulk_grading_result(uuid, text, jsonb, boolean);

CREATE OR REPLACE FUNCTION public.merge_bulk_grading_result(
  p_session_id    uuid,
  p_student_sid   text,
  p_grades_json   jsonb,
  p_success       boolean,
  p_scope         text DEFAULT 'full',
  p_attempt_id    text DEFAULT NULL
) RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
AS $$
DECLARE
  v_total      integer;
  v_completed  integer;
  v_failed     integer;
  v_done       boolean;
  v_status     text;
  v_cal_status text;
  v_attempt_id text;
  v_is_sample  boolean;
BEGIN
  SELECT grading_total,
         grading_completed,
         grading_failed_count,
         status,
         calibration_status,
         current_attempt_id
    INTO v_total, v_completed, v_failed, v_status, v_cal_status, v_attempt_id
    FROM public.exam_grading_sessions
   WHERE id = p_session_id
   FOR UPDATE;

  IF NOT FOUND THEN RETURN; END IF;
  IF p_scope NOT IN ('sample', 'full') THEN RETURN; END IF;
  IF v_attempt_id IS NOT NULL AND p_attempt_id IS DISTINCT FROM v_attempt_id THEN RETURN; END IF;

  IF (
    SELECT processed_session_ids ? p_student_sid
      FROM public.exam_grading_sessions
     WHERE id = p_session_id
  ) THEN
    RETURN;
  END IF;

  v_is_sample := p_scope = 'sample';
  v_done := false;

  IF p_success THEN
    v_done := (v_completed + 1) + v_failed >= v_total;

    IF v_is_sample THEN
      UPDATE public.exam_grading_sessions
         SET calibration_sample_grades = calibration_sample_grades || jsonb_build_object(p_student_sid, p_grades_json),
             processed_session_ids = processed_session_ids || jsonb_build_object(p_student_sid, true),
             grading_completed = grading_completed + 1,
             calibration_status = CASE WHEN v_done THEN 'sample_review' ELSE calibration_status END,
             updated_at = now()
       WHERE id = p_session_id;
    ELSE
      UPDATE public.exam_grading_sessions
         SET proposed_grades = proposed_grades || jsonb_build_object(p_student_sid, p_grades_json),
             processed_session_ids = processed_session_ids || jsonb_build_object(p_student_sid, true),
             grading_completed = grading_completed + 1,
             status = CASE WHEN v_done THEN 'grading_done' ELSE status END,
             updated_at = now()
       WHERE id = p_session_id;
    END IF;
  ELSE
    v_done := v_completed + (v_failed + 1) >= v_total;

    IF v_is_sample THEN
      UPDATE public.exam_grading_sessions
         SET grading_failed_count = grading_failed_count + 1,
             processed_session_ids = processed_session_ids || jsonb_build_object(p_student_sid, true),
             calibration_status = CASE
               WHEN v_done THEN
                 CASE WHEN v_completed = 0 THEN 'sample_failed' ELSE 'sample_review' END
               ELSE calibration_status
             END,
             updated_at = now()
       WHERE id = p_session_id;
    ELSE
      UPDATE public.exam_grading_sessions
         SET grading_failed_count = grading_failed_count + 1,
             processed_session_ids = processed_session_ids || jsonb_build_object(p_student_sid, true),
             status = CASE
               WHEN v_done THEN
                 CASE WHEN v_completed = 0 THEN 'grading_failed' ELSE 'grading_done' END
               ELSE status
             END,
             updated_at = now()
       WHERE id = p_session_id;
    END IF;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.merge_bulk_grading_result TO service_role;
