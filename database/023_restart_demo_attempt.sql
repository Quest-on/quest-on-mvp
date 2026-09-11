-- 023: 데모 재응시를 하나의 원자 연산으로 (에픽 #79)
--
-- 교수자가 자기 데모를 다시 풀 수 있어야 한다. `UNIQUE(exam_id, student_id)` 때문에
-- 새 세션 행을 만들 수 없으므로 기존 행을 초기화해 재사용한다.
--
-- 이걸 애플리케이션 코드에서 DELETE 여러 번 + UPDATE 로 하면 **각각이 독립 커밋**
-- 이라, 중간에 실패하면 답안은 지워졌는데 세션은 제출 상태로 남는 식의 깨진
-- 상태가 영구화된다. 사용자는 다시 풀 수도, 예전 결과를 볼 수도 없게 된다.
-- 함수 하나로 묶으면 전부 성공하거나 전부 롤백된다.
--
-- 권한도 여기서 다시 확인한다. 클라이언트가 보내는 `restartDemoAttempt` 는 의도일
-- 뿐이고, **데모이고 그 데모의 소유자일 때만** 실제로 지운다. 애플리케이션이
-- 확인했더라도 이 함수가 유일한 삭제 경로이므로 여기서 한 번 더 막는다.
--
-- 유지되는 것: `onboarding_events`(완주 마일스톤은 특정 시도가 아니라 사람 단위
-- 사실이다), `ai_events`(실제로 발생한 비용이라 감사 대상이다).

BEGIN;

CREATE OR REPLACE FUNCTION public.restart_demo_attempt(
  p_exam_id uuid,
  p_user_id text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session_id uuid;
BEGIN
  -- 데모이고 소유자인지 확인한다. 아니면 아무것도 하지 않는다.
  IF NOT EXISTS (
    SELECT 1 FROM public.exams e
    WHERE e.id = p_exam_id
      AND e.is_demo = true
      AND e.instructor_id::text = p_user_id
  ) THEN
    RETURN NULL;
  END IF;

  -- 세션 행을 잠근다. 잠그지 않으면 두 탭이 동시에 재응시를 눌렀을 때 한쪽이
  -- 지우는 중에 다른 쪽이 초기화해 반쯤 지워진 시도가 남는다.
  SELECT s.id INTO v_session_id
  FROM public.sessions s
  WHERE s.exam_id = p_exam_id
    AND s.student_id = p_user_id
    AND s.submitted_at IS NOT NULL
  ORDER BY s.created_at DESC
  LIMIT 1
  FOR UPDATE;

  -- 제출된 시도가 없으면 초기화할 게 없다. 아직 푸는 중인 세션을 지우면
  -- 새로고침만으로 작성 중인 답안이 날아간다.
  IF v_session_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- 시도에 종속된 데이터를 전부 지운다. 하나라도 남기면 새 시도 화면에
  -- 이전 시도의 흔적이 섞여 나온다.
  DELETE FROM public.grades WHERE session_id = v_session_id;
  DELETE FROM public.grading_chats WHERE session_id = v_session_id;
  DELETE FROM public.messages WHERE session_id = v_session_id;
  DELETE FROM public.submissions WHERE session_id = v_session_id;
  DELETE FROM public.session_quiz_attempts WHERE session_id = v_session_id;
  DELETE FROM public.paste_logs WHERE session_id = v_session_id;

  UPDATE public.sessions
  SET submitted_at = null,
      auto_submitted = false,
      is_active = true,
      status = 'in_progress',
      started_at = now(),
      attempt_timer_started_at = now(),
      last_heartbeat_at = now(),
      used_clarifications = 0,
      compressed_session_data = null,
      compression_metadata = null,
      ai_summary = null,
      grading_progress = null,
      final_answer = null,
      final_answer_updated_at = null,
      -- 고지 수락도 되돌린다. 새 시도는 다시 preflight 를 거쳐야 응시 흐름이
      -- 일관된다. 사람 단위 고지 확인(onboarding_events)은 별개로 유지된다.
      preflight_accepted_at = null
  WHERE id = v_session_id;

  RETURN v_session_id;
END;
$$;

REVOKE ALL ON FUNCTION public.restart_demo_attempt(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.restart_demo_attempt(uuid, text) FROM anon;
REVOKE ALL ON FUNCTION public.restart_demo_attempt(uuid, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.restart_demo_attempt(uuid, text) TO service_role;

COMMIT;

-- ─────────────────────────────────────────────────────────────
-- 롤백
-- ─────────────────────────────────────────────────────────────
-- DROP FUNCTION IF EXISTS public.restart_demo_attempt(uuid, text);
