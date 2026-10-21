CREATE TABLE IF NOT EXISTS protocol_sessions (token_hash TEXT PRIMARY KEY, password_revision TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS seating_write_guard (valid INTEGER PRIMARY KEY CHECK(valid = 1));
CREATE TABLE IF NOT EXISTS seating_tables (prefix TEXT PRIMARY KEY, category TEXT NOT NULL, UNIQUE(prefix,category));
CREATE TABLE IF NOT EXISTS seating_seats (code TEXT PRIMARY KEY, prefix TEXT NOT NULL, category TEXT NOT NULL, invitation_id TEXT NOT NULL REFERENCES inharrime_invitations(id) ON DELETE CASCADE, ordinal INTEGER NOT NULL, arrived_at TEXT, version INTEGER NOT NULL DEFAULT 0, UNIQUE(invitation_id,ordinal), FOREIGN KEY(prefix,category) REFERENCES seating_tables(prefix,category));
CREATE TABLE IF NOT EXISTS seating_events (id TEXT PRIMARY KEY, request_id TEXT NOT NULL, invitation_id TEXT NOT NULL, code TEXT NOT NULL, action TEXT NOT NULL, arrived_at TEXT, recorded_at TEXT NOT NULL, recorded_by TEXT NOT NULL, UNIQUE(request_id,code));
CREATE TABLE IF NOT EXISTS category_messages (id TEXT PRIMARY KEY, category_id INTEGER NOT NULL CHECK(category_id BETWEEN 1 AND 11), table_code TEXT NOT NULL, name TEXT NOT NULL DEFAULT '', message TEXT NOT NULL, photo_key TEXT, photo_type TEXT, moderation_status TEXT NOT NULL DEFAULT 'pending' CHECK(moderation_status IN ('pending','approved','hidden')), created_at TEXT NOT NULL, moderated_at TEXT, moderated_by TEXT, request_id TEXT NOT NULL UNIQUE, sender_hash TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS category_messages_sender ON category_messages(sender_hash,created_at);
CREATE INDEX IF NOT EXISTS seating_seats_invitation ON seating_seats(invitation_id);
UPDATE inharrime_invitations SET category = 'Irmãos' WHERE category = 'Primos';
