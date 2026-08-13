-- 033: AI 제안 점수·문항 초안 보존 컬럼
--
-- 현재 grades.score와 exams의 문항 내용은 AI 제안과 교수자 확정 값이 같은 컬럼에 덮어쓰기되어
-- 변경 추적이 불가능하다. 이 마이그레이션은 AI 제안 값을 별도로 기록해 감사(audit)와
-- 비교 분석을 가능하게 한다.

BEGIN;

-- ─────────────────────────────────────────────────────────────
-- 1. grades: AI 제안 점수와 교수자 확정 점수 분리
-- ─────────────────────────────────────────────────────────────
-- 현재 grades 테이블의 score 컬럼은 row-wide upsert로 업데이트되어,
-- AI 제안 값과 교수자 확정 값이 같은 공간을 덮어쓴다.
-- 따라서 "AI가 제안한 점수가 정말 무엇이었나"를 추후에 복구할 수 없다.
-- ai_proposed_score와 ai_proposed_at를 기록해 두면 점수 변경의 전체 히스토리를 추적할 수 있고,
-- "교수자가 제안과 얼마나 다르게 점수를 주었는가"를 분석할 수 있다.
-- ai_proposal_source는 어느 시스템(모델명, 버전 등)에서 나온 제안인지 기록한다.
ALTER TABLE grades
  ADD COLUMN IF NOT EXISTS ai_proposed_score numeric;

ALTER TABLE grades
  ADD COLUMN IF NOT EXISTS ai_proposed_at timestamptz;

ALTER TABLE grades
  ADD COLUMN IF NOT EXISTS ai_proposal_source text;

-- ─────────────────────────────────────────────────────────────
-- 2. exams: AI 초안 문항 내용 별도 보존
-- ─────────────────────────────────────────────────────────────
-- 현재 exams 테이블의 문항 내용(예: questions 컬럼)은 JSON blob으로 저장되는데,
-- AI가 생성한 초안과 교수자가 최종 확정한 문항이 같은 컬럼을 덮어쓴다.
-- 따라서 "원본 AI 제안이 정확히 무엇이었는가"를 나중에 확인할 수 없다.
-- ai_draft_questions는 AI가 생성한 초안 문항을 별도로 보존하고,
-- ai_draft_generated_at은 그 생성 시점을 기록해 버전 관리와 감사를 가능하게 한다.
ALTER TABLE exams
  ADD COLUMN IF NOT EXISTS ai_draft_questions jsonb;

ALTER TABLE exams
  ADD COLUMN IF NOT EXISTS ai_draft_generated_at timestamptz;

COMMIT;

-- ─────────────────────────────────────────────────────────────
-- 롤백
-- ─────────────────────────────────────────────────────────────
-- ALTER TABLE exams DROP COLUMN IF EXISTS ai_draft_generated_at;
-- ALTER TABLE exams DROP COLUMN IF EXISTS ai_draft_questions;
-- ALTER TABLE grades DROP COLUMN IF EXISTS ai_proposal_source;
-- ALTER TABLE grades DROP COLUMN IF EXISTS ai_proposed_at;
-- ALTER TABLE grades DROP COLUMN IF EXISTS ai_proposed_score;
