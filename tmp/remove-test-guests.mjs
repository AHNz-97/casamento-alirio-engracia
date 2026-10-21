import {writeFile,unlink,readdir} from 'node:fs/promises';
import {fetchWithDeadline} from '../shared/badge-pdfs.js';
import {normalizeKey} from '../shared/inharrime.js';
const origin='https://casamento.purruma.com';let cookie;
const folder='C:/Users/anham/Desktop/Screepts/Convites Inharrime - Colegas da escola - 2026-09-30';
const targets=['Família Nhamize','Maria e João'];
async function request(path,body,method=body?'POST':'GET'){const headers={};if(cookie)headers.Cookie=cookie;if(body)headers['Content-Type']='application/json';const r=await fetchWithDeadline(origin+path,{method,headers,body:body?JSON.stringify(body):undefined});if(!r.ok)throw new Error(path+' '+r.status+' '+(await r.text()).slice(0,200));return r;}
try{
 const login=await request('/api/login',{username:'alirio',password:process.env.INVITE_ADMIN_PASSWORD});cookie=login.headers.get('set-cookie').split(';')[0];
 let data=await (await request('/api/admin/inharrime')).json();
 for(const name of targets){const rows=data.invitations.filter(r=>normalizeKey(r.recipient_name)===normalizeKey(name));if(rows.length>1)throw new Error('Nome duplicado: '+name);if(rows[0]){const row=rows[0];try{await request('/api/admin/inharrime',{id:row.id,revision:row.revision},'DELETE');}catch(error){if(!String(error).includes('409')||!row.generated_fingerprint)throw error;const old=JSON.parse(row.generated_fingerprint),current=JSON.parse(row.revision);if(old.some((v,i)=>i!==5&&v!==current[i]))throw error;await request('/api/admin/inharrime',{id:row.id,revision:row.generated_fingerprint},'DELETE');}console.log('Apagado: '+name);}}
 data=await (await request('/api/admin/inharrime')).json();if(data.invitations.some(r=>targets.some(n=>normalizeKey(n)===normalizeKey(r.recipient_name))))throw new Error('Registo ainda presente');
 const removed=[];for(const file of await readdir(folder)){if(!file.endsWith('.pdf'))continue;const key=normalizeKey(file.replace(/^\d+\s*-\s*/,'').replace(/\.pdf$/i,''));if(targets.some(n=>normalizeKey(n)===key)||file==='Lista de convidados - Inharrime.pdf'){await unlink(folder+'/'+file);removed.push(file);}}
 const rows=data.invitations.map(r=>({name:r.recipient_name,people:r.guest_count})).sort((a,b)=>a.name.localeCompare(b.name,'pt',{sensitivity:'base'}));
 const result={rows,total:rows.reduce((n,r)=>n+r.people,0),invitations:rows.length,removedLocal:removed};await writeFile(new URL('./inharrime-current-list.json',import.meta.url),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}finally{if(cookie)await request('/api/logout',{});}
