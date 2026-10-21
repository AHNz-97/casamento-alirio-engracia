import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFile, writeFile } from 'node:fs/promises';
import { PDFDocument } from 'pdf-lib';
import { handleBadges } from '../functions/api/admin/badges.js';
import { validateBadges, badgeSummary } from '../shared/badges.js';
import { login, hashText } from '../functions/api/admin/_access.js';
import { parseDelimited } from '../shared/inharrime.js';

test('badge fields, aliases, CSV and front-only pagination',()=>{
  assert.deepEqual(validateBadges(parseDelimited('Nome;Função\nAlírio Nhamize;Protocolo')), [{name:'Alírio Nhamize',role:'Protocolo'}]);
  for(const row of [{name:'A'},{role:'MC'},{name:'',role:'MC'},{name:'A',role:'x'.repeat(61)},{name:'A\nB',role:'MC'}])assert.throws(()=>validateBadges([row]));
  assert.deepEqual(badgeSummary(7,'horizontal'),{count:7,perPage:6,pages:2,templates:5});
  assert.deepEqual(badgeSummary(9,'vertical'),{count:9,perPage:4,pages:3,templates:3});
});

test('private badge CRUD, retry, selection, both PDFs, stale runs and append',async()=>{
  const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON');
  const DB={prepare(sql){let args=[];return {bind(...v){args=v;return this;},async first(){return db.prepare(sql).get(...args)??null;},async all(){return {results:db.prepare(sql).all(...args)};},async run(){return {meta:db.prepare(sql).run(...args)};}};},async batch(statements){db.exec('BEGIN');try{const r=[];for(const s of statements)r.push(await s.run());db.exec('COMMIT');return r;}catch(e){db.exec('ROLLBACK');throw e;}}};
  const stored=new Map();const env={DB,ADMIN_ALIRIO_PASSWORD_SHA256:await hashText('test-password'),ASSETS:{async fetch(r){return new Response(await readFile(new URL('../'+new URL(r.url).pathname.slice(1),import.meta.url)));}},PDFS:{async put(k,b){stored.set(k,b);},async get(k){return stored.has(k)?{body:stored.get(k)}:null;},async delete(k){stored.delete(k);}}};
  const headers={'Content-Type':'application/json'};
  const req=(path='',method='GET',body)=>new Request('https://example.com/api/admin/badges'+path,{method,headers,body:body?JSON.stringify(body):undefined});
  assert.equal((await handleBadges(req(),env)).status,401);
  const signed=await login(new Request('https://example.com/api/login',{method:'POST',headers,body:JSON.stringify({username:'alirio',password:'test-password'})}),env);headers.Cookie=signed.headers.get('Set-Cookie').split(';')[0];
  const get=async()=>await (await handleBadges(req(),env)).json();
  const rows=[{name:'Alírio Horácio Nhamize',role:'Protocolo'},{name:'Maria da Conceição Nhamize',role:'Cozinha'},{name:'João',role:'MC'},{name:'Alexandrina Maria de Lurdes da Conceição Nhamize',role:'Coordenação geral do protocolo e recepção dos convidados'},{name:'Ana Manuel',role:'Organização'},{name:'Engrácia Nhancumbe',role:'Recepção'},{name:'Rosa',role:'Cozinha'}];
  const body={requestId:crypto.randomUUID(),badges:rows};
  assert.equal((await handleBadges(req('','POST',body),env)).status,201);
  assert.equal((await handleBadges(req('','POST',body),env)).status,200);
  assert.equal((await handleBadges(req('','POST',{...body,badges:[rows[0]]}),env)).status,409);
  let data=await get();assert.equal(data.badges.length,7);assert.equal(data.runs.length,0);assert.equal(stored.size,0);
  const ids=data.badges.map(r=>r.id);
  assert.equal((await handleBadges(req('/generate','POST',{model:'horizontal',ids:[]}),env)).status,400);
  assert.equal((await handleBadges(req('/generate','POST',{model:'horizontal',ids:['missing']}),env)).status,409);
  for(const model of ['horizontal','vertical']){
    const selected=model==='horizontal'?ids:ids.slice(0,5);
    const response=await handleBadges(req('/generate','POST',{model,ids:selected}),env);assert.equal(response.status,201);
    const run=await response.json();assert.equal(run.pages,2);assert.equal(run.count,selected.length);
    const pdf=await handleBadges(req('/pdf?run='+run.id),env);assert.equal(pdf.status,200);const bytes=new Uint8Array(await pdf.arrayBuffer());
    assert.equal((await PDFDocument.load(bytes)).getPageCount(),2,'no extra back pages');
    await writeFile(new URL('../output/pdf/crachas-'+model+'.pdf',import.meta.url),bytes);
  }
  data=await get();assert.equal(data.runs.length,2);assert.ok(data.runs.every(r=>!r.stale));
  const beforePhoto=data.badges[0];
  const upload=async(row,bytes)=>{
    bytes??=await readFile(new URL('../assets/images/simbolo-noivos.png',import.meta.url));
    const form=new FormData();form.set('revision',row.revision);form.set('photo',new Blob([bytes],{type:'image/png'}),'portrait.png');
    return handleBadges(new Request('https://example.com/api/admin/badges/photo?id='+row.id,{method:'POST',headers:{Cookie:headers.Cookie},body:form}),env);
  };
  assert.equal((await upload(beforePhoto,new Uint8Array([1,2,3]))).status,400);
  let photoResponse=await upload(beforePhoto);assert.equal(photoResponse.status,200);
  let withPhoto=(await photoResponse.json()).badge;assert.ok(withPhoto.photo_url);assert.ok(stored.has(withPhoto.photo_key));
  assert.equal((await handleBadges(new Request('https://example.com'+withPhoto.photo_url),env)).status,401);
  const privatePhoto=await handleBadges(new Request('https://example.com'+withPhoto.photo_url,{headers}),env);
  assert.equal(privatePhoto.status,200);assert.equal(privatePhoto.headers.get('Cache-Control'),'private, no-store');
  assert.ok((await get()).runs.every(r=>r.stale),'upload invalidates PDFs');
  const objectCount=stored.size;assert.equal((await upload(beforePhoto)).status,409);assert.equal(stored.size,objectCount);
  assert.equal((await handleBadges(req('','PUT',{...beforePhoto,role:'MC'}),env)).status,409,'stale edit cannot overwrite a new photo');
  for(const model of ['horizontal','vertical']){
    const generated=await handleBadges(req('/generate','POST',{model,ids:ids.slice(0,2)}),env);assert.equal(generated.status,201);
    const run=await generated.json();const pdf=await handleBadges(req('/pdf?run='+run.id),env);
    assert.equal((await PDFDocument.load(await pdf.arrayBuffer())).getPageCount(),1,'personal photo and fallback share a front-only page');
  }
  const previousKey=withPhoto.photo_key;withPhoto=(await (await upload(withPhoto)).json()).badge;
  assert.notEqual(withPhoto.photo_key,previousKey);assert.ok(!stored.has(previousKey),'replaced photo removed');
  const removed=await handleBadges(req('/photo?id='+withPhoto.id,'DELETE',{revision:withPhoto.revision}),env);
  assert.equal(removed.status,200);assert.equal((await removed.json()).badge.photo_url,null);assert.ok(!stored.has(withPhoto.photo_key));
  data=await get();
  const first=data.badges[0];assert.equal((await handleBadges(req('','PUT',{...first,name:'Alírio Nhamize',revision:first.revision}),env)).status,200);
  assert.equal((await handleBadges(req('','PUT',{...first,role:'MC',revision:first.revision}),env)).status,409);
  assert.ok((await get()).runs.every(r=>r.stale));assert.equal((await handleBadges(req('/pdf?run='+data.runs[0].id),env)).status,409);
  assert.equal((await handleBadges(req('','POST',{requestId:crypto.randomUUID(),badges:[{name:'Sandra',role:'Protocolo'},{name:'Manuel',role:'MC'}]}),env)).status,201);
  data=await get();assert.equal(data.badges.length,9);
  const result=await (await handleBadges(req('/generate','POST',{model:'vertical',ids:data.badges.map(r=>r.id)}),env)).json();assert.equal(result.pages,3);assert.equal(result.templates,3);
  const row=(await (await upload(data.badges[0])).json()).badge;assert.equal((await handleBadges(req('','DELETE',{id:row.id,revision:row.revision}),env)).status,200);
  assert.ok(!stored.has(row.photo_key),'deleting badge removes private photo');
  assert.equal((await get()).badges.length,8);assert.equal((await handleBadges(req('/pdf?run='+result.id),env)).status,409);
});
