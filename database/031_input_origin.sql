-- 031: 교수 메시지의 입력 출처(input_origin) 기록
--
-- 왜 필요한가:
--   role='user' 는 "교수가 그 문장을 썼다"를 뜻하지 않는다.
--   app/api/exam/[examId]/bulk-grade/chat-options/route.ts 가 buildQuickReplyOptionsPrompt 로
--   AI에게 보기 문구를 생성시키고, components/instructor/BulkGradingPanel.tsx 가 그 보기를
--   그대로 채팅 메시지로 전송한다. 교수는 클릭만 했고 문장의 저자는 모델이다.
--   게다가 그 모델은 학생 답안을 근거로 문구를 만든다 — 즉 학생 텍스트가 교수 발화로
--   둔갑해 저장될 수 있는 경로다. 저장된 행만 보면 교수가 타이핑한 문장과 구분되지 않는다.
--
--   이후 "교수가 실제로 쓴 문장에서만 선호를 추출한다"는 경계(030_instructor_memory.sql 의
--   instructor_memories.input_origin)를 강제하려면, 원본 메시지 단계에서 출처가
--   사실로 남아 있어야 한다. 이 마이그레이션이 그 사실을 만든다.
--
-- 이 마이그레이션은 전부 "추가 전용"이다. 기존 컬럼 변경·삭제 없음.
--
-- NULL 을 허용하는 이유:
--   기존 행의 출처는 알 수 없다. 모르는 것을 'typed' 로 백필하면 "교수가 썼다"는
--   거짓을 만들어 내고, 그 거짓이 곧바로 추출 경계를 통과한다.
--   따라서 백필하지 않는다. NULL = "출처 미상" 이고, 소비 측은 NULL 을
--   'typed' 로 취급해서는 안 된다.
--
-- 값 어휘는 030_instructor_memory.sql 의 instructor_memories.input_origin 과 맞춘다.
--   다만 'derived' 는 제외한다. 그것은 원본 메시지가 아니라 추출 결과의 출처이며,
--   메시지 행에는 존재할 수 없는 값이다.
--
-- ⚠️ 반드시 소비 코드보다 먼저 적용·배포할 것. 반대 순서면 컬럼 없는 DB에 INSERT 가 날아간다.

BEGIN;

-- ─────────────────────────────────────────────────────────────
-- 1. bulk_grading_messages: 일괄 가채점 대화 (quick-reply 경로가 여기 있다)
-- ─────────────────────────────────────────────────────────────
ALTER TABLE public.bulk_grading_messages
  ADD COLUMN IF NOT EXISTS input_origin text NULL
    CHECK (input_origin IN ('typed','quick_reply','pasted','imported'));

-- ─────────────────────────────────────────────────────────────
-- 2. grading_chats: 개별 문항 채점 대화
-- ─────────────────────────────────────────────────────────────
ALTER TABLE public.grading_chats
  ADD COLUMN IF NOT EXISTS input_origin text NULL
    CHECK (input_origin IN ('typed','quick_reply','pasted','imported'));

COMMIT;

-- ─────────────────────────────────────────────────────────────
-- 롤백 (소비 코드 배포 전이면 무손실 — 컬럼이 추가되기만 했다)
-- ─────────────────────────────────────────────────────────────
-- BEGIN;
-- ALTER TABLE public.grading_chats DROP COLUMN IF EXISTS input_origin;
-- ALTER TABLE public.bulk_grading_messages DROP COLUMN IF EXISTS input_origin;
-- COMMIT;
