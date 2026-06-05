ALTER TABLE exams
ADD COLUMN IF NOT EXISTS score_weights JSONB DEFAULT NULL;

COMMENT ON COLUMN exams.score_weights IS
  'Exam-level final score policy. Null keeps legacy per-question average; JSON stores typeWeights for MCQ/OX/Case.';
