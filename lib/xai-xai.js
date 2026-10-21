import * as invitations from '../functions/api/admin/invitations.js';
import * as origins from '../functions/api/admin/guest-origins.js';
import * as responses from '../functions/api/admin/responses.js';
import * as pdfs from '../functions/api/admin/pdfs.js';
import * as moderation from '../functions/api/admin/messages.js';
import {onRequestGet as getInvitation} from '../functions/api/invitations/[token].js';
import {onRequestPost as rsvp} from '../functions/api/rsvp.js';
import {onRequestGet as messages} from '../functions/api/messages.js';
import {requireAdmin} from '../functions/api/admin/_access.js';
const adminHandlers={invitations,'guest-origins':origins,responses,pdfs,messages:moderation};
const json=(body,status)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
export async function xaiApi(request,env){
  const path=new URL(request.url).pathname;
  const admin=path.match(/^\/api\/admin\/xai-xai\/([a-z-]+)$/);
  if(admin){
    const module=adminHandlers[admin[1]];
    if(!module)return json({error:'Página não encontrada.'},404);
    const handler=module['onRequest'+request.method[0]+request.method.slice(1).toLowerCase()];
    return handler?handler({request,env}):json({error:'Método não permitido.'},405);
  }
  const invite=path.match(/^\/api\/(?:xai-xai\/)?invitations\/([A-Za-z0-9_-]{16,80})$/);
  if(invite&&request.method==='GET')return getInvitation({request,env,params:{token:invite[1]}});
  if(['/api/xai-xai/rsvp','/api/rsvp'].includes(path)&&request.method==='POST')return rsvp({request,env});
  if(path==='/api/xai-xai/messages'&&request.method==='GET'){
    const access=await requireAdmin(request,env);if(!access.ok)return access.response;
    return messages({request,env});
  }
  return json({error:'Página não encontrada.'},404);
}
export function eventNavigation(active){
  return `<nav class="event-switcher" aria-label="Local dos convites"><a href="/admin/inharrime"${active==='inharrime'?' aria-current="page"':''}>Convites de Inharrime</a><a href="/admin/xai-xai"${active==='xai-xai'?' aria-current="page"':''}>Convites de Xai-Xai</a></nav>`;
}
export const withEventNavigation=(html,active)=>html.replace('<main',eventNavigation(active)+'<main');
