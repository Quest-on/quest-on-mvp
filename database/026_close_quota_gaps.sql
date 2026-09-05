-- 026: 한도 강제의 남은 구멍 (이슈 #84 후속)
--
-- 실DB 레드팀과 통합 리뷰가 찾은 세 가지를 막는다. 024·025 는 이미 스테이징에
-- 적용됐으므로 그 파일을 고치지 않고 forward migration 으로 보정한다.

BEGIN;

-- ─────────────────────────────────────────────────────────────
-- 1) 데모 우회를 **소유자에게만** 허용한다
-- ─────────────────────────────────────────────────────────────
-- 지금은 `is_demo` 이면 누가 들어오든 두 한도를 통째로 우회한다. 실제로 외부
-- 학생 6명이 전부 통과하는 것을 확인했다.
--
-- "데모는 한도를 소모하지 않는다"의 뜻은 **교수자가 자기 데모를 겪는 것**이
-- 무료 한도를 깎지 않는다는 것이지, 데모 코드가 무제한 입장권이라는 게 아니다.
-- 지금 상태면 교수자가 데모 코드를 배포해 학생 5명 한도를 통째로 무력화할 수
-- 있다 — 무료 한도의 존재 이유가 사라진다.
--
-- 소유자가 아닌 입장은 일반 시험과 똑같이 한도를 적용한다.
CREATE OR REPLACE FUNCTION public.admit_exam_session(
  p_exam_id      uuid,
  p_student_id   text,
  p_status       text,
  p_fingerprint  text
)
RETURNS TABLE (
  session_id      uuid,
  admitted        boolean,
  denial_reason   text,
  created         boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_exam           record;
  v_existing_id    uuid;
  v_plan           text;
  v_max_students   int;
  v_max_publishes  int;
  v_student_count  int;
  v_publish_count  int;
  v_new_id         uuid;
  v_owner_preview  boolean;
BEGIN
  SELECT e.id, e.instructor_id, e.is_demo, e.first_published_at
    INTO v_exam
  FROM public.exams e
  WHERE e.id = p_exam_id;

  IF NOT FOUND THEN
    RETURN QUERY SELECT NULL::uuid, false, 'exam_not_found'::text, false;
    RETURN;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(v_exam.instructor_id::text));

  -- 잠근 뒤 다시 읽는다. 잠금 전 값을 쓰면 마지막 무료 슬롯에 동시 입장한
  -- 학생들이 전부 "아직 미발행"으로 보고 발행 카운트에 걸려 거부된다.
  SELECT e.id, e.instructor_id, e.is_demo, e.first_published_at
    INTO v_exam
  FROM public.exams e
  WHERE e.id = p_exam_id;

  -- 1) 기존 학생은 무조건 통과. 기기 지문이 아니라 (exam_id, student_id) 다.
  SELECT s.id INTO v_existing_id
  FROM public.sessions s
  WHERE s.exam_id = p_exam_id
    AND s.student_id = p_student_id
  LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    RETURN QUERY SELECT v_existing_id, true, NULL::text, false;
    RETURN;
  END IF;

  -- 2) 데모 **소유자**만 두 한도와 발행 기록을 우회한다.
  v_owner_preview :=
    COALESCE(v_exam.is_demo, false)
    AND v_exam.instructor_id::text = p_student_id;

  IF NOT v_owner_preview THEN
    SELECT p.plan INTO v_plan FROM public.profiles p WHERE p.id::text = v_exam.instructor_id::text;

    SELECT l.max_students, l.max_publishes
      INTO v_max_students, v_max_publishes
    FROM public.plan_limits l
    WHERE l.plan = COALESCE(v_plan, 'free');

    -- 3) 학생 수 한도.
    IF v_max_students IS NOT NULL THEN
      SELECT count(DISTINCT s.student_id) INTO v_student_count
      FROM public.sessions s
      WHERE s.exam_id = p_exam_id;

      IF v_student_count >= v_max_students THEN
        RETURN QUERY SELECT NULL::uuid, false, 'student_limit'::text, false;
        RETURN;
      END IF;
    END IF;

    -- 4) 발행 한도 — 아직 발행되지 않은 시험에만.
    --    데모는 발행 카운트에 들어가지 않으므로 여기서도 제외한다.
    IF v_max_publishes IS NOT NULL
       AND v_exam.first_published_at IS NULL
       AND NOT COALESCE(v_exam.is_demo, false) THEN
      SELECT count(*) INTO v_publish_count
      FROM public.exams e
      WHERE e.instructor_id = v_exam.instructor_id
        AND e.is_demo = false
        AND e.first_published_at IS NOT NULL;

      IF v_publish_count >= v_max_publishes THEN
        RETURN QUERY SELECT NULL::uuid, false, 'publish_limit'::text, false;
        RETURN;
      END IF;
    END IF;
  END IF;

  INSERT INTO public.sessions (
    exam_id, student_id, status, device_fingerprint, is_active,
    used_clarifications, created_at, last_heartbeat_at,
    started_at, attempt_timer_started_at
  )
  VALUES (
    p_exam_id, p_student_id, p_status, p_fingerprint, true,
    0, now(), now(),
    CASE WHEN p_status = 'in_progress' THEN now() END,
    CASE WHEN p_status = 'in_progress' THEN now() END
  )
  ON CONFLICT (exam_id, student_id) DO NOTHING
  RETURNING id INTO v_new_id;

  IF v_new_id IS NULL THEN
    SELECT s.id INTO v_new_id
    FROM public.sessions s
    WHERE s.exam_id = p_exam_id AND s.student_id = p_student_id;

    RETURN QUERY SELECT v_new_id, true, NULL::text, false;
    RETURN;
  END IF;

  -- 데모는 발행으로 세지 않는다.
  IF NOT COALESCE(v_exam.is_demo, false) THEN
    UPDATE public.exams
    SET first_published_at = COALESCE(first_published_at, now())
    WHERE id = p_exam_id;
  END IF;

  RETURN QUERY SELECT v_new_id, true, NULL::text, true;
END;
$$;

REVOKE ALL ON FUNCTION public.admit_exam_session(uuid, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admit_exam_session(uuid, text, text, text) FROM anon;
REVOKE ALL ON FUNCTION public.admit_exam_session(uuid, text, text, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.admit_exam_session(uuid, text, text, text) TO service_role;

-- ─────────────────────────────────────────────────────────────
-- 2) 승인이 존재하지 않는 교수자에게 성공을 반환하던 것
-- ─────────────────────────────────────────────────────────────
-- 지금은 없는 id 로 불러도 true 다. 호출 라우트는 error 만 보므로 관리자에게
-- "승인됨"이라고 답한다 — 아무 일도 안 일어났는데.
CREATE OR REPLACE FUNCTION public.approve_instructor(p_instructor_id text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated int;
BEGIN
  UPDATE public.profiles
  SET status = 'approved',
      plan = 'verified',
      updated_at = now()
  WHERE id::text = p_instructor_id;

  GET DIAGNOSTICS v_updated = ROW_COUNT;

  -- 대상 프로필이 없으면 아무것도 하지 않고 실패를 알린다.
  IF v_updated = 0 THEN
    RETURN false;
  END IF;

  UPDATE public.instructor_profiles
  SET status = 'approved',
      approved_at = now(),
      updated_at = now()
  WHERE id = p_instructor_id;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.approve_instructor(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.approve_instructor(text) FROM anon;
REVOKE ALL ON FUNCTION public.approve_instructor(text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.approve_instructor(text) TO service_role;

-- ─────────────────────────────────────────────────────────────
-- 3) 025 동의 원장 함수의 PUBLIC 노출 회수
-- ─────────────────────────────────────────────────────────────
-- 025 는 anon·authenticated 에서만 회수하고 PUBLIC 을 남겼다. PostgreSQL 은
-- 함수에 PUBLIC EXECUTE 를 기본으로 주므로, 회수하지 않으면 모든 롤이 실행할 수
-- 있다. SECURITY DEFINER 라 더 위험하다.
DO $$
DECLARE
  fn record;
BEGIN
  FOR fn IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef
      AND p.proname IN (
        'record_consent', 'withdraw_consent', 'retire_consent_subject',
        'purge_consent_subject', 'map_consent_subject'
      )
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', fn.sig);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon, authenticated', fn.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', fn.sig);
  END LOOP;
END;
$$;

-- restart_demo_attempt 도 PUBLIC 회수를 명시한다(023 은 PUBLIC 을 회수했지만
-- 재적용 순서에 따라 blanket GRANT 뒤가 될 수 있다).
REVOKE ALL ON FUNCTION public.restart_demo_attempt(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.restart_demo_attempt(uuid, text) FROM anon;
REVOKE ALL ON FUNCTION public.restart_demo_attempt(uuid, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.restart_demo_attempt(uuid, text) TO service_role;

COMMIT;

-- ─────────────────────────────────────────────────────────────
-- 롤백
-- ─────────────────────────────────────────────────────────────
-- 함수 본문은 024 의 정의로 되돌릴 수 있다. 권한 회수는 되돌리지 않는다 —
-- 되돌리면 SECURITY DEFINER 함수가 다시 모든 롤에 열린다.
