import { requireStaff } from './admin/_access.js';
import { ensureInharrime, json } from './admin/inharrime.js';
import { attachSeats } from '../../lib/seating-store.js';
export async function protocol(request,env){
  const access=await requireStaff(request,env);if(!access.ok)return access.response;
  await ensureInharrime(env.DB);
  if(request.method==='GET'){
    const rows=(await env.DB.prepare('SELECT id,recipient_name,guest_count,category FROM inharrime_invitations ORDER BY recipient_name COLLATE NOCASE,sequence').all()).results??[];
    const guests=await attachSeats(env.DB,rows);
    return json({guests:guests.map(r=>({id:r.id,name:r.recipient_name,count:r.guest_count,category:r.category,seats:r.seats.map(s=>({code:s.code,arrivedAt:s.arrived_at,version:s.version}))})),serverTime:new Date().toISOString()});
  }
  if(request.method!=='POST')return json({error:'Método não permitido.'},405);
  let body;try{const raw=await request.text();if(raw.length>4096)throw new Error();body=JSON.parse(raw);if(!body||!/^\d[A-E]0\d$/.test(body.code)||!['present','absent'].includes(body.action)||!Number.isInteger(body.version)||!/^[a-f0-9-]{36}$/.test(body.requestId)||!/^[a-f0-9-]{36}$/.test(body.invitationId))throw new Error();}catch{return json({error:'Pedido de presença inválido.'},400);}
  const previous=await env.DB.prepare('SELECT * FROM seating_events WHERE request_id = ?').bind(body.requestId).first();
  if(previous)return previous.code===body.code&&previous.action===body.action&&previous.invitation_id===body.invitationId?json({ok:true,arrivedAt:previous.arrived_at,replayed:true}):json({error:'Pedido já usado com outros dados.'},409);
  const seat=await env.DB.prepare('SELECT * FROM seating_seats WHERE code = ?').bind(body.code).first();
  if(!seat)return json({error:'Código não encontrado. Peça ao administrador para gerar o convite.'},404);
  if(seat.version!==body.version||seat.invitation_id!==body.invitationId)return json({error:'Outro dispositivo alterou esta presença ou lugar. A lista será actualizada.'},409);
  if(Boolean(seat.arrived_at)===(body.action==='present'))return json({ok:true,arrivedAt:seat.arrived_at,unchanged:true});
  const now=new Date().toISOString(),arrivedAt=body.action==='present'?now:null;
  try{await env.DB.batch([
    env.DB.prepare('INSERT OR REPLACE INTO seating_write_guard (valid) VALUES ((SELECT COUNT(*) FROM seating_seats WHERE code = ? AND version = ? AND invitation_id = ?))').bind(body.code,body.version,body.invitationId),
    env.DB.prepare('UPDATE seating_seats SET arrived_at = ?,version = version + 1 WHERE code = ?').bind(arrivedAt,body.code),
    env.DB.prepare('INSERT INTO seating_events (id,request_id,invitation_id,code,action,arrived_at,recorded_at,recorded_by) VALUES (?,?,?,?,?,?,?,?)').bind(crypto.randomUUID(),body.requestId,seat.invitation_id,body.code,body.action,arrivedAt,now,access.email),
  ]);}catch{return json({error:'Esta presença mudou noutro dispositivo. Actualize e verifique antes de repetir.'},409);}
  return json({ok:true,arrivedAt});
}
