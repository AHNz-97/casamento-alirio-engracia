import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFile} from 'node:fs/promises';
import {PDFDocument} from 'pdf-lib';
import worker from '../dist/server/index.js';
import {hashText} from '../functions/api/admin/_access.js';

test('one admin manages separate events; old Xai-Xai links, RSVP, messages and PDFs work',async()=>{
  const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON');
  const DB={prepare(sql){let values=[];return {bind(...args){values=args;return this;},async first(){return db.prepare(sql).get(...values)??null;},async all(){return {results:db.prepare(sql).all(...values)};},async run(){const s=db.prepare(sql);return s.columns().length?{results:s.all(...values)}:{meta:s.run(...values)};}};},async batch(statements){db.exec('BEGIN');try{const results=[];for(const statement of statements)results.push(await statement.run());db.exec('COMMIT');return results;}catch(error){db.exec('ROLLBACK');throw error;}}};
  const objects=new Map();const env={DB,ADMIN_ALIRIO_PASSWORD_SHA256:await hashText('test-password'),PROTOCOL_PASSWORD_SHA256:await hashText('protocol-password'),PDFS:{async put(key,bytes){objects.set(key,bytes);},async get(key){return objects.has(key)?{body:objects.get(key)}:null;},async delete(key){objects.delete(key);}},ASSETS:{async fetch(request){try{return new Response(await readFile(new URL('../dist/client'+new URL(request.url).pathname,import.meta.url)));}catch{return new Response('Not found',{status:404});}}}};
  let cookie='';
  const call=(path,method='GET',body,authenticated=true)=>worker.fetch(new Request('https://example.com'+path,{method,headers:{...(authenticated&&cookie?{Cookie:cookie}:{}),...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined}),env);
  for(const path of ['/admin','/admin/inharrime','/admin/xai-xai','/admin/xai-xai/mensagens'])assert.equal((await call(path)).status,302);
  assert.equal((await call('/api/admin/xai-xai/invitations')).status,401);
  assert.equal((await call('/api/xai-xai/messages')).status,401);
  const xai=await (await call('/xai-xai/')).text();assert.match(xai,/3 de outubro de 2026/);assert.match(xai,/id="rsvp-form"/);assert.doesNotMatch(xai,/Ver comentários/);assert.match(xai,/src="\/xai-xai.js"/);
  const inh=await (await call('/inharrime')).text();assert.match(inh,/4 de outubro de 2026/);assert.doesNotMatch(inh,/id="rsvp-form"/);
  for(const path of ['/xai-xai.js','/xai-xai-admin.js','/pdf-generator.js','/assets/images/convite-base.png'])assert.equal((await call(path)).status,200);
  for(const path of ['/xai-admin.html','/lib/xai-admin.html'])assert.equal((await call(path)).status,404,'private HTML absent from static assets');
  const login=await call('/api/login','POST',{username:'alirio',password:'test-password'});cookie=login.headers.get('set-cookie').split(';')[0];
  for(const path of ['/admin','/admin/inharrime','/admin/xai-xai']){const response=await call(path);assert.equal(response.status,200);const html=await response.text();assert.match(html,/Convites de Inharrime/);assert.match(html,/Convites de Xai-Xai/);assert.equal(response.headers.get('Cache-Control'),'private, no-store');}
  const details={recipientName:'Convidado de Xai-Xai',contactPhone:'841234567',category:'Família',guestOf:'Noivo',invitationType:'family',guestLimit:2};
  const created=await call('/api/admin/xai-xai/invitations','POST',details);assert.equal(created.status,201);const saved=await created.json();
  assert.equal((await call('/api/admin/inharrime','POST',{requestId:crypto.randomUUID(),invitations:[{nome:'Convidado de Inharrime',pessoas:1,categoria:'Família'}]})).status,201);
  let list=await (await call('/api/admin/xai-xai/invitations')).json();assert.equal(list.invitations.length,1);assert.equal(list.summary.capacity,2);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM inharrime_invitations').get().n,1);
  for(const path of ['/i/'+saved.publicToken,'/?invite='+saved.publicToken,'/index.html?invite='+saved.publicToken]){const redirected=await call(path);assert.equal(redirected.status,302);assert.equal(redirected.headers.get('Location'),'https://example.com/xai-xai?invite='+saved.publicToken);}
  const invitation=await (await call('/api/xai-xai/invitations/'+saved.publicToken,'GET',null,false)).json();assert.equal(invitation.invitation.recipientName,details.recipientName);
  const rsvp=await call('/api/xai-xai/rsvp','POST',{invitationToken:saved.publicToken,name:details.recipientName,phone:details.contactPhone,guestCount:2,attendance:'yes',message:'Felicidades aos noivos!'},false);assert.equal(rsvp.status,200);assert.equal((await rsvp.json()).attendanceRecorded,true);
  list=await (await call('/api/admin/xai-xai/invitations')).json();assert.equal(list.summary.confirmedPeople,2);
  assert.equal((await (await call('/api/xai-xai/messages')).json()).messages.length,0);
  const messages=await (await call('/api/admin/xai-xai/messages')).json();const message=messages.messages[0];assert.equal(message.message,'Felicidades aos noivos!');
  const moderated=await call('/api/admin/xai-xai/messages','PUT',{id:message.id,action:'approve',currentStatus:'pending'});assert.equal(moderated.status,200);
  assert.equal((await (await call('/api/xai-xai/messages')).json()).messages[0].id,message.id);
  assert.equal((await (await call('/api/messages')).json()).messages.length,0,'Inharrime presentation is separate');
  assert.match(await (await call('/admin/xai-xai/mensagens')).text(),/data-messages-endpoint="\/api\/xai-xai\/messages"/);
  const doc=await PDFDocument.create();doc.addPage();const bytes=await doc.save();
  const upload=await worker.fetch(new Request('https://example.com/api/admin/xai-xai/pdfs?id='+saved.id,{method:'POST',headers:{Cookie:cookie,'Content-Type':'application/pdf'},body:bytes}),env);assert.equal(upload.status,201);
  const download=await call('/api/admin/xai-xai/pdfs?id='+saved.id);assert.equal(download.status,200);assert.equal((await PDFDocument.load(await download.arrayBuffer())).getPageCount(),1);
  assert.equal((await call('/api/admin/xai-xai/pdfs?id='+saved.id,'GET',null,false)).status,401);
  const staff=await call('/api/login','POST',{username:'protocolo',password:'protocol-password'});cookie=staff.headers.get('set-cookie').split(';')[0];
  assert.equal((await call('/api/admin/xai-xai/invitations')).status,401);assert.equal((await call('/admin/xai-xai')).status,302);assert.equal((await call('/api/xai-xai/messages')).status,401);
  db.close();
});
