import assert from 'node:assert/strict';
import {fetchWithDeadline} from '../shared/badge-pdfs.js';
const origin='https://casamento.purruma.com';let cookie='';
async function request(path,body,auth=true){const headers={};if(auth&&cookie)headers.Cookie=cookie;if(body)headers['Content-Type']='application/json';return fetchWithDeadline(origin+path,{method:body?'POST':'GET',headers,body:body?JSON.stringify(body):undefined,redirect:'manual'},60000);}
try{
 for(const [path,expected] of [['/inharrime','4 de outubro de 2026'],['/xai-xai','3 de outubro de 2026']]){const r=await request(path);assert.equal(r.status,200);assert.ok((await r.text()).includes(expected));console.log(path+' disponível');}
 assert.equal((await request('/admin/xai-xai')).status,302);assert.equal((await request('/api/admin/xai-xai/invitations')).status,401);assert.equal((await request('/api/xai-xai/messages')).status,401);
 const login=await request('/api/login',{username:'alirio',password:process.env.INVITE_ADMIN_PASSWORD});assert.equal(login.status,200);cookie=login.headers.get('set-cookie').split(';')[0];
 for(const path of ['/admin/inharrime','/admin/xai-xai']){const r=await request(path);assert.equal(r.status,200);const html=await r.text();assert.ok(html.includes('Convites de Xai-Xai')&&html.includes('Convites de Inharrime'));}
 const xaiResponse=await request('/api/admin/xai-xai/invitations');assert.equal(xaiResponse.status,200);const xai=await xaiResponse.json();
 const inhResponse=await request('/api/admin/inharrime');assert.equal(inhResponse.status,200);const inh=await inhResponse.json();
 const first=xai.invitations[0];if(first){const link=await request('/i/'+first.public_token,null,false);assert.equal(link.status,302);assert.ok(link.headers.get('location').includes('/xai-xai?invite='));const guest=await request('/api/xai-xai/invitations/'+first.public_token,null,false);assert.equal(guest.status,200);}
 for(const path of ['/api/admin/xai-xai/messages','/api/admin/xai-xai/guest-origins','/api/xai-xai/messages','/admin/xai-xai/mensagens'])assert.equal((await request(path)).status,200);
 console.log(JSON.stringify({xaiInvitations:xai.invitations.length,xaiResponses:xai.summary.responses,inharrimeInvitations:inh.invitations?.length,legacyLinkChecked:!!first,sharedAdmin:true,privateMessages:true}));
}finally{if(cookie)await request('/api/logout',{});}
