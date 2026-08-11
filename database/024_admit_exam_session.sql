-- 024: 세션 입장을 하나의 원자 연산으로 (이슈 #84)
--
-- 무료 등급의 두 한도(발행 3회 / 시험당 학생 5명)를 여기서 강제한다.
--
-- **왜 DB 함수인가.** 애플리케이션에서 "세어보고 → 괜찮으면 → 넣기"를 하면
-- TOCTOU 다. 수업 시작 순간 30명이 동시에 들어오면 전부 카운트를 읽고 전부
-- 통과해 한도를 넘긴다. `SELECT ... FOR UPDATE` 로도 못 막는다 — 아직 존재하지
-- 않는 행은 잠글 수 없기 때문이다(PostgreSQL 문서 13.4 명시적 잠금).
-- 그래서 교수자 단위 advisory lock 으로 직렬화한다.
--
-- **판정 순서가 중요하다.**
--   1) 기존 학생인가  → 맞으면 무조건 통과. 재입장을 막으면 시험 중인 학생이
--      네트워크가 끊긴 순간 영구히 튕긴다. 기기 지문이 아니라 (exam_id, user_id)
--      로 판정한다 — 다른 기기로 재접속한 학생을 신규로 보면 정원이 찼을 때
--      쫓겨난다.
--   2) 데모인가        → 두 한도와 first_published_at 기록을 **모두** 우회한다.
--   3) 학생 수 한도    → 이 시험의 서로 다른 학생 수.
--   4) 발행 한도       → 아직 발행되지 않은 시험에만 적용한다. 이미 학생을 받은
--      시험에 발행 한도를 다시 적용하면, 한도를 넘긴 교수자의 진행 중인 시험이
--      수업 도중에 멈춘다.
--
-- **실패 방향은 열림(fail-open)이다.** 한도 조회가 깨지면 학생을 들여보낸다.
-- 한도 계산 장애로 수업이 멈추는 것보다 잠시 한도가 풀리는 쪽이 낫다.
-- 대신 호출부가 `quota_fail_open` 으로 구조화 로그를 남긴다.

BEGIN;

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
BEGIN
  SELECT e.id, e.instructor_id, e.is_demo, e.first_published_at
    INTO v_exam
  FROM public.exams e
  WHERE e.id = p_exam_id;

  IF NOT FOUND THEN
    RETURN QUERY SELECT NULL::uuid, false, 'exam_not_found'::text, false;
    RETURN;
  END IF;

  -- 교수자 단위로 직렬화한다. 트랜잭션이 끝나면 자동 해제된다.
  -- 같은 교수자의 동시 입장만 줄 세우므로 다른 교수자의 시험은 영향이 없다.
  PERFORM pg_advisory_xact_lock(hashtext(v_exam.instructor_id::text));

  -- 잠근 뒤 exam 을 **다시 읽는다.**
  --
  -- 잠금 전에 읽은 first_published_at 을 그대로 쓰면, 마지막 무료 슬롯의 시험에
  -- 학생 여럿이 동시에 들어올 때 전부 "아직 미발행"으로 보고 발행 카운트를
  -- 검사한다. 첫 호출이 발행을 기록해도 뒤따르는 호출들은 낡은 NULL 을 들고
  -- 있어 한도 초과로 거부된다 — 정상 학생들이 첫 수업 입장에서 튕긴다.
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

  -- 2) 데모는 두 한도와 발행 기록을 모두 우회한다.
  IF NOT COALESCE(v_exam.is_demo, false) THEN
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
    IF v_max_publishes IS NOT NULL AND v_exam.first_published_at IS NULL THEN
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
    -- 잠금 밖에서 만들어진 경우는 없어야 하지만, 있으면 기존 세션을 쓴다.
    SELECT s.id INTO v_new_id
    FROM public.sessions s
    WHERE s.exam_id = p_exam_id AND s.student_id = p_student_id;

    RETURN QUERY SELECT v_new_id, true, NULL::text, false;
    RETURN;
  END IF;

  -- 발행 시각은 세션 삽입과 같은 트랜잭션에서 기록한다. 밖에서 하면
  -- 세션은 생겼는데 발행이 안 잡혀 한도가 영영 차지 않는다.
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
-- 교수자 승인 = plan 승격 (AC-13)
-- ─────────────────────────────────────────────────────────────
-- 두 테이블을 따로 UPDATE 하면 각각 독립 커밋이라, 첫 번째가 성공하고 두 번째가
-- 실패하면 instructor_profiles 는 approved 인데 profiles.plan 은 free 인 상태가
-- 영구히 남는다. 관리자는 승인했다고 믿고, 교수자는 계속 무료 한도에 묶인다.
CREATE OR REPLACE FUNCTION public.approve_instructor(p_instructor_id text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.instructor_profiles
  SET status = 'approved',
      approved_at = now(),
      updated_at = now()
  WHERE id = p_instructor_id;

  UPDATE public.profiles
  SET status = 'approved',
      plan = 'verified',
      updated_at = now()
  WHERE id::text = p_instructor_id;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.approve_instructor(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.approve_instructor(text) FROM anon;
REVOKE ALL ON FUNCTION public.approve_instructor(text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.approve_instructor(text) TO service_role;

COMMIT;

-- ─────────────────────────────────────────────────────────────
-- 비상 해제
-- ─────────────────────────────────────────────────────────────
-- UPDATE public.plan_limits SET max_publishes = NULL, max_students = NULL WHERE plan = 'free';
-- 둘 다 풀어야 한다. 한쪽만 풀면 다른 쪽이 계속 막는다.
-- lib/plan-limits.ts 의 60초 캐시 때문에 최대 1분 지연이 있다.
--
-- 롤백: DROP FUNCTION IF EXISTS public.admit_exam_session(uuid, text, text, text);
