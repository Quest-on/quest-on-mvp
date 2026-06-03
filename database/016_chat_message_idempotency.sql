-- Idempotency for instructor grading chats.
-- client_message_id is supplied by the browser per send action. It is nullable
-- so legacy rows remain valid, while new rows can be deduped per message role.

ALTER TABLE public.grading_chats
  ADD COLUMN IF NOT EXISTS client_message_id uuid;

CREATE UNIQUE INDEX IF NOT EXISTS idx_grading_chats_client_message_role_unique
  ON public.grading_chats(session_id, q_idx, client_message_id, role)
  WHERE client_message_id IS NOT NULL;

ALTER TABLE public.bulk_grading_messages
  ADD COLUMN IF NOT EXISTS client_message_id uuid;

CREATE UNIQUE INDEX IF NOT EXISTS idx_bulk_grading_messages_client_message_role_unique
  ON public.bulk_grading_messages(session_id, client_message_id, role)
  WHERE client_message_id IS NOT NULL;
