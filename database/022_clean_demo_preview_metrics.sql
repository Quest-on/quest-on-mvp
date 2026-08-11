-- 022: 교수자 데모 응시가 남긴 학생 퍼널 오염 정리 (이슈 #167)
--
-- #128 이 preflight 수락 시 `student_disclosure_ack` 를 기록하게 만들었고, #166 이
-- 교수자가 자기 데모를 학생 시점으로 응시하는 경로를 열었다. 각각은 멀쩡한데
-- 합쳐지니 **교수자 id 가 role='student' 로 학생 퍼널에 박혔다.**
--
-- 데모 템플릿은 전부 서술형이라 고지 노출 판정이 항상 참이 되므로, 온보딩을
-- 마치고 데모를 겪은 교수자 **전원**이 오염됐다. 에픽 #79 의 DoD 가
-- `COUNT(DISTINCT user_id)` 로 학생 지표를 산출하기 때문에 그대로 두면 지표가
-- 교수자 수만큼 부풀어 있다.
--
-- 코드는 같은 PR 에서 고쳤다. 이 마이그레이션은 **이미 쌓인 행**을 지운다.
--
-- 멱등: 대상 행이 없으면 아무것도 하지 않는다. 두 번 돌려도 결과가 같다.

BEGIN;

-- 1) 데모 소유자가 자기 데모에서 남긴 고지 확인 마일스톤 삭제.
--    exam_id 가 붙어 있으므로 "그 데모의 교수자인가"로 정확히 좁힐 수 있다.
--    일반 학생의 행은 절대 건드리지 않는다.
DELETE FROM public.onboarding_events oe
USING public.exams e
WHERE oe.event = 'student_disclosure_ack'
  AND oe.exam_id = e.id
  AND e.is_demo = true
  AND e.instructor_id = oe.user_id;

--    한계: `onboarding_events.exam_id` 는 018 에서 `ON DELETE SET NULL` 이다.
--    데모 exam 이 이미 삭제돼 exam_id 가 NULL 이 된 오염 행은 이 조인으로 못
--    잡는다. 그런 행은 "어느 시험에서 남았는지"를 복원할 수 없어 일반 학생
--    행과 구분이 불가능하므로 지우지 않는 쪽을 택한다 — 잘못 지우면 진짜
--    학생 계측을 잃는다.
--
-- 2) 데모의 student_count 를 **재계산**한다.
--    0 으로 덮으면 안 된다. 서버가 비소유자의 데모 입장을 거부하지 않으므로
--    ("데모 코드는 교수자에게만 노출"은 접근 제어가 아니라 가정이다) 실제
--    학생이 제출한 데모가 있다면 그 카운트를 되돌릴 수 없이 잃는다.
--    소유자 본인의 제출만 빼고 다시 센다.
UPDATE public.exams e
SET student_count = sub.n
FROM (
  SELECT s.exam_id, count(DISTINCT s.student_id) AS n
  FROM public.sessions s
  JOIN public.exams x ON x.id = s.exam_id
  WHERE x.is_demo = true
    AND s.submitted_at IS NOT NULL
    AND s.student_id <> x.instructor_id
  GROUP BY s.exam_id
) sub
WHERE e.id = sub.exam_id
  AND e.student_count <> sub.n;

-- 제출한 비소유자가 아예 없는 데모는 위 조인에 안 잡히므로 따로 0 으로 맞춘다.
UPDATE public.exams e
SET student_count = 0
WHERE e.is_demo = true
  AND e.student_count <> 0
  AND NOT EXISTS (
    SELECT 1 FROM public.sessions s
    WHERE s.exam_id = e.id
      AND s.submitted_at IS NOT NULL
      AND s.student_id <> e.instructor_id
  );

COMMIT;

-- ─────────────────────────────────────────────────────────────
-- 롤백
-- ─────────────────────────────────────────────────────────────
-- 되돌릴 수 없다. 삭제된 행은 계측 마일스톤이라 원본 시각을 복원할 방법이 없고,
-- 애초에 잘못 기록된 값이라 복원할 이유도 없다.
