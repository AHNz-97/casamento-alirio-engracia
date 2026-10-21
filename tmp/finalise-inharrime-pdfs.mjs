import {readFile,writeFile,readdir,unlink,mkdir} from 'node:fs/promises';
import {PDFDocument,rgb} from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import {fetchWithDeadline} from '../shared/badge-pdfs.js';
import {normalizeKey} from '../shared/inharrime.js';
const folder='C:/Users/anham/Desktop/Screepts/Convites Inharrime - Colegas da escola - 2026-09-30';
const stage=new URL('./current-inharrime-pdfs/',import.meta.url);await mkdir(stage,{recursive:true});
const origin='https://casamento.purruma.com';let cookie;
async function request(path,body,method=body?'POST':'GET'){const headers={};if(cookie)headers.Cookie=cookie;if(body)headers['Content-Type']='application/json';const r=await fetchWithDeadline(origin+path,{method,headers,body:body?JSON.stringify(body):undefined});if(!r.ok)throw new Error(path+' '+r.status+' '+(await r.text()).slice(0,200));return r;}
const list=async()=>(await (await request('/api/admin/inharrime')).json());
try{
 const login=await request('/api/login',{username:'alirio',password:process.env.INVITE_ADMIN_PASSWORD});cookie=login.headers.get('set-cookie').split(';')[0];
 let data=await list();const old=data.invitations.filter(r=>normalizeKey(r.recipient_name)===normalizeKey('Agnécio Guambe'));const fixed=data.invitations.filter(r=>normalizeKey(r.recipient_name)===normalizeKey('Agracio Guambe'));
 if(old.length>1||fixed.length>1||old.length&&fixed.length)throw new Error('Nomes duplicados: rever antes de alterar');
 if(old.length){const row=old[0],body={id:row.id,revision:row.revision,recipientName:'Agracio Guambe',guestCount:row.guest_count,category:row.category,contactPhone:row.contact_phone};try{await request('/api/admin/inharrime',body,'PUT');}catch(error){if(!String(error).includes('409')||!row.generated_fingerprint)throw error;const original=JSON.parse(row.generated_fingerprint),current=JSON.parse(row.revision);if(original.some((v,i)=>i!==5&&v!==current[i]))throw error;await request('/api/admin/inharrime',{...body,revision:row.generated_fingerprint},'PUT');}}
 data=await list();if(!data.invitations.some(r=>r.recipient_name==='Agracio Guambe')||data.invitations.some(r=>normalizeKey(r.recipient_name)===normalizeKey('Agnécio Guambe')))throw new Error('Correcção não confirmada');
 console.log('Nome confirmado no sistema: Agracio Guambe.');
 const rows=data.invitations.sort((a,b)=>a.recipient_name.localeCompare(b.recipient_name,'pt',{sensitivity:'base'}));
 await request('/api/admin/inharrime/generate',{ids:rows.map(r=>r.id)});
 const files=[];
 for(let i=0;i<rows.length;i++){const row=rows[i];const bytes=new Uint8Array(await (await request('/api/admin/inharrime/pdf?id='+row.id+'&download=1')).arrayBuffer());const pdf=await PDFDocument.load(bytes);if(pdf.getPageCount()!==1)throw new Error('PDF inválido');const name=String(i+1).padStart(2,'0')+' - '+row.recipient_name+'.pdf';await writeFile(new URL(name,stage),bytes);files.push(name);console.log('Verificado: '+name);}
 const doc=await PDFDocument.create();doc.registerFontkit(fontkit);const font=await doc.embedFont(await readFile(new URL('../assets/fonts/noto-serif-latin-400-normal.woff',import.meta.url)),{subset:true});const green=rgb(.09,.23,.17);let page,y;
 const text=(s,x,y,size=11)=>page.drawText(String(s),{x,y,size,font,color:green});
 function start(){page=doc.addPage([595.28,841.89]);text('Convidados de Inharrime',42,790,22);text('Casamento de Alírio e Engrácia | 4 de outubro de 2026',42,765,11);text('Lista por ordem alfabética · 30 de setembro de 2026',42,743,10);text('N.º',42,709);text('Nome do convidado',80,709);text('Pessoas',490,709);page.drawLine({start:{x:42,y:697},end:{x:552,y:697},color:green,thickness:1});y=674;}
 start();rows.forEach((r,i)=>{if(y<110)start();text(i+1,42,y);let size=11;while(font.widthOfTextAtSize(r.recipient_name,size)>390)size-=.5;text(r.recipient_name,80,y,size);text(r.guest_count,509,y);y-=25;});
 const total=rows.reduce((n,r)=>n+r.guest_count,0);if(y<110)start();page.drawLine({start:{x:42,y:y+7},end:{x:552,y:y+7},color:green,thickness:1});text('Total: '+total+' pessoas em '+rows.length+' convites',42,y-18,15);doc.getPages().forEach((p,i)=>p.drawText('Página '+(i+1)+' de '+doc.getPageCount(),{x:445,y:34,size:9,font,color:green}));
 const listName='Lista de convidados - Inharrime.pdf';await writeFile(new URL(listName,stage),await doc.save());files.push(listName);
 const xai=(await (await request('/api/admin/xai-xai/invitations')).json()).invitations;const ed=xai.find(r=>r.recipient_name==='Edmilson Marques');if(!ed)throw new Error('Convite de Edmilson não encontrado');const edBytes=new Uint8Array(await (await request('/api/admin/xai-xai/pdfs?id='+ed.id)).arrayBuffer());await PDFDocument.load(edBytes);const edName='Xai-Xai - Edmilson Marques.pdf';await writeFile(new URL(edName,stage),edBytes);files.push(edName);
 const known=new Set(rows.map(r=>normalizeKey(r.recipient_name)));known.add(normalizeKey('Agnécio Guambe'));for(const file of await readdir(folder)){if(/^\d+ - .*\.pdf$/i.test(file)&&known.has(normalizeKey(file.replace(/^\d+ - /,'').replace(/\.pdf$/i,''))))await unlink(folder+'/'+file);}
 for(const file of files)await writeFile(folder+'/'+file,await readFile(new URL(file,stage)));
 const final=await list();if(final.invitations.length!==rows.length||final.invitations.some(r=>!r.generated))throw new Error('A lista mudou durante o download');
 await writeFile(new URL('./inharrime-current-list.json',import.meta.url),JSON.stringify({rows:rows.map(r=>({name:r.recipient_name,people:r.guest_count})),total,invitations:rows.length},null,2));
 console.log(JSON.stringify({corrected:'Agracio Guambe',invitations:rows.length,people:total,files:files.length,folder}));
}finally{if(cookie)await request('/api/logout',{});}
