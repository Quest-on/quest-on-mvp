-- 021: 승인 대기 상태 해제 (에픽 #79 / P0)
--
-- 승인 대기 게이트를 제거했다. 예전에는 교수자가 `status='pending'` 으로 생성되고
-- 미들웨어가 `/instructor-pending` 으로 돌려보냈는데, 그러면 "관리자 승인을 기다리지
-- 않고 가입 직후 데모를 겪는다"는 목표가 런타임에서 정확히 반대로 동작한다.
--
-- 코드만 고치면 **이미 pending 으로 굳은 기존 교수자는 영원히 갇힌다.** 그들을 푸는
-- 게 이 마이그레이션의 전부다. 승인은 이제 차단이 아니라 `plan` 승격이므로
-- `status` 를 approved 로 옮겨도 무료 한도(plan='free')는 그대로 적용된다.
--
-- 멱등: 이미 approved 인 행은 건드리지 않는다. 두 번 돌려도 결과가 같다.

BEGIN;

-- profiles 는 교수자 행만 푼다. 승인 대기는 교수자에게만 있던 개념이고,
-- role 이 비었거나 student 인 pending 행까지 건드리면 되돌릴 수 없는 범위 확장이
-- 된다(이 마이그레이션은 원래 값을 기록하지 않는다).
UPDATE public.profiles
SET status = 'approved',
    updated_at = now()
WHERE status = 'pending'
  AND role = 'instructor';

UPDATE public.instructor_profiles
SET status = 'approved',
    updated_at = now()
WHERE status = 'pending';

-- 기본값도 바꾼다. 기존 행만 풀고 DEFAULT 를 'pending' 으로 두면, 앱을 거치지
-- 않고 만들어지는 행(시드·수동 INSERT·다른 경로)이 다시 승인 대기로 갇힌다.
ALTER TABLE public.instructor_profiles ALTER COLUMN status SET DEFAULT 'approved';

COMMIT;

-- ─────────────────────────────────────────────────────────────
-- 롤백 (승인 대기 게이트를 되살릴 때만 사용)
-- ─────────────────────────────────────────────────────────────
-- 되돌릴 수 없다. 어떤 계정이 원래 pending 이었는지 이 마이그레이션은 기록하지
-- 않는다. 게이트를 되살리려면 승인 이력을 별도로 복원해야 한다.
