-- 038: 비밀번호 보유 여부 RPC (이슈 #408)
--
-- 소셜로 가입한 뒤 `updateUser({ password })` 로 비밀번호를 설정하면 Supabase 는
-- `auth.users.encrypted_password` 만 채운다. `auth.identities` 에 `email` 행이
-- 생기지 않고, `raw_app_meta_data.providers` 도 그대로다 (staging 실측:
-- providers = ["kakao"], identities = kakao, encrypted_password 있음).
--
-- 그래서 클라이언트 SDK 가 주는 어떤 필드로도 "이 계정에 비밀번호가 있는가"를
-- 알 수 없다. 진실은 `encrypted_password` 하나뿐이고 그건 auth 스키마라
-- 서비스 롤로만 읽는다. 값 자체는 절대 내보내지 않는다 — 있는지 없는지만.
--
-- 쓰는 곳: GET/DELETE /api/account/identities (로그인 수단 목록·마지막 수단 판정),
-- ChangePasswordForm (설정 모드 vs 변경 모드).
--
-- 멱등: CREATE OR REPLACE.

BEGIN;

CREATE OR REPLACE FUNCTION public.user_has_password(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = auth, public
STABLE
AS $$
  SELECT COALESCE(
    (SELECT encrypted_password IS NOT NULL AND encrypted_password <> ''
     FROM auth.users WHERE id = p_user_id),
    false
  );
$$;

REVOKE ALL ON FUNCTION public.user_has_password(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.user_has_password(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.user_has_password(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.user_has_password(uuid) TO service_role;

COMMIT;

-- ─────────────────────────────────────────────────────────────
-- 롤백
-- ─────────────────────────────────────────────────────────────
-- DROP FUNCTION IF EXISTS public.user_has_password(uuid);
