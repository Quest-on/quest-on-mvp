-- 020: 최초 개인정보 동의 정책 릴리스 seed
-- 이 행이 없으면 onboarding POST 와 동의 게이트가 동시에 실패한다.
-- 릴리스는 불변이다. 오류는 이 행을 수정하지 말고 더 늦은 corrected release 로 보상한다.

INSERT INTO public.consent_policy_releases (
  release_id,
  content_hash,
  effective_at,
  requires_reconsent
) VALUES (
  'consent-20260810-r1',
  'eb68bff3c7655c10b4626e1077a6e60b2321bf621b68faf00ff936e44b0f79db',
  '2026-08-10T00:00:00Z',
  true
)
ON CONFLICT (release_id) DO NOTHING;
