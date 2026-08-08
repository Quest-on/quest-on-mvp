-- 018: 온보딩 액티베이션 스키마 (Epic #79 / 이슈 #80 / ADR-006)
--
-- 이 마이그레이션은 전부 "추가 전용"이다. 기존 컬럼 변경·삭제 없음.
-- 모든 추가 컬럼에 DEFAULT가 있으므로 기존 행 백필이 필요 없다.
-- 소비 코드(#82/#84/#86)가 머지되기 전이라면 하단 롤백으로 무손실 되돌리기가 가능하다.
--
-- ⚠️ 반드시 소비 이슈보다 먼저 적용·배포할 것. 반대 순서면 컬럼 없는 DB에 쿼리가 날아간다.

BEGIN;

-- ─────────────────────────────────────────────────────────────
-- 1. exams: 데모 구분과 최초 발행 시점
-- ─────────────────────────────────────────────────────────────
-- is_demo: 데모는 "별도 테이블"이 아니라 "플래그를 단 진짜 exam"이다.
--   sessions/messages/submissions/grades/ai_events/session_quiz_attempts 가 전부
--   exam_id를 FK로 물고 있어서, 분리하면 응시 파이프라인 전체가 이중화된다.
--   대신 목록·통계·발행 카운트에서만 배제한다(#86이 조회 지점 전수 감사).
--   데모→실서비스 승격은 is_demo=false 한 줄 UPDATE로 끝난다.
ALTER TABLE exams
  ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;

-- first_published_at: 이 저장소에는 "발행"이라는 개념이 없다.
--   session-handlers.ts의 EXAM_UNAVAILABLE_STATUSES = {closed, archived} 만이
--   학생 입장을 막으므로 draft 상태에서도 학생이 들어온다. 즉 생성 = 사실상 공개다.
--   따라서 발행을 status 전이로 정의할 수 없고, "첫 학생 세션이 생긴 시점"으로 잡는다.
--   #84가 세션 upsert 경로에서 COALESCE로 최초 1회만 기록한다.
--   그 결과 재발행·재입장은 카운트를 늘리지 않는다(AC-11이 스키마 수준에서 성립).
ALTER TABLE exams
  ADD COLUMN IF NOT EXISTS first_published_at timestamptz;

-- 발행 카운트 쿼리 형태:
--   WHERE instructor_id = ? AND first_published_at IS NOT NULL AND is_demo = false
CREATE INDEX IF NOT EXISTS idx_exams_instructor_demo
  ON exams (instructor_id, is_demo);
CREATE INDEX IF NOT EXISTS idx_exams_instructor_first_published
  ON exams (instructor_id, first_published_at);

-- ─────────────────────────────────────────────────────────────
-- 2. profiles.plan + plan_limits: 한도를 코드가 아니라 데이터로
-- ─────────────────────────────────────────────────────────────
-- 한도를 코드 상수로 두면 사고 시 복구 수단이 revert 뿐이고,
-- CI 전 계열(api-e2e + browser-e2e)을 거쳐 배포되는 동안 모든 free 교수자가 차단된다.
-- 테이블로 두면 UPDATE 한 줄로 재배포 없이 즉시 해제할 수 있다.
-- 나중에 과금이 붙으면 INSERT 한 줄로 등급이 늘어난다(로직 변경 0).
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS plan text NOT NULL DEFAULT 'free';

CREATE TABLE IF NOT EXISTS public.plan_limits (
  plan               text    PRIMARY KEY,
  -- NULL = 무제한
  max_publishes      int,
  max_students       int,
  ai_demo_generation boolean NOT NULL DEFAULT false,
  updated_at         timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.plan_limits (plan, max_publishes, max_students, ai_demo_generation)
VALUES
  ('free',     3,    5,    false),
  ('verified', NULL, NULL, true)
ON CONFLICT (plan) DO NOTHING;

-- RLS: plan_limits 는 전역 엔타이틀먼트 테이블이다. Supabase 의 노출된 public 스키마에
--   RLS 없이 두면 표준 grant(anon/authenticated 에 대한 GRANT ALL — 이 저장소의
--   .github/actions/test-setup/action.yml:141-143 이 실제로 그렇게 준다) 아래에서
--   PostgREST 클라이언트가 전역 한도 행을 직접 UPDATE 할 수 있다.
--   예: free.max_publishes 를 NULL 로 바꿔 모든 계정의 발행 한도를 무력화.
--   앱은 이 테이블을 service_role(getSupabaseServer)로만 읽으므로 클라이언트 접근이
--   필요 없다. RLS 를 켜고 grant 자체를 회수한다.
ALTER TABLE public.plan_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.plan_limits FROM anon, authenticated;

DROP POLICY IF EXISTS "service_role_all" ON public.plan_limits;
CREATE POLICY "service_role_all" ON public.plan_limits
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ─────────────────────────────────────────────────────────────
-- 3. onboarding_events: 액티베이션 퍼널 마일스톤
-- ─────────────────────────────────────────────────────────────
-- ai_events에 합치지 않는 이유: 그 테이블은 provider/model/pricing_version이
--   NOT NULL이고 비용·토큰 중심이다. 온보딩 이벤트에는 그런 게 없어서 더미값을
--   채워야 하고, 그 순간 SUM(estimated_cost_usd_micros)와 GROUP BY model이 오염된다.
--
-- UNIQUE (user_id, event): 이 테이블은 원시 로그가 아니라 "최초 도달" 마일스톤이다.
--   그래서 퍼널이 COUNT(DISTINCT user_id)로 끝나고, 재시도·중복 호출 방어가
--   스키마 수준에서 보장된다(쓰기는 ON CONFLICT DO NOTHING).
CREATE TABLE IF NOT EXISTS public.onboarding_events (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     text        NOT NULL,
  role        text        NOT NULL,
  event       text        NOT NULL,
  exam_id     uuid        REFERENCES public.exams(id) ON DELETE SET NULL,
  metadata    jsonb       NOT NULL DEFAULT '{}',
  occurred_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, event)
);

CREATE INDEX IF NOT EXISTS idx_onboarding_events_event_occurred
  ON public.onboarding_events (event, occurred_at DESC);

-- RLS: ai_events 패턴을 그대로 따른다 — service_role만 접근, 백엔드 API 전용.
--   RLS 만으로는 부족하다. Supabase 표준 grant 가 anon/authenticated 에 테이블 권한을
--   주므로, 정책이 없더라도 grant 가 남아 있으면 향후 정책 추가 시 의도치 않게 열린다.
--   클라이언트 접근이 필요 없는 테이블이므로 grant 자체를 회수한다.
ALTER TABLE public.onboarding_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.onboarding_events FROM anon, authenticated;

DROP POLICY IF EXISTS "service_role_all" ON public.onboarding_events;
CREATE POLICY "service_role_all" ON public.onboarding_events
  FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMIT;

-- ─────────────────────────────────────────────────────────────
-- 롤백 (소비 코드 머지 전이면 무손실)
-- ─────────────────────────────────────────────────────────────
-- DROP TABLE IF EXISTS public.onboarding_events;
-- DROP TABLE IF EXISTS public.plan_limits;
-- ALTER TABLE profiles DROP COLUMN IF EXISTS plan;
-- DROP INDEX IF EXISTS idx_exams_instructor_first_published;
-- DROP INDEX IF EXISTS idx_exams_instructor_demo;
-- ALTER TABLE exams DROP COLUMN IF EXISTS first_published_at;
-- ALTER TABLE exams DROP COLUMN IF EXISTS is_demo;
