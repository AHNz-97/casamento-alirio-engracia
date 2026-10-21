-- Arquivo persistente dos PDFs e opções administráveis de “Convidado de”.

ALTER TABLE invitations ADD COLUMN pdf_object_key TEXT;
ALTER TABLE invitations ADD COLUMN pdf_filename TEXT;
ALTER TABLE invitations ADD COLUMN pdf_generated_at TEXT;
ALTER TABLE invitations ADD COLUMN pdf_generated_by TEXT;
ALTER TABLE invitations ADD COLUMN pdf_needs_update INTEGER NOT NULL DEFAULT 0
  CHECK (pdf_needs_update IN (0, 1));

CREATE TABLE IF NOT EXISTS guest_origins (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL COLLATE NOCASE UNIQUE,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS guest_origins_label_idx
  ON guest_origins (label COLLATE NOCASE);

INSERT OR IGNORE INTO guest_origins (id, label, created_by, created_at, updated_at) VALUES
  ('origin-noivo', 'Noivo', 'Sistema', '2026-08-02T00:00:00.000Z', '2026-08-02T00:00:00.000Z'),
  ('origin-noiva', 'Noiva', 'Sistema', '2026-08-02T00:00:00.000Z', '2026-08-02T00:00:00.000Z'),
  ('origin-pais-noivo', 'Pais do noivo', 'Sistema', '2026-08-02T00:00:00.000Z', '2026-08-02T00:00:00.000Z'),
  ('origin-pais-noiva', 'Pais da noiva', 'Sistema', '2026-08-02T00:00:00.000Z', '2026-08-02T00:00:00.000Z'),
  ('origin-irmaos-noivo', 'Irmãos do noivo', 'Sistema', '2026-08-02T00:00:00.000Z', '2026-08-02T00:00:00.000Z'),
  ('origin-irmaos-noiva', 'Irmãos da noiva', 'Sistema', '2026-08-02T00:00:00.000Z', '2026-08-02T00:00:00.000Z');

INSERT OR IGNORE INTO guest_origins (id, label, created_by, created_at, updated_at)
SELECT 'origin-existing-' || lower(hex(randomblob(8))), guest_of, 'Migração', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM invitations
WHERE guest_of <> '';
