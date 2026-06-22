-- 답안 작성 과정 분석기 결과 캐시
ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS final_answer_authenticity JSONB;
