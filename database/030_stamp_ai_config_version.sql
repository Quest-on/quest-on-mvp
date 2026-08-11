-- 030: ai_events 에 설정 버전을 찍는다 (이슈 #118)
--
-- 왜 필요한가: 어떤 채점 결과가 어느 설정으로 나왔는지 되짚을 수 없으면
-- 성적 이의제기에 답할 수 없고, 설정 변경의 효과도 사후에 측정할 수 없다.
-- `pricing_version` 이 이미 같은 역할을 하고 있으므로 그 옆에 축을 하나 더 붙인다.
--
-- 추가 전용이고 nullable 이다. 마이그레이션 이전 행은 NULL 로 남는 것이 정상이며,
-- 그것이 "언제부터 관측이 시작됐는지" 를 그대로 보여 준다.
-- 앱보다 먼저 적용해야 한다(반대 순서면 컬럼 없는 DB에 INSERT 가 날아간다).

BEGIN;

ALTER TABLE public.ai_events
  ADD COLUMN IF NOT EXISTS config_version uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ai_events_config_version_fkey'
      AND conrelid = 'public.ai_events'::regclass
  ) THEN
    ALTER TABLE public.ai_events
      ADD CONSTRAINT ai_events_config_version_fkey
      FOREIGN KEY (config_version)
      REFERENCES public.ai_config_versions(id)
      ON DELETE RESTRICT;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_ai_events_config_version_created_at
  ON public.ai_events (config_version, created_at DESC);

COMMIT;

-- ─────────────────────────────────────────────────────────────
-- 롤백 메모
-- ─────────────────────────────────────────────────────────────
-- 파괴적 down 마이그레이션을 만들지 않는다. 옛 앱은 nullable 컬럼을 무시하고,
-- 이미 찍힌 값은 그대로 유효하다.
