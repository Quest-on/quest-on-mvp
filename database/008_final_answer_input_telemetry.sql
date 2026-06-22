-- 과제 최종답안 입력 타임라인 (keystroke / paste 메타)
CREATE TABLE IF NOT EXISTS final_answer_input_telemetry (
  session_id UUID PRIMARY KEY REFERENCES sessions(id) ON DELETE CASCADE,
  events JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_final_answer_input_telemetry_updated
  ON final_answer_input_telemetry (updated_at);
