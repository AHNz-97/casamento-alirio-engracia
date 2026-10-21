import { authorize, json } from './inharrime.js';
import { hashText } from './_access.js';
import { validateBadges, badgeRevision, badgeSummary } from '../../../shared/badges.js';
import { createBadgesPdf } from '../../../lib/badges-pdf.js';
import { inspectPhoto } from '../guest-messages.js';
export const badgeSchema = [
  'CREATE TABLE IF NOT EXISTS badge_batches (request_id TEXT PRIMARY KEY, payload_hash TEXT NOT NULL)',
  'CREATE TABLE IF NOT EXISTS badges (sequence INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT NOT NULL UNIQUE, name TEXT NOT NULL, role TEXT NOT NULL, request_id TEXT NOT NULL REFERENCES badge_batches(request_id), batch_position INTEGER NOT NULL, created_at TEXT NOT NULL, UNIQUE(request_id, batch_position))',
  "CREATE TABLE IF NOT EXISTS badge_pdf_runs (id TEXT PRIMARY KEY, model TEXT NOT NULL CHECK(model IN ('horizontal','vertical')), object_key TEXT NOT NULL, selection_json TEXT NOT NULL, fingerprint TEXT NOT NULL, badge_count INTEGER NOT NULL, created_at TEXT NOT NULL)",
  'CREATE TABLE IF NOT EXISTS badge_photos (badge_id TEXT PRIMARY KEY REFERENCES badges(id) ON DELETE CASCADE, photo_key TEXT NOT NULL, photo_type TEXT NOT NULL, created_at TEXT NOT NULL)',
  'CREATE TABLE IF NOT EXISTS badge_write_guard (valid INTEGER PRIMARY KEY CHECK(valid = 1))',
];
const selectBadges='SELECT b.*,p.photo_key,p.photo_type FROM badges b LEFT JOIN badge_photos p ON p.badge_id=b.id';
const list = async db => (await db.prepare(selectBadges+' ORDER BY b.sequence').all()).results ?? [];
const getBadge=(db,id)=>db.prepare(selectBadges+' WHERE b.id = ?').bind(id).first();
const exposed=row=>({...row,revision:badgeRevision(row),photo_url:row.photo_key?`/api/admin/badges/photo?id=${encodeURIComponent(row.id)}&v=${encodeURIComponent(row.photo_key.split('/').at(-1))}`:null});
const guard=(db,row)=>db.prepare('INSERT OR REPLACE INTO badge_write_guard (valid) VALUES ((SELECT COUNT(*) FROM badges b LEFT JOIN badge_photos p ON p.badge_id=b.id WHERE b.id = ? AND b.name = ? AND b.role = ? AND COALESCE(p.photo_key,\'\') = ?))').bind(row.id,row.name,row.role,row.photo_key||'');
const digest = rows => hashText(rows.map(badgeRevision).join('|'));
async function runState(run, rows) {
  if (!run) return null;
  const ids = new Set(JSON.parse(run.selection_json)), selected = rows.filter(r=>ids.has(r.id));
  return { id:run.id, model:run.model, fingerprint:run.fingerprint, createdAt:run.created_at, stale:selected.length!==ids.size || await digest(selected)!==run.fingerprint, ...badgeSummary(run.badge_count,run.model) };
}
export async function handleBadges(request, env) {
  const access=await authorize(request,env);if(!access.ok)return access.response;
  await env.DB.batch(badgeSchema.map(sql=>env.DB.prepare(sql)));
  const path=new URL(request.url).pathname;
  if(path.endsWith('/photo'))return badgePhoto(request,env);
  if(request.method==='GET'){
    const rows=await list(env.DB);
    if(path.endsWith('/pdf')){
      const id=new URL(request.url).searchParams.get('run');
      const run=await env.DB.prepare('SELECT * FROM badge_pdf_runs WHERE id = ?').bind(id ?? '').first();
      if(!run)return json({error:'Gere primeiro o PDF.'},404);
      if((await runState(run,rows)).stale)return json({error:'Os dados foram alterados. Gere novamente o PDF.'},409);
      const file=await env.PDFS?.get(run.object_key);if(!file)return json({error:'PDF não disponível. Gere novamente.'},404);
      return new Response(file.body,{headers:{'Content-Type':'application/pdf','Content-Disposition':`attachment; filename="crachas-${run.model}.pdf"`,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
    }
    const runs=[];for(const model of ['horizontal','vertical'])runs.push(await runState(await env.DB.prepare('SELECT * FROM badge_pdf_runs WHERE model = ? ORDER BY created_at DESC, id DESC LIMIT 1').bind(model).first(),rows));
    return json({badges:rows.map(exposed),runs:runs.filter(Boolean)});
  }
  let body;try{const raw=await request.text();if(raw.length>1024*1024)return json({error:'Ficheiro demasiado grande.'},413);body=JSON.parse(raw);if(!body||typeof body!=='object')throw new Error();}catch{return json({error:'Dados JSON inválidos.'},400);}
  if(path.endsWith('/generate') && request.method==='POST'){
    if(!['horizontal','vertical'].includes(body.model)||!Array.isArray(body.ids)||!body.ids.length||body.ids.length>500||new Set(body.ids).size!==body.ids.length)return json({error:'Escolha o modelo e entre 1 e 500 crachás.'},400);
    if(!env.PDFS)return json({error:'Armazenamento indisponível.'},503);
    const all=await list(env.DB),ids=new Set(body.ids),selected=all.filter(r=>ids.has(r.id));
    if(selected.length!==ids.size)return json({error:'A lista mudou. Actualize antes de gerar.'},409);
    const asset=async p=>{const r=await env.ASSETS.fetch(new Request(new URL(p,request.url)));if(!r.ok)throw new Error('Modelo indisponível.');return r.arrayBuffer();};
    const [template,symbol,fontBytes,horizontalImage]=await Promise.all([asset(`/assets/documents/cracha-${body.model}.pdf`),asset('/assets/images/simbolo-noivos.png'),asset('/assets/fonts/noto-serif-latin-400-normal.woff'),body.model==='horizontal'?asset('/assets/images/cracha-horizontal.png'):null]);
    let photoBytes=0;const loadPhoto=async row=>{const file=await env.PDFS.get(row.photo_key);if(!file)throw new Error(`A fotografia de ${row.name} não está disponível. Carregue-a novamente.`);const bytes=await new Response(file.body).arrayBuffer();photoBytes+=bytes.byteLength;if(photoBytes>32*1024*1024)throw new Error('As fotografias deste lote são demasiado grandes. Gere um grupo menor de crachás.');return {bytes,type:row.photo_type};};
    let bytes;try{bytes=await createBadgesPdf({template,symbol,fontBytes,horizontalImage,badges:selected,model:body.model,loadPhoto});}catch(error){return json({error:error.message||'Não foi possível preparar as fotografias.'},409);}
    const id=crypto.randomUUID(),key=`badges/${id}.pdf`,fingerprint=await digest(selected);
    await env.PDFS.put(key,bytes,{httpMetadata:{contentType:'application/pdf'}});
    const current=(await list(env.DB)).filter(r=>ids.has(r.id));
    if(await digest(current)!==fingerprint){await env.PDFS.delete(key);return json({error:'A lista mudou durante a geração. Gere novamente.'},409);}
    try{await env.DB.prepare('INSERT INTO badge_pdf_runs (id,model,object_key,selection_json,fingerprint,badge_count,created_at) VALUES (?,?,?,?,?,?,?)').bind(id,body.model,key,JSON.stringify(selected.map(r=>r.id)),fingerprint,selected.length,new Date().toISOString()).run();}catch(error){await env.PDFS.delete(key);throw error;}
    return json({id,...badgeSummary(selected.length,body.model)},201);
  }
  if(request.method==='POST'){
    let rows;try{rows=validateBadges(body.badges);if(!/^[a-zA-Z0-9-]{16,80}$/.test(body.requestId??''))throw new Error('Pedido inválido.');}catch(e){return json({error:e.message},400);}
    const hash=await hashText(JSON.stringify(rows)),old=await env.DB.prepare('SELECT payload_hash FROM badge_batches WHERE request_id = ?').bind(body.requestId).first();
    if(old)return old.payload_hash===hash?json({created:rows.length,replayed:true,ids:((await env.DB.prepare('SELECT id FROM badges WHERE request_id = ? ORDER BY batch_position').bind(body.requestId).all()).results??[]).map(r=>r.id)}):json({error:'Pedido já utilizado com outros dados.'},409);
    const statements=[env.DB.prepare('INSERT OR IGNORE INTO badge_batches (request_id,payload_hash) VALUES (?,?)').bind(body.requestId,hash)];
    rows.forEach((r,i)=>statements.push(env.DB.prepare('INSERT OR IGNORE INTO badges (id,name,role,request_id,batch_position,created_at) SELECT ?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM badge_batches WHERE request_id = ? AND payload_hash = ?)').bind(crypto.randomUUID(),r.name,r.role,body.requestId,i,new Date().toISOString(),body.requestId,hash)));
    await env.DB.batch(statements);
    const stored=await env.DB.prepare('SELECT payload_hash FROM badge_batches WHERE request_id = ?').bind(body.requestId).first();
    return stored.payload_hash===hash?json({created:rows.length,ids:((await env.DB.prepare('SELECT id FROM badges WHERE request_id = ? ORDER BY batch_position').bind(body.requestId).all()).results??[]).map(r=>r.id)},201):json({error:'Pedido já utilizado com outros dados.'},409);
  }
  if(['PUT','DELETE'].includes(request.method)){
    const old=await getBadge(env.DB,String(body.id??''));
    if(!old)return json({error:'Crachá não encontrado.'},404);
    if(body.revision!==badgeRevision(old))return json({error:'Os dados mudaram. Actualize a lista.'},409);
    let statement;
    if(request.method==='DELETE')statement=env.DB.prepare('DELETE FROM badges WHERE id = ?').bind(old.id);
    else{let row;try{[row]=validateBadges([body]);}catch(e){return json({error:e.message},400);}statement=env.DB.prepare('UPDATE badges SET name = ?,role = ? WHERE id = ?').bind(row.name,row.role,old.id);}
    try{await env.DB.batch([guard(env.DB,old),statement]);}catch{return json({error:'Os dados mudaram. Actualize a lista.'},409);}
    if(request.method==='DELETE'){if(old.photo_key&&env.PDFS)await env.PDFS.delete(old.photo_key);return json({ok:true});}
    return json({ok:true,badge:exposed(await getBadge(env.DB,old.id))});
  }
  return json({error:'Método não permitido.'},405);
}
async function badgePhoto(request,env){
  const id=new URL(request.url).searchParams.get('id')||'',row=await getBadge(env.DB,id);
  if(!row)return json({error:'Crachá não encontrado.'},404);
  if(request.method==='GET'){
    const file=row.photo_key&&env.PDFS?await env.PDFS.get(row.photo_key):null;if(!file)return json({error:'Fotografia não encontrada.'},404);
    return new Response(file.body,{headers:{'Content-Type':row.photo_type,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'",'Cross-Origin-Resource-Policy':'same-origin'}});
  }
  if(!['POST','DELETE'].includes(request.method))return json({error:'Método não permitido.'},405);
  if(!env.PDFS)return json({error:'Armazenamento indisponível.'},503);
  if(Number(request.headers.get('Content-Length')||0)>6*1024*1024)return json({error:'A fotografia deve ter no máximo 5 MB.'},413);
  let revision,photo,type,bytes;
  try{if(request.method==='DELETE'){revision=(await request.json()).revision;}else{const data=await request.formData();revision=data.get('revision');photo=data.get('photo');if(!photo||typeof photo==='string'||!photo.size||photo.size>5*1024*1024)throw new Error('Escolha uma fotografia JPEG ou PNG até 5 MB.');bytes=new Uint8Array(await photo.arrayBuffer());type=inspectPhoto(bytes);}}catch(e){return json({error:e.message||'Fotografia inválida.'},400);}
  if(revision!==badgeRevision(row))return json({error:'O crachá mudou. Actualize antes de trocar a fotografia.'},409);
  const key=request.method==='POST'?`badges/photos/${id}/${crypto.randomUUID()}`:null;
  if(key)await env.PDFS.put(key,bytes,{httpMetadata:{contentType:type}});
  const statement=key?env.DB.prepare('INSERT INTO badge_photos (badge_id,photo_key,photo_type,created_at) VALUES (?,?,?,?) ON CONFLICT(badge_id) DO UPDATE SET photo_key=excluded.photo_key,photo_type=excluded.photo_type,created_at=excluded.created_at').bind(id,key,type,new Date().toISOString()):env.DB.prepare('DELETE FROM badge_photos WHERE badge_id = ?').bind(id);
  try{await env.DB.batch([guard(env.DB,row),statement]);}catch{if(key)await env.PDFS.delete(key);return json({error:'O crachá mudou durante o envio. Actualize e tente novamente.'},409);}
  if(row.photo_key)await env.PDFS.delete(row.photo_key);
  return json({ok:true,badge:exposed(await getBadge(env.DB,id))});
}
