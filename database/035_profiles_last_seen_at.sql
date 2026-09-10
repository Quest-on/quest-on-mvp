-- 035: profiles.last_seen_at — 실제 활동 시각 추적 (이슈 #354)
--
-- auth.users.last_sign_in_at 은 자격증명 교환(최초 로그인)에만 갱신되고 세션
-- 리프레시에는 갱신되지 않아 "마지막으로 쓴 시각" 지표로 쓸 수 없다. 실제로는
-- 활동 중인 사용자가 수개월 전 로그인으로 보여 운영 판단을 오도한다.
--
-- currentUser() 가 인스턴스당 사용자별 15분 스로틀로 이 컬럼을 갱신하고,
-- admin 사용자 목록 API/화면이 "최근 활동"으로 노출한다.

BEGIN;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS last_seen_at timestamptz;

COMMIT;

-- --------------------------------------------
-- 롤백 (롤백 프로시저 검토 후 수동 실행)
-- --------------------------------------------
-- ALTER TABLE public.profiles DROP COLUMN IF EXISTS last_seen_at;
