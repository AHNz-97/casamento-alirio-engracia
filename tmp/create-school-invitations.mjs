import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {PDFDocument,PDFName} from 'pdf-lib';
import {fetchWithDeadline} from '../shared/badge-pdfs.js';
import {categories,normalizeKey} from '../shared/inharrime.js';
const names=['Valério de Melo','Carlos Gove','António Gove','Edilson Soustino','Anselmo Marengula','Edson Arcanjo','Dulce Pedro','Geraldo Nhabomba','Gina Pacule','Afilaida Santana','Fernando Mucota','Valdemiro Chambule','Agnécio Guambe','Adamo Abdula','Marcos Mazive','Daniel Chandabia','Daniel Mussane','Anselmo Guiumba'];
const rows=names.map((recipientName,i)=>({recipientName,guestCount:[3,4,5].includes(i)?2:1,category:categories[6],contactPhone:'842575261'}));
const receiptPath=new URL('./school-invitations-receipt.json',import.meta.url);
let receipt;try{receipt=JSON.parse(await readFile(receiptPath,'utf8'));}catch{receipt={folder:'C:/Users/anham/Desktop/Screepts/Convites Inharrime - Colegas da escola - 2026-09-30',requestId:crypto.randomUUID()};}
const persist=()=>writeFile(receiptPath,JSON.stringify(receipt,null,2));await persist();
const origin='https://casamento.purruma.com';let cookie;
async function request(path,body,method=body?'POST':'GET'){const headers={};if(cookie)headers.Cookie=cookie;if(body)headers['Content-Type']='application/json';const r=await fetchWithDeadline(origin+path,{method,headers,body:body?JSON.stringify(body):undefined},120000);if(!r.ok)throw new Error(path+' '+r.status+' '+(await r.text()).slice(0,300));return r;}
const list=async()=>(await (await request('/api/admin/inharrime')).json()).invitations;
function match(all,row){const found=all.filter(r=>normalizeKey(r.recipient_name)===normalizeKey(row.recipientName));if(found.length>1)throw new Error('Mais de um registo para '+row.recipientName);return found[0];}
try{
 const login=await request('/api/login',{username:'alirio',password:process.env.INVITE_ADMIN_PASSWORD});cookie=login.headers.get('set-cookie').split(';')[0];
 let all=await list();const missing=rows.filter(r=>!match(all,r));
 for(const row of rows){const existing=match(all,row);if(existing&&(existing.guest_count!==row.guestCount||existing.contact_phone!==row.contactPhone||existing.category!==row.category)){receipt.updated??=[];receipt.updated.push({id:existing.id,name:existing.recipient_name,previousCategory:existing.category,previousContact:existing.contact_phone});await persist();await request('/api/admin/inharrime',{...row,id:existing.id,revision:existing.revision},'PUT');console.log('Actualizado: '+row.recipientName);}}
 if(missing.length){if(receipt.payload&&JSON.stringify(receipt.payload)!==JSON.stringify(missing))receipt.requestId=crypto.randomUUID();receipt.payload=missing;await persist();await request('/api/admin/inharrime',{requestId:receipt.requestId,invitations:missing});}
 all=await list();const selected=rows.map(r=>match(all,r));if(selected.some((r,i)=>!r||r.guest_count!==rows[i].guestCount||r.category!==rows[i].category||r.contact_phone!==rows[i].contactPhone)||selected.reduce((n,r)=>n+r.guest_count,0)!==21)throw new Error('Lista não corresponde às 21 pessoas');
 console.log(JSON.stringify({created:missing.length,reused:18-missing.length,people:21}));
 if(selected.some(r=>!r.generated)){await request('/api/admin/inharrime/generate',{ids:selected.map(r=>r.id)});console.log('Convites gerados.');}
 await mkdir(receipt.folder,{recursive:true});receipt.files=[];
 for(let i=0;i<selected.length;i++){
  const row=selected[i];const bytes=new Uint8Array(await (await request('/api/admin/inharrime/pdf?id='+row.id+'&download=1')).arrayBuffer());
  const pdf=await PDFDocument.load(bytes);if(pdf.getPageCount()!==1||!pdf.getPage(0).node.get(PDFName.of('Annots')))throw new Error('PDF individual inválido: '+row.recipient_name);
  const file=String(i+1).padStart(2,'0')+' - '+row.recipient_name+'.pdf';await writeFile(receipt.folder+'/'+file,bytes);receipt.files.push({file,name:row.recipient_name,people:row.guest_count,id:row.id});await persist();console.log('Guardado: '+file);
 }
 receipt.completedAt=new Date().toISOString();await persist();console.log(JSON.stringify({folder:receipt.folder,pdfs:receipt.files.length,people:21,category:categories[6],contact:'842575261'}));
}finally{if(cookie)await request('/api/logout',{});}
