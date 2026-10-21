CREATE TABLE IF NOT EXISTS inharrime_batches (
  request_id TEXT PRIMARY KEY,
  payload_hash TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS inharrime_invitations (
  sequence INTEGER PRIMARY KEY AUTOINCREMENT,
  id TEXT NOT NULL UNIQUE,
  public_token TEXT NOT NULL UNIQUE,
  recipient_name TEXT NOT NULL,
  guest_count INTEGER NOT NULL CHECK (guest_count BETWEEN 1 AND 200),
  category TEXT NOT NULL DEFAULT '',
  table_name TEXT NOT NULL DEFAULT '',
  contact_phone TEXT NOT NULL DEFAULT '',
  request_id TEXT NOT NULL,
  batch_position INTEGER NOT NULL,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (request_id, batch_position),
  FOREIGN KEY (request_id) REFERENCES inharrime_batches(request_id)
);
