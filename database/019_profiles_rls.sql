-- 019: profiles RLS (이슈 #148)
--
-- profiles 는 Prisma 모델이 아니라 Supabase Auth 프로필용 raw 테이블이다.
-- 클라이언트는 자기 프로필을 SELECT만 하므로 쓰기 권한을 줄 이유가 없다.
--
-- ⚠️ 이 정책이 없으면 anon 키를 가진 로그인 사용자가 PostgREST로 role/status/plan을
--    직접 PATCH해 라우트의 입력 검증을 우회할 수 있다.

BEGIN;

-- public 스키마의 표준 GRANT만으로도 직접 쓰기가 가능해진다. SELECT만 다시 부여하고,
-- RLS는 현재 로그인한 사용자의 행만 보이게 해서 다른 프로필 열람도 막는다.
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.profiles FROM anon, authenticated;
GRANT SELECT ON public.profiles TO anon, authenticated;

DROP POLICY IF EXISTS "profiles_select_own" ON public.profiles;
CREATE POLICY "profiles_select_own" ON public.profiles
  FOR SELECT TO authenticated
  USING ((select auth.uid())::text = id);

DROP POLICY IF EXISTS "service_role_all" ON public.profiles;
CREATE POLICY "service_role_all" ON public.profiles
  FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMIT;

-- ─────────────────────────────────────────────────────────────
-- 롤백 (클라이언트 프로필 조회 정책을 되돌릴 때만 사용)
-- ─────────────────────────────────────────────────────────────
-- DROP POLICY IF EXISTS "service_role_all" ON public.profiles;
-- DROP POLICY IF EXISTS "profiles_select_own" ON public.profiles;
-- ALTER TABLE public.profiles DISABLE ROW LEVEL SECURITY;
-- REVOKE ALL ON public.profiles FROM anon, authenticated;
-- GRANT ALL ON public.profiles TO anon, authenticated;
