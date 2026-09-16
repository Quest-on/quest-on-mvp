-- 037: 아무도 읽지 않는 plan_limits.ai_demo_generation 을 걷어낸다 (이슈 #392).
--
-- 이 컬럼은 018 에서 만들어졌지만 집행하는 코드가 한 번도 없었다.
-- getPlanLimits() 호출처는 app/api/instructor/quota/route.ts 하나뿐이고,
-- 그 라우트는 aiDemoGeneration 을 응답에 담지 않는다. 즉 "free 는 AI 데모
-- 생성 불가" 는 이 행에만 존재하는 정책이었다.
--
-- 왜 집행이 아니라 제거인가:
--   온보딩 데모는 OpenAI 호출 0회가 인수 조건이다(app/api/onboarding/demo/route.ts).
--   생성물은 lib/demo-templates.ts 의 고정 텍스트라 등급과 무관하다.
--   AI 재생성(#83)은 plan 이 아니라 데모 완주로 게이트한다(lib/demo-completion.ts).
--   어느 쪽도 이 플래그를 쓰지 않는다. 코드가 SSOT 이므로 DB 가 혼자 주장하는
--   정책을 남겨두지 않는다.
--
-- 적용 순서 주의:
--   lib/plan-limits.ts 가 이 컬럼을 select 목록에 갖고 있다. 코드 배포보다
--   이 migration 이 먼저 돌면 그 select 가 실패하고 getPlanLimits 는
--   FALLBACK_LIMITS(무제한)로 답한다 — 한도 표시가 조용히 풀린다.
--   실제 강제는 admit_exam_session 이 max_students/max_publishes 만 읽으므로
--   그대로 살아 있지만, 교수자 화면은 경고 없이 열린 것처럼 보인다.
--   따라서 **코드 배포 후에 적용한다.**
--
-- max_students / max_publishes 는 건드리지 않는다. 한도 판정의 유일한 지점인
-- admit_exam_session 이 그 둘만 읽는다.

BEGIN;

ALTER TABLE public.plan_limits
  DROP COLUMN IF EXISTS ai_demo_generation;

COMMIT;

-- ─────────────────────────────────────────────────────────────
-- 롤백
-- ─────────────────────────────────────────────────────────────
-- ALTER TABLE public.plan_limits
--   ADD COLUMN IF NOT EXISTS ai_demo_generation boolean NOT NULL DEFAULT false;
-- UPDATE public.plan_limits SET ai_demo_generation = true  WHERE plan = 'verified';
-- UPDATE public.plan_limits SET ai_demo_generation = false WHERE plan = 'free';
