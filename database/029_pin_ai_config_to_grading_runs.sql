-- 029: 대량 채점 런에 AI 설정 버전을 고정한다 (이슈 #118)
--
-- 왜 필요한가: `/bulk-grade/start` 는 학생 N 명을 QStash 로 팬아웃하고 워커들이
-- 몇 분에 걸쳐 돈다. 그 사이 관리자가 설정을 바꾸면 앞의 30명과 뒤의 70명이 서로
-- 다른 채점기에 걸린다. 같은 시험 학생들이 다른 설정으로 채점되는 건 공정성 문제이고
-- 성적 이의제기에서 방어할 수 없다.
--
-- 그래서 런 시작 시점에 (1) 어떤 설정 버전을 쓰는지와 (2) 완전히 해석된 프로필
-- 스냅샷을 같은 조건부 UPDATE 안에 함께 박는다. 워커는 production 라벨을 다시
-- 읽지 않고 이 스냅샷만 본다.
--
-- 전부 추가 전용이고 nullable 이라 앱보다 먼저 적용해도 안전하다.
-- 기존(마이그레이션 이전) 런은 두 컬럼이 NULL 인 채로 남고, 워커는 페이로드
-- sentinel 로 신규/레거시를 구분한다(컬럼 NULL 만 보고 폴백하지 않는다).

BEGIN;

ALTER TABLE public.exam_grading_sessions
  ADD COLUMN IF NOT EXISTS ai_config_version_id uuid;

ALTER TABLE public.exam_grading_sessions
  ADD COLUMN IF NOT EXISTS ai_profile_snapshot jsonb;

-- FK 는 버전 행이 지워지는 것을 막는다(불변 이력 보호).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'exam_grading_sessions_ai_config_version_fkey'
      AND conrelid = 'public.exam_grading_sessions'::regclass
  ) THEN
    ALTER TABLE public.exam_grading_sessions
      ADD CONSTRAINT exam_grading_sessions_ai_config_version_fkey
      FOREIGN KEY (ai_config_version_id)
      REFERENCES public.ai_config_versions(id)
      ON DELETE RESTRICT;
  END IF;
END $$;

-- 스냅샷은 객체여야 한다. 배열/스칼라가 들어오면 워커의 태스크 조회가 조용히 실패한다.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'exam_grading_sessions_ai_profile_snapshot_is_object'
      AND conrelid = 'public.exam_grading_sessions'::regclass
  ) THEN
    ALTER TABLE public.exam_grading_sessions
      ADD CONSTRAINT exam_grading_sessions_ai_profile_snapshot_is_object
      CHECK (ai_profile_snapshot IS NULL OR jsonb_typeof(ai_profile_snapshot) = 'object');
  END IF;
END $$;

-- 짝 제약: 버전과 스냅샷은 항상 함께 있거나 함께 없어야 한다.
-- 하나만 있는 상태는 "핀이 있다고 믿고 잘못된 프로필로 채점" 하는 경로를 열어 준다.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'exam_grading_sessions_ai_pin_pair'
      AND conrelid = 'public.exam_grading_sessions'::regclass
  ) THEN
    ALTER TABLE public.exam_grading_sessions
      ADD CONSTRAINT exam_grading_sessions_ai_pin_pair
      CHECK ((ai_config_version_id IS NULL) = (ai_profile_snapshot IS NULL));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_exam_grading_sessions_ai_config_version
  ON public.exam_grading_sessions (ai_config_version_id);

COMMIT;

-- ─────────────────────────────────────────────────────────────
-- 롤백 메모
-- ─────────────────────────────────────────────────────────────
-- 파괴적 down 마이그레이션을 만들지 않는다. 앱만 롤백하고 컬럼/제약은 남긴다.
-- 다만 앱 롤백 시 sentinel 을 단 신규 작업을 옛 워커가 받으면 안 되므로,
-- 롤백 절차에서 새 벌크 시작을 잠깐 멈추고 호환 워커를 먼저 배포한다.
