-- 028: AI 설정 버전/라벨/감사 (이슈 #118)
--
-- 이 마이그레이션은 전부 "추가 전용"이다. 기존 테이블 변경·삭제 없음.
-- 앱보다 먼저 적용해야 한다. 부트스트랩 버전이 sparse `{}` 라서 019 만 적용된
-- 상태는 동작이 변하지 않는다(전부 코드 기본값으로 해석된다).
--
-- 멱등성: `prisma db push` 가 테이블을 먼저 만들어 둔 경우에도 그대로 동작해야 한다.
-- 그래서 CREATE TABLE IF NOT EXISTS 뒤에 카탈로그를 확인하는 ALTER 들을 붙였고,
-- 같은 파일을 두 번 적용해도 결과가 같다.
--
-- ⚠️ 보안 경계가 이 파일의 핵심이다.
--   PostgreSQL 은 함수 EXECUTE 를 기본으로 PUBLIC 에 준다. SECURITY DEFINER 함수에
--   그대로 두면 PostgREST 를 통해 anon 이 호출할 수 있고 RLS 도 우회된다.
--   따라서 (1) search_path 를 비우고 (2) 모든 객체를 스키마 한정하고
--   (3) PUBLIC/anon/authenticated 의 EXECUTE 를 회수한 뒤 service_role 에만 부여한다.
--   테이블도 service_role 에게 SELECT 만 준다 — 불변 이력을 앱이 직접 고칠 수 없어야 한다.

BEGIN;

-- ─────────────────────────────────────────────────────────────
-- 1. 불변 버전 테이블
-- ─────────────────────────────────────────────────────────────
-- profiles 는 sparse override 만 담는다. 코드/env 기본값을 여기 물질화하면
-- 첫 저장 순간 우선순위 의미가 깨지고 되돌릴 수 없다.
CREATE TABLE IF NOT EXISTS public.ai_config_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profiles jsonb NOT NULL,
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ai_config_versions_profiles_is_object'
      AND conrelid = 'public.ai_config_versions'::regclass
  ) THEN
    ALTER TABLE public.ai_config_versions
      ADD CONSTRAINT ai_config_versions_profiles_is_object
      CHECK (jsonb_typeof(profiles) = 'object');
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_ai_config_versions_created_at
  ON public.ai_config_versions (created_at DESC);

-- ─────────────────────────────────────────────────────────────
-- 2. 라벨 (이동 가능한 포인터)
-- ─────────────────────────────────────────────────────────────
-- 롤백은 "라벨을 이전 버전으로 옮기기" 한 번이다. 버전 행은 절대 지우지 않는다.
CREATE TABLE IF NOT EXISTS public.ai_config_labels (
  label text PRIMARY KEY,
  version_id uuid NOT NULL REFERENCES public.ai_config_versions(id) ON DELETE RESTRICT,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_config_labels_version
  ON public.ai_config_labels (version_id);

-- ─────────────────────────────────────────────────────────────
-- 3. 감사 로그 (append-only)
-- ─────────────────────────────────────────────────────────────
-- 채점 제품에서 "누가 언제 무엇을 바꿨나"는 성적 이의제기 방어선이다.
-- actor 는 요청 페이로드가 아니라 서버가 파생한 값만 들어온다(라우트 책임).
CREATE TABLE IF NOT EXISTS public.ai_config_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor text NOT NULL,
  action text NOT NULL,
  previous_version_id uuid REFERENCES public.ai_config_versions(id) ON DELETE RESTRICT,
  new_version_id uuid NOT NULL REFERENCES public.ai_config_versions(id) ON DELETE RESTRICT,
  reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ai_config_audit_reason_not_blank'
      AND conrelid = 'public.ai_config_audit'::regclass
  ) THEN
    ALTER TABLE public.ai_config_audit
      ADD CONSTRAINT ai_config_audit_reason_not_blank
      CHECK (length(btrim(reason)) > 0);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_ai_config_audit_created_at
  ON public.ai_config_audit (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_config_audit_new_version
  ON public.ai_config_audit (new_version_id);

-- ─────────────────────────────────────────────────────────────
-- 4. RLS + 테이블 권한
-- ─────────────────────────────────────────────────────────────
-- RLS 를 켜되 정책을 만들지 않는다 = anon/authenticated 는 행을 볼 수 없다.
-- service_role 은 RLS 를 우회하지만, 아래 GRANT 로 SELECT 만 갖는다.
ALTER TABLE public.ai_config_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_config_labels   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_config_audit    ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.ai_config_versions FROM PUBLIC;
REVOKE ALL ON public.ai_config_labels   FROM PUBLIC;
REVOKE ALL ON public.ai_config_audit    FROM PUBLIC;

DO $$
DECLARE
  r text;
  t text;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      FOREACH t IN ARRAY ARRAY[
        'public.ai_config_versions',
        'public.ai_config_labels',
        'public.ai_config_audit'
      ] LOOP
        EXECUTE format('REVOKE ALL ON %s FROM %I', t, r);
      END LOOP;
    END IF;
  END LOOP;

  -- 앱 런타임(service_role)은 읽기만 한다. 쓰기는 아래 RPC 로만 가능하다.
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    FOREACH t IN ARRAY ARRAY[
      'public.ai_config_versions',
      'public.ai_config_labels',
      'public.ai_config_audit'
    ] LOOP
      EXECUTE format('REVOKE ALL ON %s FROM service_role', t);
      EXECUTE format('GRANT SELECT ON %s TO service_role', t);
    END LOOP;
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────
-- 5. 발행 RPC — 유일한 쓰기 경로
-- ─────────────────────────────────────────────────────────────
-- 라벨 락 → 불변 버전 삽입 → 라벨 이동 → 감사 추가를 한 트랜잭션으로 한다.
-- search_path 를 비웠으므로 모든 객체·함수를 스키마 한정으로 쓴다.
CREATE OR REPLACE FUNCTION public.publish_ai_config_version(
  p_profiles jsonb,
  p_actor text,
  p_reason text
)
RETURNS TABLE (previous_version_id uuid, new_version_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_previous uuid;
  v_new uuid;
BEGIN
  IF p_profiles IS NULL OR pg_catalog.jsonb_typeof(p_profiles) <> 'object' THEN
    RAISE EXCEPTION 'profiles must be a JSON object';
  END IF;
  IF p_actor IS NULL OR pg_catalog.length(pg_catalog.btrim(p_actor)) = 0 THEN
    RAISE EXCEPTION 'actor is required';
  END IF;
  IF p_reason IS NULL OR pg_catalog.length(pg_catalog.btrim(p_reason)) = 0 THEN
    RAISE EXCEPTION 'reason is required';
  END IF;

  -- 동시 발행을 직렬화한다. 라벨 행이 없으면 부트스트랩 이전이라는 뜻이다.
  SELECT l.version_id INTO v_previous
  FROM public.ai_config_labels AS l
  WHERE l.label = 'production'
  FOR UPDATE;

  INSERT INTO public.ai_config_versions (profiles, created_by)
  VALUES (p_profiles, p_actor)
  RETURNING id INTO v_new;

  INSERT INTO public.ai_config_labels (label, version_id, updated_at)
  VALUES ('production', v_new, pg_catalog.now())
  ON CONFLICT (label) DO UPDATE
    SET version_id = EXCLUDED.version_id,
        updated_at = EXCLUDED.updated_at;

  INSERT INTO public.ai_config_audit (actor, action, previous_version_id, new_version_id, reason)
  VALUES (p_actor, 'publish', v_previous, v_new, p_reason);

  previous_version_id := v_previous;
  new_version_id := v_new;
  RETURN NEXT;
END;
$$;

-- 기본 PUBLIC EXECUTE 를 회수하는 것이 이 블록의 존재 이유다.
REVOKE ALL ON FUNCTION public.publish_ai_config_version(jsonb, text, text) FROM PUBLIC;

DO $$
DECLARE
  r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format(
        'REVOKE ALL ON FUNCTION public.publish_ai_config_version(jsonb, text, text) FROM %I', r
      );
    END IF;
  END LOOP;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.publish_ai_config_version(jsonb, text, text) TO service_role';
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────
-- 6. 부트스트랩 — 빈 sparse 버전 1개
-- ─────────────────────────────────────────────────────────────
-- 값이 아니라 "아무 것도 덮어쓰지 않음"을 저장한다. 그래서 019 만 적용된 배포는
-- 코드/env 기본값 그대로 동작한다.
DO $$
DECLARE
  v_bootstrap uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.ai_config_labels WHERE label = 'production') THEN
    INSERT INTO public.ai_config_versions (profiles, created_by)
    VALUES ('{}'::jsonb, 'system:migration')
    RETURNING id INTO v_bootstrap;

    INSERT INTO public.ai_config_labels (label, version_id)
    VALUES ('production', v_bootstrap);

    INSERT INTO public.ai_config_audit (actor, action, previous_version_id, new_version_id, reason)
    VALUES ('system:migration', 'bootstrap', NULL, v_bootstrap, 'initial empty sparse config');
  END IF;
END $$;

COMMIT;

-- ─────────────────────────────────────────────────────────────
-- 롤백 메모
-- ─────────────────────────────────────────────────────────────
-- 파괴적 down 마이그레이션을 만들지 않는다. 앱만 롤백하고 스키마는 남긴다.
-- 설정을 되돌려야 하면 DB 운영자가 위 RPC 로 이전 버전에 라벨을 옮기고
-- 감사 행을 남긴다. 직접 UPDATE 로 되돌리지 않는다.
