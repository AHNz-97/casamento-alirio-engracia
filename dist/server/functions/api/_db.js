const schemaStatements = [
  `CREATE TABLE IF NOT EXISTS invitations (
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
    pdf_object_key TEXT,
    pdf_filename TEXT,
    pdf_generated_at TEXT,
    pdf_generated_by TEXT,
    pdf_needs_update INTEGER NOT NULL DEFAULT 0
      CHECK (pdf_needs_update IN (0, 1)),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS guest_origins (
    id TEXT PRIMARY KEY,
    label TEXT NOT NULL COLLATE NOCASE UNIQUE,
    created_by TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS rsvps (
    id TEXT PRIMARY KEY,
    invitation_id TEXT,
    name TEXT NOT NULL,
    phone TEXT NOT NULL,
    phone_normalized TEXT NOT NULL DEFAULT '',
    attendance TEXT NOT NULL
      CHECK (attendance IN ('yes', 'no')),
    guest_count INTEGER NOT NULL DEFAULT 1
      CHECK (guest_count BETWEEN 1 AND 200),
    requested_guest_count INTEGER NOT NULL DEFAULT 1
      CHECK (requested_guest_count BETWEEN 1 AND 200),
    decision_status TEXT NOT NULL DEFAULT 'confirmed'
      CHECK (decision_status IN ('confirmed', 'absent', 'rejected')),
    reviewed_by TEXT,
    reviewed_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT '',
    FOREIGN KEY (invitation_id) REFERENCES invitations(id) ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    rsvp_id TEXT,
    invitation_id TEXT,
    name TEXT NOT NULL,
    sender_phone_normalized TEXT NOT NULL DEFAULT '',
    message TEXT NOT NULL,
    approved INTEGER NOT NULL DEFAULT 0
      CHECK (approved IN (0, 1)),
    moderation_status TEXT NOT NULL DEFAULT 'pending'
      CHECK (moderation_status IN ('pending', 'approved', 'hidden')),
    moderated_by TEXT,
    moderated_at TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (rsvp_id) REFERENCES rsvps(id) ON DELETE SET NULL,
    FOREIGN KEY (invitation_id) REFERENCES invitations(id) ON DELETE CASCADE
  )`,
  `CREATE INDEX IF NOT EXISTS invitations_category_idx
    ON invitations (category)`,
  `CREATE INDEX IF NOT EXISTS invitations_status_created_idx
    ON invitations (status, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS guest_origins_label_idx
    ON guest_origins (label COLLATE NOCASE)`,
  `CREATE INDEX IF NOT EXISTS rsvps_invitation_created_idx
    ON rsvps (invitation_id, created_at)`,
  `CREATE INDEX IF NOT EXISTS rsvps_invitation_decision_idx
    ON rsvps (invitation_id, decision_status, created_at)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS rsvps_invitation_phone_unique_idx
    ON rsvps (invitation_id, phone_normalized)
    WHERE invitation_id IS NOT NULL AND phone_normalized <> ''`,
  `CREATE INDEX IF NOT EXISTS messages_rsvp_created_idx
    ON messages (rsvp_id, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS messages_invitation_sender_idx
    ON messages (invitation_id, sender_phone_normalized, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS messages_approved_created_idx
    ON messages (approved, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS messages_moderation_created_idx
    ON messages (moderation_status, created_at DESC)`,
  `INSERT OR IGNORE INTO guest_origins (id, label, created_by, created_at, updated_at)
    VALUES ('origin-noivo', 'Noivo', 'Sistema', '2026-08-02T00:00:00.000Z', '2026-08-02T00:00:00.000Z')`,
  `INSERT OR IGNORE INTO guest_origins (id, label, created_by, created_at, updated_at)
    VALUES ('origin-noiva', 'Noiva', 'Sistema', '2026-08-02T00:00:00.000Z', '2026-08-02T00:00:00.000Z')`,
  `INSERT OR IGNORE INTO guest_origins (id, label, created_by, created_at, updated_at)
    VALUES ('origin-pais-noivo', 'Pais do noivo', 'Sistema', '2026-08-02T00:00:00.000Z', '2026-08-02T00:00:00.000Z')`,
  `INSERT OR IGNORE INTO guest_origins (id, label, created_by, created_at, updated_at)
    VALUES ('origin-pais-noiva', 'Pais da noiva', 'Sistema', '2026-08-02T00:00:00.000Z', '2026-08-02T00:00:00.000Z')`,
  `INSERT OR IGNORE INTO guest_origins (id, label, created_by, created_at, updated_at)
    VALUES ('origin-irmaos-noivo', 'Irmãos do noivo', 'Sistema', '2026-08-02T00:00:00.000Z', '2026-08-02T00:00:00.000Z')`,
  `INSERT OR IGNORE INTO guest_origins (id, label, created_by, created_at, updated_at)
    VALUES ('origin-irmaos-noiva', 'Irmãos da noiva', 'Sistema', '2026-08-02T00:00:00.000Z', '2026-08-02T00:00:00.000Z')`,
];

export async function ensureSchema(db) {
  await db.batch(schemaStatements.map((statement) => db.prepare(statement)));
}

export function clean(value, maxLength) {
  return String(value ?? "").trim().slice(0, maxLength);
}
