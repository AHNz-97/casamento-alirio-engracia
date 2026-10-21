import {readFile,writeFile} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import {PDFDocument} from 'pdf-lib';
const origin='https://casamento.purruma.com';
const rows=JSON.parse(await readFile(new URL('./protocolos-badges.json',import.meta.url),'utf8'));
const receiptUrl=new URL('./protocolos-import-receipt.json',import.meta.url);
let receipt;try{receipt=JSON.parse(await readFile(receiptUrl,'utf8'));}catch{receipt={photos:{}};}
const persist=()=>writeFile(receiptUrl,JSON.stringify(receipt,null,2));
let cookie='';
async function request(path,method='GET',body){
 const headers={};if(cookie)headers.Cookie=cookie;
 if(body&&!(body instanceof FormData)){headers['Content-Type']='application/json';body=JSON.stringify(body);}
 const response=await fetch(origin+path,{method,headers,body,redirect:'manual'});
 if(!response.ok)throw new Error(`${method} ${path}: ${response.status} ${(await response.text()).slice(0,400)}`);
 return response;
}
const list=async()=>await (await request('/api/admin/badges')).json();
const match=(all,row)=>{const matches=all.filter(b=>b.name===row.name&&b.role===row.role);if(matches.length>1)throw new Error('Nome duplicado: '+row.name);return matches[0];};
try{
 const login=await request('/api/login','POST',{username:'alirio',password:process.env.INVITE_ADMIN_PASSWORD});
 cookie=login.headers.get('set-cookie')?.split(';')[0];if(!cookie)throw new Error('Login sem sessão');
 const before=await list();const missing=rows.filter(row=>!match(before.badges,row)).map(({name,role})=>({name,role}));
 console.log(JSON.stringify({existing:rows.length-missing.length,adding:missing.map(r=>r.name)}));
 if(missing.length){
  const payload=JSON.stringify(missing);if(receipt.pendingPayload!==payload){receipt.pendingPayload=payload;receipt.requestId=randomUUID();await persist();}
  await request('/api/admin/badges','POST',{requestId:receipt.requestId,badges:missing});
 }
 let current=await list();
 for(const row of rows){
  const badge=match(current.badges,row);if(!badge)throw new Error('Crachá não criado: '+row.name);
  if(!row.photo)continue;
  const bytes=await readFile(new URL('./protocolos-photos/'+row.photo,import.meta.url));
  const hash=createHash('sha256').update(bytes).digest('hex');
  const done=receipt.photos[badge.id];
  if(done&&badge.photo_key&&done.key!==badge.photo_key){console.log('Fotografia alterada no painel preservada: '+row.name);continue;}
  if(!done&&badge.photo_key){console.log('Fotografia existente preservada: '+row.name);continue;}
  if(!done||done.hash!==hash||done.key!==badge.photo_key){
   const form=new FormData();form.set('revision',badge.revision);form.set('photo',new Blob([bytes],{type:'image/jpeg'}),row.photo);
   const result=await (await request('/api/admin/badges/photo?id='+encodeURIComponent(badge.id),'POST',form)).json();
   receipt.photos[badge.id]={hash,key:result.badge.photo_key,name:row.name};await persist();
   console.log('Foto guardada: '+row.name);
  }
 }
 current=await list();const selected=rows.map(row=>match(current.badges,row));
 for(let i=0;i<selected.length;i++){const badge=selected[i];if(rows[i].photo&&!badge.photo_url)throw new Error('Falta fotografia: '+badge.name);if(badge.photo_url)await request(badge.photo_url);}
 const anonymous=await fetch(origin+selected[0].photo_url);if(anonymous.status!==401)throw new Error('Foto não protegida');
 const pdfs=[];
 for(const model of ['horizontal','vertical']){
  const run=await (await request('/api/admin/badges/generate','POST',{model,ids:selected.map(b=>b.id)})).json();
  const bytes=new Uint8Array(await (await request('/api/admin/badges/pdf?run='+run.id)).arrayBuffer());
  const pages=(await PDFDocument.load(bytes)).getPageCount();if(pages!==Math.ceil(selected.length/(model==='horizontal'?6:4)))throw new Error('Paginação inesperada');
  await writeFile(new URL('../output/pdf/protocolos-'+model+'-producao.pdf',import.meta.url),bytes);
  pdfs.push({model,pages,count:run.count});
 }
 receipt.completedAt=new Date().toISOString();receipt.pdfs=pdfs;await persist();
 console.log(JSON.stringify({created:missing.length,reused:rows.length-missing.length,privatePhotos:selected.filter(b=>b.photo_url).length,fallback:selected.filter(b=>!b.photo_url).map(b=>b.name),names:rows.map(r=>r.name),pdfs}));
}finally{if(cookie)await request('/api/logout','POST',{});}
