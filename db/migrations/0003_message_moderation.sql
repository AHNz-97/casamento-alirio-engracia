-- Estados e auditoria para a moderação das mensagens dos convidados.

ALTER TABLE messages ADD COLUMN moderation_status TEXT NOT NULL DEFAULT 'pending'
  CHECK (moderation_status IN ('pending', 'approved', 'hidden'));

ALTER TABLE messages ADD COLUMN moderated_by TEXT;
ALTER TABLE messages ADD COLUMN moderated_at TEXT;

UPDATE messages
SET moderation_status = CASE WHEN approved = 1 THEN 'approved' ELSE 'pending' END;

CREATE INDEX IF NOT EXISTS messages_moderation_created_idx
  ON messages (moderation_status, created_at DESC);
