import { planSeats } from '../shared/seating.js';
export const seatingSchema = [
  'CREATE TABLE IF NOT EXISTS seating_write_guard (valid INTEGER PRIMARY KEY CHECK(valid = 1))',
  'CREATE TABLE IF NOT EXISTS protocol_sessions (token_hash TEXT PRIMARY KEY, password_revision TEXT NOT NULL, created_at TEXT NOT NULL)',
  'CREATE TABLE IF NOT EXISTS seating_tables (prefix TEXT PRIMARY KEY, category TEXT NOT NULL, UNIQUE(prefix,category))',
  'CREATE TABLE IF NOT EXISTS seating_seats (code TEXT PRIMARY KEY, prefix TEXT NOT NULL, category TEXT NOT NULL, invitation_id TEXT NOT NULL REFERENCES inharrime_invitations(id) ON DELETE CASCADE, ordinal INTEGER NOT NULL, arrived_at TEXT, version INTEGER NOT NULL DEFAULT 0, UNIQUE(invitation_id,ordinal), FOREIGN KEY(prefix,category) REFERENCES seating_tables(prefix,category))',
  'CREATE TABLE IF NOT EXISTS seating_events (id TEXT PRIMARY KEY, request_id TEXT NOT NULL, invitation_id TEXT NOT NULL, code TEXT NOT NULL, action TEXT NOT NULL, arrived_at TEXT, recorded_at TEXT NOT NULL, recorded_by TEXT NOT NULL, UNIQUE(request_id,code))',
  "CREATE TABLE IF NOT EXISTS category_messages (id TEXT PRIMARY KEY, category_id INTEGER NOT NULL CHECK(category_id BETWEEN 1 AND 11), table_code TEXT NOT NULL, name TEXT NOT NULL DEFAULT '', message TEXT NOT NULL, photo_key TEXT, photo_type TEXT, moderation_status TEXT NOT NULL DEFAULT 'pending' CHECK(moderation_status IN ('pending','approved','hidden')), created_at TEXT NOT NULL, moderated_at TEXT, moderated_by TEXT, request_id TEXT NOT NULL UNIQUE, sender_hash TEXT NOT NULL)",
  'CREATE INDEX IF NOT EXISTS category_messages_sender ON category_messages(sender_hash,created_at)',
  'CREATE INDEX IF NOT EXISTS seating_seats_invitation ON seating_seats(invitation_id)',
];
export async function ensureSeating(db){await db.batch(seatingSchema.map(s=>db.prepare(s)));}
export async function seatRows(db){return (await db.prepare('SELECT * FROM seating_seats ORDER BY code').all()).results??[];}
export async function seatStatements(db,invitations,replaceIds=[]){
  const tables=(await db.prepare('SELECT * FROM seating_tables ORDER BY prefix').all()).results??[];
  const all=await seatRows(db),replacing=new Set(replaceIds),occupied=all.filter(s=>!replacing.has(s.invitation_id));
  if(all.some(s=>replacing.has(s.invitation_id)&&s.arrived_at))throw new Error('Não é possível mudar os lugares de um convite com pessoas presentes. Corrija primeiro a presença no protocolo.');
  const plan=planSeats(tables,occupied,invitations),statements=[];
  for(const id of replaceIds)statements.push(db.prepare('INSERT OR REPLACE INTO seating_write_guard (valid) VALUES (CASE WHEN EXISTS (SELECT 1 FROM seating_seats WHERE invitation_id = ? AND arrived_at IS NOT NULL) THEN 0 ELSE 1 END)').bind(id));
  for(const id of replaceIds)statements.push(db.prepare('DELETE FROM seating_seats WHERE invitation_id = ? AND arrived_at IS NULL').bind(id));
  for(const table of plan.tables){
    if(tables.find(t=>t.prefix===table.prefix)?.category===table.category)continue;
    statements.push(db.prepare('DELETE FROM seating_tables WHERE prefix = ? AND NOT EXISTS (SELECT 1 FROM seating_seats WHERE prefix = ?)').bind(table.prefix,table.prefix));
    statements.push(db.prepare('INSERT OR IGNORE INTO seating_tables (prefix,category) VALUES (?,?)').bind(table.prefix,table.category));
  }
  for(const seat of plan.seats)statements.push(db.prepare('INSERT INTO seating_seats (code,prefix,category,invitation_id,ordinal) VALUES (?,?,?,?,?)').bind(seat.code,seat.prefix,seat.category,seat.invitation_id,seat.ordinal));
  for(const invitation of invitations){const prefixes=[...new Set(plan.seats.filter(s=>s.invitation_id===invitation.id).map(s=>s.prefix))];statements.push(db.prepare('UPDATE inharrime_invitations SET table_name = ? WHERE id = ?').bind(prefixes.join(', '),invitation.id));}
  return statements;
}
export async function attachSeats(db,invitations){const seats=await seatRows(db);return invitations.map(row=>({...row,seats:seats.filter(s=>s.invitation_id===row.id)}));}
