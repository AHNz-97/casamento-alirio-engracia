import { authorize, ensureInharrime, fingerprint, json } from './admin/inharrime.js';
import { requireAdmin, sameOrigin, hashText } from './admin/_access.js';
import { categories } from '../../shared/inharrime.js';
import { tableLabel } from '../../shared/seating.js';

export function inspectPhoto(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let width = 0, height = 0, type = '';
  if (bytes.length > 24 && [137, 80, 78, 71, 13, 10, 26, 10].every((value, i) => bytes[i] === value)) {
    width = view.getUint32(16); height = view.getUint32(20); type = 'image/png';
  } else if (bytes.length > 4 && bytes[0] === 255 && bytes[1] === 216) {
    type = 'image/jpeg'; let offset = 2;
    while (offset + 8 < bytes.length) {
      if (bytes[offset] !== 255) break;
      const marker = bytes[offset + 1];
      if (marker === 0xda || marker === 0xd9) break;
      if (marker === 0xd8 || marker === 0x01 || marker >= 0xd0 && marker <= 0xd7) { offset += 2; continue; }
      const length = view.getUint16(offset + 2);
      if (length < 2 || offset + 2 + length > bytes.length) break;
      if ([0xc0, 0xc1, 0xc2].includes(marker)) { height = view.getUint16(offset + 5); width = view.getUint16(offset + 7); break; }
      offset += 2 + length;
    }
  }
  if (!type || !width || !height || width > 6000 || height > 6000 || width * height > 16000000) throw new Error('Use uma fotografia JPEG ou PNG válida, até 16 megapíxeis.');
  return type;
}

export async function submitMessage(request, env, token) {
  if (!sameOrigin(request)) return json({ error: 'Origem não autorizada.' }, 403);
  if (!env.DB || !/^[a-f0-9]{32}$/.test(token)) return json({ error: 'Convite não encontrado.' }, 404);
  if (Number(request.headers.get('Content-Length') || 0) > 6 * 1024 * 1024) return json({ error: 'A fotografia deve ter no máximo 5 MB.' }, 413);
  await ensureInharrime(env.DB);
  const invitation = await env.DB.prepare('SELECT i.*, g.fingerprint AS generated_fingerprint FROM inharrime_invitations i LEFT JOIN inharrime_generated g ON g.invitation_id = i.id WHERE i.public_token = ?').bind(token).first();
  if (!invitation || invitation.generated_fingerprint !== fingerprint(invitation)) return json({ error: 'Este convite ainda não foi gerado ou foi actualizado.' }, 404);
  let data;
  try { data = await request.formData(); } catch { return json({ error: 'Não foi possível ler a mensagem.' }, 400); }
  const name = String(data.get('name') ?? '').trim(), message = String(data.get('message') ?? '').trim(), requestId = String(data.get('requestId') ?? '');
  if (!name || name.length > 120 || !message || message.length > 1000 || !/^[a-f0-9-]{36}$/.test(requestId)) return json({ error: 'Preencha o nome e uma mensagem de até 1000 caracteres.' }, 400);
  const existing = await env.DB.prepare('SELECT id FROM inharrime_messages WHERE invitation_id = ? AND request_id = ?').bind(invitation.id, requestId).first();
  if (existing) return json({ ok: true, message: 'Mensagem recebida. Será apresentada depois de aprovada.' });
  const since = new Date(Date.now() - 3600000).toISOString();
  const count = await env.DB.prepare('SELECT COUNT(*) AS total FROM inharrime_messages WHERE invitation_id = ? AND created_at >= ?').bind(invitation.id, since).first();
  if (count.total >= 20) return json({ error: 'Já recebemos várias mensagens deste convite. Tente novamente mais tarde.' }, 429);
  let photoKey = null, photoType = null;
  const photo = data.get('photo');
  if (photo && typeof photo !== 'string' && photo.size) {
    if (photo.size > 5 * 1024 * 1024) return json({ error: 'A fotografia deve ter no máximo 5 MB.' }, 413);
    if (!env.PDFS) return json({ error: 'O envio de fotografias não está disponível neste momento.' }, 503);
    const bytes = new Uint8Array(await photo.arrayBuffer());
    try { photoType = inspectPhoto(bytes); } catch (error) { return json({ error: error.message }, 400); }
    photoKey = `inharrime/photos/${crypto.randomUUID()}`;
    await env.PDFS.put(photoKey, bytes, { httpMetadata: { contentType: photoType } });
  }
  try {
    const result = await env.DB.prepare('INSERT OR IGNORE INTO inharrime_messages (id, invitation_id, name, message, photo_key, photo_type, created_at, request_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').bind(crypto.randomUUID(), invitation.id, name, message, photoKey, photoType, new Date().toISOString(), requestId).run();
    if (result.meta?.changes === 0 && photoKey) await env.PDFS.delete(photoKey);
  } catch (error) { if (photoKey) await env.PDFS.delete(photoKey); throw error; }
  return json({ ok: true, message: 'Mensagem recebida. Será apresentada depois de aprovada.' }, 201);
}
const publicRow = row => ({ id: row.id, name: row.name || tableLabel(categories[row.category_id-1] || row.category), message: row.message, photo_url: row.photo_key ? `/api/photos/${row.id}` : null, table_label:tableLabel(categories[row.category_id-1] || row.category), created_at: row.created_at });
export async function listMessages(request, env, admin = false) {
  const access = await authorize(request, env); if (!access.ok) return access.response;
  if (!env.DB) return json({ messages: [] });
  await ensureInharrime(env.DB);
  const result = await env.DB.prepare(`SELECT m.*, i.recipient_name, i.category FROM inharrime_messages m JOIN inharrime_invitations i ON i.id = m.invitation_id ${admin ? '' : "WHERE m.moderation_status = 'approved'"} ORDER BY m.created_at DESC`).all();
  const categoryResult=await env.DB.prepare(`SELECT * FROM category_messages ${admin?'':"WHERE moderation_status = 'approved'"} ORDER BY created_at DESC`).all();
  const rows=[...(result.results??[]).map(r=>({...r,source:'invitation'})),...(categoryResult.results??[]).map(r=>({...r,source:'category',recipient_name:tableLabel(categories[r.category_id-1])}))].sort((a,b)=>b.created_at.localeCompare(a.created_at));
  return json({ messages: rows.map(row => admin ? { ...publicRow(row), source:row.source, moderation_status: row.moderation_status, invitation_recipient: row.recipient_name } : publicRow(row)) });
}
export async function moderateMessage(request, env) {
  const access = await authorize(request, env); if (!access.ok) return access.response;
  let body; try { body = await request.json(); } catch { return json({ error: 'Dados inválidos.' }, 400); }
  if (!['approved', 'hidden', 'pending'].includes(body.status)) return json({ error: 'Estado inválido.' }, 400);
  const table=body.source==='category'?'category_messages':'inharrime_messages';
  const result = await env.DB.prepare(`UPDATE ${table} SET moderation_status = ?, moderated_at = ?, moderated_by = ? WHERE id = ? AND moderation_status = ?`).bind(body.status, new Date().toISOString(), access.email, String(body.id ?? ''), String(body.currentStatus ?? '')).run();
  if (result.meta?.changes !== 1) return json({ error: 'A mensagem foi alterada. Actualize a lista.' }, 409);
  return json({ ok: true });
}
export async function servePhoto(request, env, id) {
  if (!(await requireAdmin(request, env)).ok) return new Response('Fotografia não encontrada.', { status: 404 });
  if (!env.DB || !env.PDFS) return new Response('Fotografia não encontrada.', { status: 404 });
  await ensureInharrime(env.DB);
  const row = await env.DB.prepare('SELECT photo_key, photo_type, moderation_status FROM inharrime_messages WHERE id = ?').bind(id).first() || await env.DB.prepare('SELECT photo_key, photo_type, moderation_status FROM category_messages WHERE id = ?').bind(id).first();
  if (!row?.photo_key) return new Response('Fotografia não encontrada.', { status: 404 });
  const photo = await env.PDFS.get(row.photo_key);
  return photo ? new Response(photo.body, { headers: { 'Content-Type': row.photo_type, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'", 'Cross-Origin-Resource-Policy': 'same-origin' } }) : new Response('Fotografia não encontrada.', { status: 404 });
}
export async function submitCategoryMessage(request,env,id){
  if(!sameOrigin(request))return json({error:'Origem não autorizada.'},403);
  const category=categories[id-1];if(!category||!env.DB)return json({error:'Categoria não encontrada.'},404);
  if(Number(request.headers.get('Content-Length')||0)>6*1024*1024)return json({error:'A fotografia deve ter no máximo 5 MB.'},413);
  await ensureInharrime(env.DB);
  let data;try{data=await request.formData();}catch{return json({error:'Não foi possível ler a mensagem.'},400);}
  const name=String(data.get('name')??'').trim(),message=String(data.get('message')??'').trim(),tableCode=String(data.get('tableCode')??'').trim().toUpperCase(),requestId=String(data.get('requestId')??'');
  if(name.length>120||!message||message.length>1000||!/^[a-f0-9-]{36}$/.test(requestId))return json({error:'Escreva uma mensagem até 1000 caracteres. O nome é opcional.'},400);
  if(tableCode){const table=await env.DB.prepare('SELECT prefix FROM seating_tables WHERE prefix = ? AND category = ?').bind(tableCode,category).first();if(!table)return json({error:'A mesa não pertence a esta categoria. Confirme o QR do convite.'},400);}
  const existing=await env.DB.prepare('SELECT id FROM category_messages WHERE request_id = ?').bind(requestId).first();
  if(existing)return json({ok:true,message:'Mensagem recebida. Obrigado pelo seu carinho!'});
  const sender=await hashText(`${id}:${request.headers.get('CF-Connecting-IP')||'unknown'}`),since=new Date(Date.now()-3600000).toISOString();
  const count=await env.DB.prepare('SELECT COUNT(*) AS total FROM category_messages WHERE sender_hash = ? AND created_at >= ?').bind(sender,since).first();
  if(count.total>=100)return json({error:'Recebemos muitas mensagens desta ligação. Tente novamente mais tarde.'},429);
  let photoKey=null,photoType=null;const photo=data.get('photo');
  if(photo&&typeof photo!=='string'&&photo.size){
    if(photo.size>5*1024*1024)return json({error:'A fotografia deve ter no máximo 5 MB.'},413);
    if(!env.PDFS)return json({error:'Fotografias indisponíveis neste momento.'},503);
    const bytes=new Uint8Array(await photo.arrayBuffer());try{photoType=inspectPhoto(bytes);}catch(e){return json({error:e.message},400);}
    photoKey=`inharrime/photos/${crypto.randomUUID()}`;await env.PDFS.put(photoKey,bytes,{httpMetadata:{contentType:photoType}});
  }
  try{const result=await env.DB.prepare('INSERT OR IGNORE INTO category_messages (id,category_id,table_code,name,message,photo_key,photo_type,created_at,request_id,sender_hash) VALUES (?,?,?,?,?,?,?,?,?,?)').bind(crypto.randomUUID(),id,tableCode,name,message,photoKey,photoType,new Date().toISOString(),requestId,sender).run();if(!result.meta?.changes&&photoKey)await env.PDFS.delete(photoKey);}catch(e){if(photoKey)await env.PDFS.delete(photoKey);throw e;}
  return json({ok:true,message:'Mensagem recebida. Obrigado pelo seu carinho!'},201);
}
