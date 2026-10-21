import { requireAdmin, requireStaff, login, logout, loginPage } from './functions/api/admin/_access.js';
import presentationHtml from './lib/mensagens.html';
import adminHtml from './lib/admin.html';
import badgesHtml from './lib/badges-admin.html';
import protocolHtml from './lib/protocol.html';
import xaiPublicHtml from './lib/xai-public.html';
import xaiAdminHtml from './lib/xai-admin.html';
import {xaiApi,withEventNavigation} from './lib/xai-xai.js';
import { protocol } from './functions/api/protocol.js';
import { categoryPage } from './lib/category-page.js';
import { handleBadges } from './functions/api/admin/badges.js';
import * as inharrime from './functions/api/admin/inharrime.js';
import { invitationHtml, publicInvitation } from './lib/inharrime-public.js';
import { submitMessage, submitCategoryMessage, listMessages, moderateMessage, servePhoto } from './functions/api/guest-messages.js';
const json = inharrime.json;
async function serveAsset(request, env, path) {
  if (!env.ASSETS) return new Response('Página não encontrada.', { status: 404 });
  const url = new URL(request.url); url.pathname = path;
  const response = await env.ASSETS.fetch(new Request(url, request));
  if (path === '/admin.html') { const headers = new Headers(response.headers); headers.set('Cache-Control', 'private, no-store'); return new Response(response.body, { status: response.status, headers }); }
  return response;
}
export default {
  async fetch(request, env) {
    const path = new URL(request.url).pathname;
    try {
      if(path==='/api/login' && request.method==='POST') return await login(request,env);
      if(path==='/api/logout' && request.method==='POST') return await logout(request,env);
      if(path==='/login') return new Response(loginPage(),{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'}});
      if(path.startsWith('/api/admin/xai-xai/')||path.startsWith('/api/xai-xai/')||path.startsWith('/api/invitations/')||path==='/api/rsvp')return await xaiApi(request,env);
      const oldInvite=path.match(/^\/(?:xai-xai\/)?i\/([A-Za-z0-9_-]{16,80})\/?$/);
      if(oldInvite||((path==='/'||path==='/index.html')&&new URL(request.url).searchParams.has('invite'))){
        const target=new URL('/xai-xai',request.url);target.searchParams.set('invite',oldInvite?oldInvite[1]:new URL(request.url).searchParams.get('invite'));return Response.redirect(target,302);
      }
      if(['/xai-xai','/xai-xai/'].includes(path)&&request.method==='GET')return new Response(xaiPublicHtml,{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'private, no-store','Referrer-Policy':'no-referrer'}});
      if(['/admin/xai-xai','/admin/xai-xai/','/admin/xai-xai/mensagens'].includes(path)){
        const access=await requireAdmin(request,env);if(!access.ok)return Response.redirect(new URL('/login',request.url),302);
        const html=path.endsWith('/mensagens')?presentationHtml.replace('<body>','<body data-messages-endpoint="/api/xai-xai/messages">').replace('href="/"','href="/admin/xai-xai"'):withEventNavigation(xaiAdminHtml,'xai-xai');
        return new Response(html,{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'private, no-store'}});
      }
      if(['/protocolo','/protocolo/'].includes(path)) {
        if(!(await requireStaff(request,env)).ok)return Response.redirect(new URL('/login',request.url),302);
        return new Response(protocolHtml,{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'private, no-store'}});
      }
      if(path==='/api/protocol')return await protocol(request,env);
      const categoryMatch=path.match(/^\/mensagem\/categoria\/(\d{1,2})\/?$/);
      if(categoryMatch&&request.method==='GET')return await categoryPage(request,env,Number(categoryMatch[1]));
      const categoryPost=path.match(/^\/api\/category-messages\/(\d{1,2})$/);
      if(categoryPost&&request.method==='POST')return await submitCategoryMessage(request,env,Number(categoryPost[1]));
      if(['/admin/crachas','/admin/crachas/'].includes(path)) {
        if (!(await requireAdmin(request,env)).ok) return Response.redirect(new URL('/login',request.url),302);
        return new Response(badgesHtml,{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'private, no-store'}});
      }
      if(['/api/admin/badges','/api/admin/badges/generate','/api/admin/badges/pdf','/api/admin/badges/photo'].includes(path)) return await handleBadges(request,env);
      if(['/admin','/admin/','/admin.html','/admin/inharrime','/admin/inharrime/'].includes(path)) {
        const access=await requireAdmin(request,env);
        if(!access.ok) return Response.redirect(new URL((await requireStaff(request,env)).ok?'/protocolo':'/login',request.url),302);
        return new Response(withEventNavigation(adminHtml,'inharrime'),{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'private, no-store'}});
      }
      if(path==='/api/admin/inharrime') {
        const suffix=request.method[0]+request.method.slice(1).toLowerCase(),handler=inharrime[`onRequest${suffix}`];
        return handler ? await handler({request,env}) : json({error:'Método não permitido.'},405);
      }
      if(path==='/api/admin/inharrime/generate' && request.method==='POST') return await inharrime.onRequestGenerate({request,env});
      if(path==='/api/admin/inharrime/allocate' && request.method==='POST') return await inharrime.onRequestAllocate({request,env});
      if(path==='/api/admin/inharrime/pdf' && request.method==='GET') return await inharrime.onRequestPdf({request,env});
      if(path==='/api/admin/guest-messages') {
        if(request.method==='GET')return await listMessages(request,env,true);
        if(request.method==='PUT')return await moderateMessage(request,env);
        return json({error:'Método não permitido.'},405);
      }
      const messageMatch=path.match(/^\/api\/guest-messages\/([a-f0-9]{32})$/);
      if(messageMatch && request.method==='POST')return await submitMessage(request,env,messageMatch[1]);
      const photoMatch=path.match(/^\/api\/photos\/([a-f0-9-]{36})$/);
      if(photoMatch && request.method==='GET')return await servePhoto(request,env,photoMatch[1]);
      if(path==='/api/messages' && request.method==='GET')return await listMessages(request,env);
      if(['/mensagens','/mensagens/','/mensagens.html'].includes(path)) {
        if (!(await requireAdmin(request,env)).ok) return Response.redirect(new URL('/login',request.url),302);
        return new Response(presentationHtml,{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'private, no-store'}});
      }
      if((path.startsWith('/convite/')||path.startsWith('/inharrime/convite/')) && request.method==='GET') return await publicInvitation(request,env);
      if(['/', '/index.html','/inharrime','/inharrime/'].includes(path)) return new Response(invitationHtml(),{headers:{'Content-Type':'text/html; charset=utf-8'}});
      if(path.startsWith('/api/') || path.startsWith('/i/')) return json({error:'Página não encontrada.'},404);
      return serveAsset(request,env,path);
    } catch (error) {
      console.error('Falha no pedido',path,error?.message);
      return json({error:'Não foi possível concluir o pedido. Tente novamente.'},500);
    }
  }
};
