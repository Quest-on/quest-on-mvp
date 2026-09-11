-- 025: 개인정보 동의 원장 · subject mapping · 정책 릴리스 · 보존 인덱스
-- Epic #133 / 이슈 #134 / 명세 deep-interview-consent-system.md
--
-- 이 마이그레이션은 전부 "추가 전용"이고 forward-only foundation 이다.
-- 구버전 앱은 이 테이블들을 소비하지 않으므로 먼저 적용해도 안전하다.
-- 성공 후 drop/down 금지 — 되돌릴 때는 DDL 이 아니라 앱과 CONSENT_GATE_MODE 를 되돌린다.
--
-- ⚠️ 반드시 소비 PR(#135 원장/API) 보다 먼저 적용할 것.
--
-- ── 설계 결정 (명세 Option C) ────────────────────────────────────────
-- 원장은 user_id 를 저장하지 않는다. subject_ref = HMAC(user_id, 분리보관 키) 만 쓴다.
-- 식별은 접근통제된 consent_subject_map 이 담당하고, 탈퇴는 매핑 1행 DELETE 다.
-- 그 결과:
--   · append-only 불변식이 글자 그대로 유지된다 (UPDATE 예외 0개)
--   · DELETE 예외는 "보존 만료 purge" 하나뿐 — 탈퇴가 원장을 건드리지 않으므로
--   · 탈퇴 후 원 user_id 조회 0건이 설계상 자동 보장된다 (매핑이 없으면 역추적 불가)
-- 대안이던 "가명 INSERT 후 원본 DELETE" 는 예외를 2개로 늘리고 트랜잭션 중단 시
-- 동의 이력이 소실될 수 있어 채택하지 않았다.

BEGIN;

-- ─────────────────────────────────────────────────────────────
-- 1. consent_records — append-only 동의 원장
-- ─────────────────────────────────────────────────────────────
-- 승인된 업무 필드는 6개다. id 는 DB 가 만드는 surrogate PK 로,
-- 개인정보도 클라이언트 payload 도 아니며 감사 시 특정 행을 지목하기 위해 필요하다.
-- (AC-S4/U1/U2 의 필드 검사 대상은 업무 필드 6개이며 id 는 제외한다)
CREATE TABLE IF NOT EXISTS public.consent_records (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  -- 'v1:' + hex HMAC-SHA256(user_id). 원 user_id 는 여기 없다.
  subject_ref     text        NOT NULL,
  -- 현재 Quest-On 단일 처리자. 기관 계약이 실제로 생길 때 CHECK 를 넓힌다.
  -- 서버 상수로만 기록한다. 클라이언트 입력·role·사용자 입력 학교명으로 추정 금지.
  controller_type text        NOT NULL DEFAULT 'platform',
  -- age_over_14 | terms | marketing | ads_receive | ai_training
  consent_key     text        NOT NULL,
  granted         boolean     NOT NULL,
  policy_version  text        NOT NULL,
  recorded_at     timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT consent_records_controller_type_check
    CHECK (controller_type = 'platform')
);

-- Prisma db push 가 테이블을 먼저 만들면 CREATE TABLE IF NOT EXISTS 안의 CHECK 는
-- 적용되지 않는다. 어느 실행 순서에서도 DB 불변식이 같도록 명시적으로 재설치한다.
ALTER TABLE public.consent_records
  DROP CONSTRAINT IF EXISTS consent_records_controller_type_check;
ALTER TABLE public.consent_records
  ADD CONSTRAINT consent_records_controller_type_check
  CHECK (controller_type = 'platform');

-- 게이트는 (subject_ref, consent_key) 별 최신 결정을 읽는다.
CREATE INDEX IF NOT EXISTS idx_consent_records_subject_key_recorded
  ON public.consent_records (subject_ref, consent_key, recorded_at DESC);

-- 보존 만료 purge 가 subject 단위로 스캔한다.
CREATE INDEX IF NOT EXISTS idx_consent_records_subject_ref
  ON public.consent_records (subject_ref);

COMMENT ON TABLE public.consent_records IS
  'append-only 동의 원장. 철회는 granted=false 새 행. UPDATE 금지, DELETE 는 보존 만료 purge 만.';
COMMENT ON COLUMN public.consent_records.subject_ref IS
  'HMAC(user_id, CONSENT_SUBJECT_HMAC_KEY_V1). 원 user_id 는 저장하지 않는다.';

-- ─────────────────────────────────────────────────────────────
-- 2. consent_subject_map — 식별 매핑 (접근통제)
-- ─────────────────────────────────────────────────────────────
-- 탈퇴 = 이 테이블의 1행 DELETE. 그 순간 원장은 되돌릴 수 없이 가명화된다.
CREATE TABLE IF NOT EXISTS public.consent_subject_map (
  user_id     text        PRIMARY KEY,
  subject_ref text        NOT NULL UNIQUE,
  created_at  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.consent_subject_map IS
  '식별 매핑. 일반 app service 는 직접 읽지 못하고 register_consent_subject RPC 로만 쓴다. 탈퇴 시 1행 DELETE.';

-- ─────────────────────────────────────────────────────────────
-- 3. consent_policy_releases — 불변 정책 릴리스 레지스트리
-- ─────────────────────────────────────────────────────────────
-- 이게 없으면 문구를 바꿔도 재동의 트리거가 없어 기존 사용자가 무고지로 통과한다.
-- seed 는 넣지 않는다 — 최초 행은 027 (PR3 #136) 이 소유한다.
CREATE TABLE IF NOT EXISTS public.consent_policy_releases (
  release_id        text        PRIMARY KEY,
  content_hash      char(64)    NOT NULL,
  effective_at      timestamptz NOT NULL UNIQUE,
  requires_reconsent boolean    NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_consent_policy_releases_effective
  ON public.consent_policy_releases (effective_at DESC);

COMMENT ON TABLE public.consent_policy_releases IS
  '불변 정책 릴리스. current = effective_at<=now() 중 최신, acceptance floor = 그 범위의 최신 requires_reconsent=true.';

-- consent_records.policy_version 은 릴리스를 가리킨다.
ALTER TABLE public.consent_records
  DROP CONSTRAINT IF EXISTS consent_records_policy_version_fkey;
ALTER TABLE public.consent_records
  ADD CONSTRAINT consent_records_policy_version_fkey
  FOREIGN KEY (policy_version)
  REFERENCES public.consent_policy_releases (release_id);

-- ─────────────────────────────────────────────────────────────
-- 4. consent_retention_index — 탈퇴 후 3년 보존 기한
-- ─────────────────────────────────────────────────────────────
-- 3년은 달력 기준이다. 1095일 상수를 쓰면 윤년에서 어긋난다.
CREATE TABLE IF NOT EXISTS public.consent_retention_index (
  subject_ref   text        PRIMARY KEY,
  deleted_at    timestamptz NOT NULL,
  destroy_after timestamptz NOT NULL,

  CONSTRAINT consent_retention_index_destroy_after_check
    CHECK (destroy_after = deleted_at + interval '3 years')
);

ALTER TABLE public.consent_retention_index
  DROP CONSTRAINT IF EXISTS consent_retention_index_destroy_after_check;
ALTER TABLE public.consent_retention_index
  ADD CONSTRAINT consent_retention_index_destroy_after_check
  CHECK (destroy_after = deleted_at + interval '3 years');

CREATE INDEX IF NOT EXISTS idx_consent_retention_index_destroy_after
  ON public.consent_retention_index (destroy_after);

COMMENT ON TABLE public.consent_retention_index IS
  '탈퇴 시각과 파기 기한. 일반 service 는 읽지 못한다. destroy_after 는 DB 가 강제한다.';

-- ─────────────────────────────────────────────────────────────
-- 5. run log — 파기 배치 증적 (append-only, 식별자 미기록)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.consent_purge_runs (
  run_id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  job             text        NOT NULL,
  started_at      timestamptz NOT NULL DEFAULT now(),
  finished_at     timestamptz,
  cutoff          timestamptz,
  candidate_count integer     NOT NULL DEFAULT 0,
  deleted_count   integer     NOT NULL DEFAULT 0,
  status          text        NOT NULL,
  error           text,

  CONSTRAINT consent_purge_runs_job_check
    CHECK (job IN ('consent-retention', 'incomplete-accounts')),
  CONSTRAINT consent_purge_runs_status_check
    CHECK (status IN ('dry-run', 'success', 'partial', 'failed'))
);

ALTER TABLE public.consent_purge_runs
  DROP CONSTRAINT IF EXISTS consent_purge_runs_job_check;
ALTER TABLE public.consent_purge_runs
  DROP CONSTRAINT IF EXISTS consent_purge_runs_status_check;
ALTER TABLE public.consent_purge_runs
  ADD CONSTRAINT consent_purge_runs_job_check
  CHECK (job IN ('consent-retention', 'incomplete-accounts'));
ALTER TABLE public.consent_purge_runs
  ADD CONSTRAINT consent_purge_runs_status_check
  CHECK (status IN ('dry-run', 'success', 'partial', 'failed'));

COMMENT ON TABLE public.consent_purge_runs IS
  '파기 배치 실행 로그. 원·가명 user_id 를 기록하지 않는다. counts 만 남긴다.';

-- ─────────────────────────────────────────────────────────────
-- 6. 불변식 강제 — UPDATE / 일반 DELETE 거부 trigger
-- ─────────────────────────────────────────────────────────────
-- append-only 는 애플리케이션 규율이 아니라 DB 제약이어야 한다.
-- 앱에 버그가 생겨도 원장이 조작되지 않는다.
--
-- 보존 만료 purge 만 예외다. 세션 변수 app.consent_purge = 'on' 을
-- SECURITY DEFINER RPC 안에서만 세팅하므로 일반 경로는 우회할 수 없다.
CREATE OR REPLACE FUNCTION public.consent_records_reject_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'consent_records is append-only: UPDATE is not permitted';
  END IF;

  IF TG_OP = 'DELETE' THEN
    IF current_setting('app.consent_purge', true) IS DISTINCT FROM 'on' THEN
      RAISE EXCEPTION 'consent_records DELETE is permitted only from the retention purge routine';
    END IF;
    RETURN OLD;
  END IF;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_consent_records_no_update ON public.consent_records;
CREATE TRIGGER trg_consent_records_no_update
  BEFORE UPDATE ON public.consent_records
  FOR EACH ROW EXECUTE FUNCTION public.consent_records_reject_mutation();

DROP TRIGGER IF EXISTS trg_consent_records_no_delete ON public.consent_records;
CREATE TRIGGER trg_consent_records_no_delete
  BEFORE DELETE ON public.consent_records
  FOR EACH ROW EXECUTE FUNCTION public.consent_records_reject_mutation();

-- 정책 릴리스도 불변이다. 잘못 활성화한 릴리스는 수정이 아니라
-- 더 늦은 corrected release 를 append 해서 보상한다.
CREATE OR REPLACE FUNCTION public.consent_policy_releases_reject_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'consent_policy_releases is immutable: use a later corrected release instead';
END;
$$;

DROP TRIGGER IF EXISTS trg_consent_policy_releases_immutable ON public.consent_policy_releases;
CREATE TRIGGER trg_consent_policy_releases_immutable
  BEFORE UPDATE OR DELETE ON public.consent_policy_releases
  FOR EACH ROW EXECUTE FUNCTION public.consent_policy_releases_reject_mutation();

-- ─────────────────────────────────────────────────────────────
-- 7. register_consent_subject — insert-once 매핑 등록 RPC
-- ─────────────────────────────────────────────────────────────
-- 앱은 매핑 테이블에 직접 쓰지 못한다. 이 RPC 만 쓴다.
-- 이미 등록된 user_id 는 기존 subject_ref 를 돌려주되, 다른 값이 오면 fail-closed 다.
CREATE OR REPLACE FUNCTION public.register_consent_subject(
  p_user_id     text,
  p_subject_ref text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing text;
BEGIN
  SELECT subject_ref INTO v_existing
    FROM public.consent_subject_map
   WHERE user_id = p_user_id;

  IF v_existing IS NOT NULL THEN
    IF v_existing IS DISTINCT FROM p_subject_ref THEN
      -- HMAC 키가 바뀌었거나 잘못된 파생이다. 조용히 넘기면 원장이 갈라진다.
      RAISE EXCEPTION 'consent subject mapping mismatch for the given user';
    END IF;
    RETURN v_existing;
  END IF;

  INSERT INTO public.consent_subject_map (user_id, subject_ref)
  VALUES (p_user_id, p_subject_ref);

  RETURN p_subject_ref;
END;
$$;

-- ─────────────────────────────────────────────────────────────
-- 8. 탈퇴 — 매핑 1행 DELETE + 보존 기한 기록
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.retire_consent_subject(p_user_id text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_subject_ref text;
BEGIN
  SELECT subject_ref INTO v_subject_ref
    FROM public.consent_subject_map
   WHERE user_id = p_user_id;

  IF v_subject_ref IS NULL THEN
    RETURN false;
  END IF;

  INSERT INTO public.consent_retention_index (subject_ref, deleted_at, destroy_after)
  VALUES (v_subject_ref, now(), now() + interval '3 years')
  ON CONFLICT (subject_ref) DO NOTHING;

  DELETE FROM public.consent_subject_map WHERE user_id = p_user_id;

  -- 원장은 손대지 않는다. 이 시점부터 되돌릴 수 없이 가명 데이터다.
  RETURN true;
END;
$$;

-- ─────────────────────────────────────────────────────────────
-- 9. 보존 만료 파기 — 유일한 원장 DELETE 경로
-- ─────────────────────────────────────────────────────────────
-- 경계는 달력 기준 interval '3 years' 다. dry-run 은 삭제하지 않고 후보 수만 센다.
CREATE OR REPLACE FUNCTION public.purge_expired_consent_records(
  p_dry_run boolean DEFAULT true,
  p_limit   integer DEFAULT 500
)
RETURNS TABLE (candidate_count integer, deleted_count integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_candidates text[];
  v_deleted    integer := 0;
BEGIN
  SELECT array_agg(subject_ref)
    INTO v_candidates
    FROM (
      SELECT subject_ref
        FROM public.consent_retention_index
       WHERE destroy_after <= now()
       ORDER BY destroy_after
       LIMIT p_limit
    ) AS due;

  IF v_candidates IS NULL THEN
    RETURN QUERY SELECT 0, 0;
    RETURN;
  END IF;

  IF p_dry_run THEN
    RETURN QUERY SELECT array_length(v_candidates, 1), 0;
    RETURN;
  END IF;

  -- trigger 가 이 세션 변수를 보고서만 DELETE 를 허용한다.
  PERFORM set_config('app.consent_purge', 'on', true);

  DELETE FROM public.consent_records
   WHERE subject_ref = ANY (v_candidates);
  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  DELETE FROM public.consent_retention_index
   WHERE subject_ref = ANY (v_candidates);

  PERFORM set_config('app.consent_purge', 'off', true);

  RETURN QUERY SELECT array_length(v_candidates, 1), v_deleted;
END;
$$;

-- ─────────────────────────────────────────────────────────────
-- 10. RLS + 권한 — 기본은 전부 거부
-- ─────────────────────────────────────────────────────────────
-- 이 테이블들은 PostgREST 로 노출될 이유가 없다. 서버 라우트가
-- getSupabaseServer() 로만 접근한다. anon/authenticated 는 전면 차단한다.
ALTER TABLE public.consent_records          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.consent_subject_map      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.consent_policy_releases  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.consent_retention_index  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.consent_purge_runs       ENABLE ROW LEVEL SECURITY;

-- 정책을 하나도 만들지 않으므로 RLS 대상 role 은 아무 행도 보지 못한다.
-- service_role 은 RLS 를 우회하지만, 매핑 테이블만은 명시적으로 회수한다.
REVOKE ALL ON public.consent_records          FROM anon, authenticated;
REVOKE ALL ON public.consent_subject_map      FROM anon, authenticated;
REVOKE ALL ON public.consent_policy_releases  FROM anon, authenticated;
REVOKE ALL ON public.consent_retention_index  FROM anon, authenticated;
REVOKE ALL ON public.consent_purge_runs       FROM anon, authenticated;

-- 매핑은 앱이 직접 읽고 쓰면 안 된다. RPC 만 통과시킨다.
REVOKE ALL ON public.consent_subject_map      FROM service_role;
REVOKE ALL ON public.consent_retention_index  FROM service_role;

GRANT EXECUTE ON FUNCTION public.register_consent_subject(text, text)   TO service_role;
GRANT EXECUTE ON FUNCTION public.retire_consent_subject(text)           TO service_role;
GRANT EXECUTE ON FUNCTION public.purge_expired_consent_records(boolean, integer) TO service_role;

REVOKE ALL ON FUNCTION public.register_consent_subject(text, text)      FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.retire_consent_subject(text)              FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.purge_expired_consent_records(boolean, integer) FROM anon, authenticated;

-- ─────────────────────────────────────────────────────────────
-- 11. consent_auditor — 권리요청 대응 전용 read-only role
-- ─────────────────────────────────────────────────────────────
-- 일반 앱 identity 는 매핑을 못 읽는다. 열람·정정·삭제 요청 처리는
-- 이 role 로만 한다. CONSENT_AUDIT_DATABASE_URL 은 Vercel 에 넣지 않는다.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'consent_auditor') THEN
    CREATE ROLE consent_auditor NOLOGIN;
  END IF;
END
$$;

GRANT USAGE ON SCHEMA public TO consent_auditor;
GRANT SELECT ON public.consent_records         TO consent_auditor;
GRANT SELECT ON public.consent_subject_map     TO consent_auditor;
GRANT SELECT ON public.consent_policy_releases TO consent_auditor;
GRANT SELECT ON public.consent_retention_index TO consent_auditor;
GRANT SELECT ON public.consent_purge_runs      TO consent_auditor;

COMMIT;

-- ── 롤백 안내 ────────────────────────────────────────────────
-- 이 마이그레이션은 되돌리지 않는다. forward-only foundation 이다.
-- 적용 실패는 트랜잭션 rollback 으로 끝나고 앱 배포를 중단한다.
-- 적용 성공 후 문제가 생기면 CONSENT_GATE_MODE 를 낮추고 앱을 되돌린다.
-- DROP TABLE 은 감사 증적을 파괴하므로 사고대응 승인 없이는 금지한다.
