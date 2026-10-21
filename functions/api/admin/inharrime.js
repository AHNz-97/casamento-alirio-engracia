import { requireAdmin, hashText } from './_access.js';
import { validateBatch, sheetSummary } from '../../../shared/inharrime.js';
import { createInharrimePdf } from '../../../lib/inharrime-pdf.js';
import { createDigitalPdf } from '../../../lib/digital-pdf.js';
import { ensureSeating, attachSeats, seatStatements } from '../../../lib/seating-store.js';

const schema = [
  `CREATE TABLE IF NOT EXISTS inharrime_batches (request_id TEXT PRIMARY KEY, payload_hash TEXT NOT NULL, created_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS inharrime_invitations (
    sequence INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT NOT NULL UNIQUE, public_token TEXT NOT NULL UNIQUE,
    recipient_name TEXT NOT NULL, guest_count INTEGER NOT NULL CHECK (guest_count BETWEEN 1 AND 200),
    category TEXT NOT NULL DEFAULT '', table_name TEXT NOT NULL DEFAULT '', contact_phone TEXT NOT NULL DEFAULT '',
    request_id TEXT NOT NULL, batch_position INTEGER NOT NULL, created_by TEXT NOT NULL, created_at TEXT NOT NULL,
    UNIQUE (request_id, batch_position), FOREIGN KEY (request_id) REFERENCES inharrime_batches(request_id))`,
  `CREATE TABLE IF NOT EXISTS inharrime_generated (invitation_id TEXT PRIMARY KEY REFERENCES inharrime_invitations(id) ON DELETE CASCADE, fingerprint TEXT NOT NULL, generated_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS inharrime_pdf_runs (id TEXT PRIMARY KEY, object_key TEXT NOT NULL, selection_json TEXT NOT NULL, fingerprint TEXT NOT NULL, invitation_count INTEGER NOT NULL, created_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS inharrime_messages (id TEXT PRIMARY KEY, invitation_id TEXT NOT NULL REFERENCES inharrime_invitations(id) ON DELETE CASCADE, name TEXT NOT NULL, message TEXT NOT NULL, photo_key TEXT, photo_type TEXT, moderation_status TEXT NOT NULL DEFAULT 'pending' CHECK (moderation_status IN ('pending', 'approved', 'hidden')), created_at TEXT NOT NULL, moderated_at TEXT, moderated_by TEXT, request_id TEXT NOT NULL, UNIQUE(invitation_id, request_id))`,
  `CREATE INDEX IF NOT EXISTS inharrime_messages_status ON inharrime_messages(moderation_status, created_at)`,
];
export const fingerprint = row => JSON.stringify(['seating-v1',row.id, row.recipient_name, row.guest_count, row.category, row.table_name, row.contact_phone]);
export const json = (body, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
export async function ensureInharrime(db) { await db.batch(schema.map(sql => db.prepare(sql))); await ensureSeating(db); }
export async function authorize(request, env) {
  const access = await requireAdmin(request, env);
  if (!access.ok) return access;
  if (!env.DB) return { ok: false, response: json({ error: 'A base de dados não está disponível.' }, 503) };
  await ensureInharrime(env.DB);
  return access;
}
async function list(db) {
  const result = await db.prepare('SELECT i.*, g.fingerprint AS generated_fingerprint, g.generated_at FROM inharrime_invitations i LEFT JOIN inharrime_generated g ON g.invitation_id = i.id ORDER BY i.sequence ASC').all();
  return attachSeats(db,result.results ?? []);
}
export async function onRequestGet({ request, env }) {
  const access = await authorize(request, env);
  if (!access.ok) return access.response;
  const invitations = await list(env.DB);
  const latest = await env.DB.prepare('SELECT * FROM inharrime_pdf_runs ORDER BY created_at DESC, id DESC LIMIT 1').first();
  let run = null;
  if (latest) {
    const ids = new Set(JSON.parse(latest.selection_json));
    const selected = invitations.filter(row => ids.has(row.id));
    const current = await hashText(selected.map(fingerprint).join('|'));
    run = { id: latest.id, ids:[...ids], count: latest.invitation_count, createdAt: latest.created_at, stale: selected.length !== ids.size || current !== latest.fingerprint, ...sheetSummary(latest.invitation_count) };
  }
  return json({ invitations: invitations.map(row => ({ ...row, revision: fingerprint(row), generated: row.generated_fingerprint === fingerprint(row) })), run, summary: { ...sheetSummary(invitations.length), generated: invitations.filter(row => row.generated_fingerprint === fingerprint(row)).length, people: invitations.reduce((sum, row) => sum + row.guest_count, 0) } });
}
export async function onRequestPost({ request, env }) {
  const access = await authorize(request, env);
  if (!access.ok) return access.response;
  if (request.headers.get('Origin') && request.headers.get('Origin') !== new URL(request.url).origin) return json({ error: 'Origem não autorizada.' }, 403);
  if (!request.headers.get('Content-Type')?.includes('application/json')) return json({ error: 'Envie os dados em JSON.' }, 415);
  let rows, body;
  try {
    const raw = await request.text();
    if (raw.length > 1024 * 1024) return json({ error: 'O lote excede o tamanho permitido.' }, 413);
    body = JSON.parse(raw);
    if (!/^[a-zA-Z0-9-]{16,80}$/.test(body.requestId ?? '')) throw new Error('Identificador do pedido inválido.');
    rows = validateBatch(body.invitations);
    if (rows.some(row=>!row.category)) throw new Error('Indique uma das 11 categorias para atribuir automaticamente mesa e cadeira.');
  } catch (error) { return json({ error: error.message || 'JSON inválido.' }, 400); }
  const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(rows)))), value => value.toString(16).padStart(2, '0')).join('');
  const existing = await env.DB.prepare('SELECT payload_hash FROM inharrime_batches WHERE request_id = ?').bind(body.requestId).first();
  if (existing && existing.payload_hash !== hash) return json({ error: 'Este pedido já foi usado com dados diferentes. Reabra o formulário.' }, 409);
  if (existing) return json({ created: rows.length, replayed: true });
  const now = new Date().toISOString();
  const allocated = rows.map(row=>({id:crypto.randomUUID(),recipient_name:row.recipientName,category:row.category,guest_count:row.guestCount}));
  let seatWrites; try { seatWrites=await seatStatements(env.DB,allocated); } catch(error) { return json({error:error.message},409); }
  const statements = [env.DB.prepare('INSERT OR IGNORE INTO inharrime_batches (request_id, payload_hash, created_at) VALUES (?, ?, ?)').bind(body.requestId, hash, now)];
  for (let index = 0; index < rows.length; index++) {
    const row = rows[index];
    statements.push(env.DB.prepare(`INSERT OR IGNORE INTO inharrime_invitations
      (id, public_token, recipient_name, guest_count, category, table_name, contact_phone, request_id, batch_position, created_by, created_at)
      SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE EXISTS
      (SELECT 1 FROM inharrime_batches WHERE request_id = ? AND payload_hash = ?)
      AND NOT EXISTS (SELECT 1 FROM inharrime_invitations WHERE request_id = ? AND batch_position = ?)`)
      .bind(allocated[index].id, crypto.randomUUID().replaceAll('-', ''), row.recipientName, row.guestCount,
        row.category, row.tableName, row.contactPhone, body.requestId, index, access.email, now, body.requestId, hash, body.requestId, index));
  }
  // D1 batch is transactional. A retry of the same request cannot duplicate invitations.
  try { await env.DB.batch([...statements,...seatWrites]); } catch {
    const replay = await env.DB.prepare('SELECT payload_hash FROM inharrime_batches WHERE request_id = ?').bind(body.requestId).first();
    if (replay?.payload_hash===hash) return json({created:rows.length,replayed:true});
    return json({error:'A distribuição de lugares mudou. Tente guardar novamente.'},409);
  }
  const stored = await env.DB.prepare('SELECT payload_hash FROM inharrime_batches WHERE request_id = ?').bind(body.requestId).first();
  if (stored?.payload_hash !== hash) return json({ error: 'Este pedido já foi usado com dados diferentes.' }, 409);
  return json({ created: rows.length, replayed: Boolean(existing) }, existing ? 200 : 201);
}

async function assetBytes(request, env, path) {
  const response = await env.ASSETS.fetch(new Request(new URL(path, request.url)));
  if (!response.ok) throw new Error('O modelo do convite não está disponível.');
  return response.arrayBuffer();
}
export async function pdfResponse(request, env, invitations, single = false) {
  const digital = single;
  const revision = new URL(request.url).origin + '|' + invitations.map(row => `${row.sequence}:${fingerprint(row)}`).join('|');
  const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(revision))), value => value.toString(16).padStart(2, '0')).join('');
  const key = `inharrime/v3/${digital ? 'digital' : 'a4'}/${digest}.pdf`;
  const filename = single ? `convite-inharrime-${String(invitations[0].sequence).padStart(4, '0')}.pdf` : 'convites-inharrime.pdf';
  const headers = { 'Content-Type': 'application/pdf', 'Content-Disposition': `${new URL(request.url).searchParams.has('download') ? 'attachment' : 'inline'}; filename="${filename}"`, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' };
  const cached = env.PDFS ? await env.PDFS.get(key) : null;
  if (cached) return new Response(cached.body, { headers });
  const [template, fontBytes] = await Promise.all([
    assetBytes(request, env, digital ? '/assets/images/convite-base.png' : '/assets/documents/convite-inharrime.pdf'),
    assetBytes(request, env, '/assets/fonts/noto-serif-latin-400-normal.woff'),
  ]);
  const bytes = digital ? await createDigitalPdf({ template, fontBytes, invitation: invitations[0], origin: new URL(request.url).origin }) : await createInharrimePdf({ template, fontBytes, invitations, origin: new URL(request.url).origin });
  if (env.PDFS) await env.PDFS.put(key, bytes, { httpMetadata: { contentType: 'application/pdf' } });
  return new Response(bytes, { headers });
}
export async function onRequestPdf({ request, env }) {
  const access = await authorize(request, env);
  if (!access.ok) return access.response;
  const id = new URL(request.url).searchParams.get('id');
  const invitations = await list(env.DB);
  if (id) {
    const row = invitations.find(row => row.id === id);
    if (!row) return json({ error: 'Convidado não encontrado.' }, 404);
    if (row.generated_fingerprint !== fingerprint(row)) return json({ error: 'Gere o convite deste convidado antes de baixar o PDF.' }, 409);
    return pdfResponse(request, env, [row], true);
  }
  const runId = new URL(request.url).searchParams.get('run');
  const run = runId ? await env.DB.prepare('SELECT * FROM inharrime_pdf_runs WHERE id = ?').bind(runId).first() : await env.DB.prepare('SELECT * FROM inharrime_pdf_runs ORDER BY created_at DESC, id DESC LIMIT 1').first();
  if (!run) return json({ error: 'Seleccione os convidados e use “Gerar PDF” primeiro.' }, 404);
  const selectedIds = new Set(JSON.parse(run.selection_json));
  const selected = invitations.filter(row => selectedIds.has(row.id));
  if (selected.length !== selectedIds.size || await hashText(selected.map(fingerprint).join('|')) !== run.fingerprint) return json({ error: 'A lista foi alterada. Gere novamente o PDF.' }, 409);
  const object = await env.PDFS?.get(run.object_key);
  if (!object) return json({ error: 'O PDF não está disponível. Gere novamente.' }, 404);
  return new Response(object.body, { headers: { 'Content-Type': 'application/pdf', 'Cache-Control': 'private, no-store', 'Content-Disposition': `${new URL(request.url).searchParams.has('download') ? 'attachment' : 'inline'}; filename="convites-inharrime.pdf"` } });
}

export async function onRequestPut({ request, env }) {
  const access = await authorize(request, env); if (!access.ok) return access.response;
  let body, fields;
  try { body = await request.json(); fields = validateBatch([body])[0]; } catch (error) { return json({ error: error.message }, 400); }
  const old = await env.DB.prepare('SELECT * FROM inharrime_invitations WHERE id = ?').bind(String(body.id ?? '')).first();
  if (!old) return json({ error: 'Convidado não encontrado.' }, 404);
  if (body.revision !== fingerprint(old)) return json({ error: 'O registo foi alterado. Actualize a lista antes de editar.' }, 409);
  if(!fields.category)return json({error:'Indique a categoria para atribuir os lugares.'},400);
  const seats=await env.DB.prepare('SELECT COUNT(*) AS total FROM seating_seats WHERE invitation_id = ?').bind(old.id).first();
  let seatWrites=[];try { if(old.category!==fields.category || old.guest_count!==fields.guestCount || seats.total!==fields.guestCount)seatWrites=await seatStatements(env.DB,[{id:old.id,recipient_name:fields.recipientName,category:fields.category,guest_count:fields.guestCount}],[old.id]); }catch(error){return json({error:error.message},409);}
  const guard=env.DB.prepare('INSERT OR REPLACE INTO seating_write_guard (valid) VALUES ((SELECT COUNT(*) FROM inharrime_invitations WHERE id = ? AND recipient_name = ? AND guest_count = ? AND category = ? AND table_name = ? AND contact_phone = ?))').bind(old.id,old.recipient_name,old.guest_count,old.category,old.table_name,old.contact_phone);
  const update=env.DB.prepare('UPDATE inharrime_invitations SET recipient_name = ?, guest_count = ?, category = ?, contact_phone = ? WHERE id = ?').bind(fields.recipientName,fields.guestCount,fields.category,fields.contactPhone,old.id);
  try{await env.DB.batch([guard,update,...seatWrites]);}catch{return json({error:'Os dados ou lugares mudaram. Actualize a lista e tente novamente.'},409);}
  return json({ ok: true });
}
export async function onRequestDelete({ request, env }) {
  const access = await authorize(request, env); if (!access.ok) return access.response;
  let body; try { body = await request.json(); } catch { return json({ error: 'Dados inválidos.' }, 400); }
  const old = await env.DB.prepare('SELECT * FROM inharrime_invitations WHERE id = ?').bind(String(body.id ?? '')).first();
  if (!old) return json({ error: 'Convidado não encontrado.' }, 404);
  if (body.revision !== fingerprint(old)) return json({ error: 'O registo foi alterado. Actualize a lista.' }, 409);
  const photos = await env.DB.prepare('SELECT photo_key FROM inharrime_messages WHERE invitation_id = ? AND photo_key IS NOT NULL').bind(old.id).all();
  const result = await env.DB.prepare('DELETE FROM inharrime_invitations WHERE id = ? AND recipient_name = ? AND guest_count = ? AND category = ? AND table_name = ? AND contact_phone = ?').bind(old.id, old.recipient_name, old.guest_count, old.category, old.table_name, old.contact_phone).run();
  if (result.meta?.changes !== 1) return json({ error: 'O registo foi alterado. Actualize a lista.' }, 409);
  if (env.PDFS) await Promise.allSettled((photos.results ?? []).map(row => env.PDFS.delete(row.photo_key)));
  return json({ ok: true });
}
export async function onRequestGenerate({ request, env }) {
  const access = await authorize(request, env); if (!access.ok) return access.response;
  if (!env.PDFS) return json({ error: 'O arquivo de PDFs não está disponível.' }, 503);
  let body; try { body = await request.json(); } catch { return json({ error: 'Dados inválidos.' }, 400); }
  if (!Array.isArray(body.ids) || !body.ids.length || body.ids.some(id => typeof id !== 'string')) return json({ error: 'Seleccione pelo menos um convidado.' }, 400);
  const ids = new Set(body.ids); let selected = (await list(env.DB)).filter(row => ids.has(row.id));
  if (selected.length !== ids.size) return json({ error: 'A lista mudou. Actualize-a e seleccione novamente.' }, 409);
  const missing=selected.filter(row=>row.seats.length!==row.guest_count);
  if(missing.length){try{await env.DB.batch(await seatStatements(env.DB,missing,missing.map(r=>r.id)));selected=(await list(env.DB)).filter(r=>ids.has(r.id));}catch(error){return json({error:error.message||'Não foi possível atribuir os lugares.'},409);}}
  const response = await pdfResponse(request, env, selected);
  const bytes = await response.arrayBuffer(), id = crypto.randomUUID(), key = `inharrime/runs/${id}.pdf`, now = new Date().toISOString();
  await env.PDFS.put(key, bytes, { httpMetadata: { contentType: 'application/pdf' } });
  try {
    const statements = [env.DB.prepare('INSERT INTO inharrime_pdf_runs (id, object_key, selection_json, fingerprint, invitation_count, created_at) VALUES (?, ?, ?, ?, ?, ?)').bind(id, key, JSON.stringify(selected.map(row => row.id)), await hashText(selected.map(fingerprint).join('|')), selected.length, now)];
    selected.forEach(row => statements.push(env.DB.prepare('INSERT INTO inharrime_generated (invitation_id, fingerprint, generated_at) VALUES (?, ?, ?) ON CONFLICT(invitation_id) DO UPDATE SET fingerprint = excluded.fingerprint, generated_at = excluded.generated_at').bind(row.id, fingerprint(row), now)));
    await env.DB.batch(statements);
  } catch { await env.PDFS.delete(key); return json({ error: 'A lista mudou durante a geração. Actualize-a e tente novamente.' }, 409); }
  return json({ ok: true, id, ...sheetSummary(selected.length) });
}
export async function onRequestAllocate({request,env}){
  const access=await authorize(request,env);if(!access.ok)return access.response;
  const pending=(await list(env.DB)).filter(row=>row.seats.length!==row.guest_count);
  if(!pending.length)return json({ok:true,allocated:0});
  try{await env.DB.batch(await seatStatements(env.DB,pending,pending.map(r=>r.id)));}catch(error){return json({error:error.message||'Não foi possível atribuir os lugares.'},409);}
  return json({ok:true,allocated:pending.reduce((n,r)=>n+r.guest_count,0)});
}
