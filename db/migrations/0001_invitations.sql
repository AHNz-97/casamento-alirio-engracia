-- Evolução da primeira estrutura local para o sistema de convites personalizados.
-- Esta migração destina-se a bases que já tenham as tabelas rsvps e messages.

CREATE TABLE IF NOT EXISTS invitations (
  id TEXT PRIMARY KEY,
  public_token TEXT NOT NULL UNIQUE,
  recipient_name TEXT NOT NULL,
  contact_phone TEXT NOT NULL,
  contact_phone_normalized TEXT NOT NULL,
  category TEXT NOT NULL,
  guest_of TEXT NOT NULL DEFAULT '',
  created_by TEXT NOT NULL DEFAULT '',
  invitation_type TEXT NOT NULL
    CHECK (invitation_type IN ('individual', 'family', 'collective')),
  guest_limit INTEGER NOT NULL DEFAULT 1
    CHECK (guest_limit BETWEEN 1 AND 200),
  status TEXT NOT NULL DEFAULT 'sent'
    CHECK (status IN ('sent', 'confirmed', 'absent', 'inflation')),
  notes TEXT NOT NULL DEFAULT '',
  sent_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

ALTER TABLE rsvps ADD COLUMN invitation_id TEXT
  REFERENCES invitations(id) ON DELETE CASCADE;

ALTER TABLE rsvps ADD COLUMN phone_normalized TEXT NOT NULL DEFAULT '';

ALTER TABLE rsvps ADD COLUMN updated_at TEXT NOT NULL DEFAULT '';

ALTER TABLE rsvps ADD COLUMN requested_guest_count INTEGER NOT NULL DEFAULT 1;

ALTER TABLE rsvps ADD COLUMN decision_status TEXT NOT NULL DEFAULT 'confirmed';

ALTER TABLE rsvps ADD COLUMN reviewed_by TEXT;

ALTER TABLE rsvps ADD COLUMN reviewed_at TEXT;

UPDATE rsvps
SET decision_status = CASE WHEN attendance = 'no' THEN 'absent' ELSE 'confirmed' END,
    requested_guest_count = guest_count;

ALTER TABLE messages ADD COLUMN invitation_id TEXT
  REFERENCES invitations(id) ON DELETE CASCADE;

ALTER TABLE messages ADD COLUMN sender_phone_normalized TEXT NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS invitations_category_idx
  ON invitations (category);

CREATE INDEX IF NOT EXISTS invitations_status_created_idx
  ON invitations (status, created_at DESC);

CREATE INDEX IF NOT EXISTS rsvps_invitation_created_idx
  ON rsvps (invitation_id, created_at);

CREATE INDEX IF NOT EXISTS rsvps_invitation_decision_idx
  ON rsvps (invitation_id, decision_status, created_at);

CREATE UNIQUE INDEX IF NOT EXISTS rsvps_invitation_phone_unique_idx
  ON rsvps (invitation_id, phone_normalized)
  WHERE invitation_id IS NOT NULL AND phone_normalized <> '';

CREATE INDEX IF NOT EXISTS messages_rsvp_created_idx
  ON messages (rsvp_id, created_at DESC);

CREATE INDEX IF NOT EXISTS messages_invitation_sender_idx
  ON messages (invitation_id, sender_phone_normalized, created_at DESC);
