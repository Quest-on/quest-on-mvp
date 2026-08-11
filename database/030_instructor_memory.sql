-- 교수 개인화 메모리 (instructor memory)
-- 상태: 설계·구현
-- 이 마이그레이션은 세 테이블을 생성한다:
--   1. instructor_memories: 교수별 메모리 저장소 (현재 상태)
--   2. instructor_memory_events: 변경 이력
--   3. memory_application_snapshots: 채점 시 적용된 메모리 스냅샷
--
-- RLS 정책: 모든 접근이 service_role 단일 경로이다.
-- 실제 보호는 REVOKE + 코드 규율(모든 쿼리에 instructor_id 포함).
-- RLS는 향후 노출 실수에 대한 방어선이다.

BEGIN;

CREATE TABLE IF NOT EXISTS public.instructor_memories (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  instructor_id     text NOT NULL,

  scope             text NOT NULL CHECK (scope IN ('global','course','exam')),
  scope_id          uuid,                    -- global이면 NULL
  predicate         text NOT NULL,           -- predicate 어휘 참조
  value             jsonb NOT NULL,          -- 타입별 구조화 값
  value_text        text NOT NULL,           -- 주입용 자연문 (한국어 정본)
  canonical_text    text NOT NULL,           -- value_text의 NFC 정규화본

  -- 증거 (인젝션 방어의 핵심)
  evidence_source   text NOT NULL CHECK (evidence_source IN
                      ('bulk_grading_messages','grading_chats','derived_criteria')),
  evidence_ref_id   uuid,                    -- 원본 메시지 id
  evidence_span     int4range,               -- 원문 내 정확 위치
  evidence_quote    text NOT NULL,           -- 원문 그대로
  input_origin      text NOT NULL CHECK (input_origin IN
                      ('typed','quick_reply','pasted','imported','derived')),

  -- 추출 판정 3축
  commitment        text NOT NULL CHECK (commitment IN
                      ('asserted','tentative','hypothetical','reported','negated')),
  is_explicit       boolean NOT NULL,        -- 명시 진술 여부 (행동 추론이면 false)
  affects_score     boolean NOT NULL,        -- predicate 어휘가 결정

  status            text NOT NULL DEFAULT 'active' CHECK (status IN
                      ('active','archived','quarantined')),
  superseded_by     uuid REFERENCES public.instructor_memories(id),

  extractor_version text NOT NULL,
  source_event_at   timestamptz NOT NULL,    -- 원본 대화 시각 (순서 역전 방지)
  version           int  NOT NULL DEFAULT 1,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT instructor_memories_scope_id_shape
    CHECK ((scope = 'global') = (scope_id IS NULL))
);

-- 같은 (교수, 스코프, predicate)에 활성 레코드는 하나
CREATE UNIQUE INDEX IF NOT EXISTS idx_instructor_memories_active_unique
  ON public.instructor_memories (instructor_id, scope, COALESCE(scope_id, '00000000-0000-0000-0000-000000000000'::uuid), predicate)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_instructor_memories_lookup
  ON public.instructor_memories (instructor_id, status, scope);

ALTER TABLE public.instructor_memories ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.instructor_memories FROM anon, authenticated;
DROP POLICY IF EXISTS "service_role_all_instructor_memories" ON public.instructor_memories;
CREATE POLICY "service_role_all_instructor_memories" ON public.instructor_memories
  FOR ALL TO service_role USING (true) WITH CHECK (true);
GRANT ALL ON public.instructor_memories TO service_role;

-- 변경 이력 (같은 트랜잭션에서 기록)
CREATE TABLE IF NOT EXISTS public.instructor_memory_events (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  memory_id       uuid REFERENCES public.instructor_memories(id) ON DELETE SET NULL,
  instructor_id   text NOT NULL,
  operation       text NOT NULL CHECK (operation IN
                    ('add','update','supersede','archive','quarantine','restore')),
  reason          text NOT NULL,             -- Letta Code 식: 사유 필수
  before_value    jsonb,
  after_value     jsonb,
  actor_kind      text NOT NULL CHECK (actor_kind IN ('extractor','instructor','admin','migration')),
  actor_id        text,
  extractor_version text,
  idempotency_key text,
  occurred_at     timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_instructor_memory_events_idem
  ON public.instructor_memory_events (instructor_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

ALTER TABLE public.instructor_memory_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.instructor_memory_events FROM anon, authenticated;
DROP POLICY IF EXISTS "service_role_all_instructor_memory_events" ON public.instructor_memory_events;
CREATE POLICY "service_role_all_instructor_memory_events" ON public.instructor_memory_events
  FOR ALL TO service_role USING (true) WITH CHECK (true);
GRANT ALL ON public.instructor_memory_events TO service_role;

-- 채점 결정 시 적용된 메모리 스냅샷 (분쟁 대응의 실제 근거)
CREATE TABLE IF NOT EXISTS public.memory_application_snapshots (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  instructor_id     text NOT NULL,
  exam_id           uuid,
  session_id        uuid,
  q_idx             int,
  feature           text NOT NULL,           -- ai_events.feature와 동일 어휘
  prompt_hash       text,                    -- ai_events.metadata.prompt_hash와 조인
  applied_memory_ids uuid[] NOT NULL,
  applied_versions  int[]  NOT NULL,
  rendered_block    text NOT NULL,
  renderer_version  text NOT NULL,
  selector_version  text NOT NULL,
  estimated_tokens  int  NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_memory_snapshots_session
  ON public.memory_application_snapshots (session_id, q_idx);

CREATE INDEX IF NOT EXISTS idx_memory_snapshots_exam
  ON public.memory_application_snapshots (exam_id, created_at DESC);

ALTER TABLE public.memory_application_snapshots ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.memory_application_snapshots FROM anon, authenticated;
DROP POLICY IF EXISTS "service_role_all_memory_snapshots" ON public.memory_application_snapshots;
CREATE POLICY "service_role_all_memory_snapshots" ON public.memory_application_snapshots
  FOR ALL TO service_role USING (true) WITH CHECK (true);
GRANT ALL ON public.memory_application_snapshots TO service_role;

COMMIT;

-- 롤백 (소비 코드 배포 전에만)
-- DROP TABLE IF EXISTS public.memory_application_snapshots;
-- DROP TABLE IF EXISTS public.instructor_memory_events;
-- DROP TABLE IF EXISTS public.instructor_memories;
