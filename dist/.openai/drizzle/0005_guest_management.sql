CREATE TABLE IF NOT EXISTS admin_sessions (token_hash TEXT PRIMARY KEY, password_revision TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS admin_login_attempts (bucket TEXT PRIMARY KEY, attempts INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS inharrime_generated (
  invitation_id TEXT PRIMARY KEY REFERENCES inharrime_invitations(id) ON DELETE CASCADE,
  fingerprint TEXT NOT NULL, generated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS inharrime_pdf_runs (
  id TEXT PRIMARY KEY, object_key TEXT NOT NULL, selection_json TEXT NOT NULL,
  fingerprint TEXT NOT NULL, invitation_count INTEGER NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS inharrime_messages (
  id TEXT PRIMARY KEY,
  invitation_id TEXT NOT NULL REFERENCES inharrime_invitations(id) ON DELETE CASCADE,
  name TEXT NOT NULL, message TEXT NOT NULL,
  photo_key TEXT, photo_type TEXT,
  moderation_status TEXT NOT NULL DEFAULT 'pending' CHECK (moderation_status IN ('pending', 'approved', 'hidden')),
  created_at TEXT NOT NULL, moderated_at TEXT, moderated_by TEXT,
  request_id TEXT NOT NULL, UNIQUE(invitation_id, request_id)
);
CREATE INDEX IF NOT EXISTS inharrime_messages_status ON inharrime_messages(moderation_status, created_at);
