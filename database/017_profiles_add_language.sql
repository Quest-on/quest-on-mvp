-- 017: profiles 유저 선호 언어 컬럼 (후속 PR용 — 아직 실행하지 않음)
--
-- v1 i18n은 NEXT_LOCALE 쿠키로만 로케일을 영속화한다(기기별).
-- 로그인 유저의 기기 간 언어 동기화를 붙일 때 이 마이그레이션을 실행하고,
-- lib/supabase-auth.ts currentUser() select에 language를 추가한 뒤
-- lib/i18n/locale.ts resolveLocale()에 유저 프로필 fallback을 넣는다.
--
-- 안전: nullable 아님 + 기본값 'ko'라 기존 행에 영향 없음(추가 전용).

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS language text NOT NULL DEFAULT 'ko';
