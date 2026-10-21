import {readFile,writeFile} from 'node:fs/promises';
import {PDFDocument,PDFName,PDFString,rgb} from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import {createDigitalPdf} from '../lib/digital-pdf.js';
import {fetchWithDeadline} from '../shared/badge-pdfs.js';
import {categories,normalizeKey} from '../shared/inharrime.js';
const folder='C:/Users/anham/Desktop/Screepts/Convites Inharrime - Colegas da escola - 2026-09-30';
const receiptPath=new URL('./two-more-receipt.json',import.meta.url);let receipt;try{receipt=JSON.parse(await readFile(receiptPath,'utf8'));}catch{receipt={requestId:crypto.randomUUID()};}const persist=()=>writeFile(receiptPath,JSON.stringify(receipt,null,2));await persist();
const origin='https://casamento.purruma.com';let cookie;
async function request(path,body,method=body?'POST':'GET',type='application/json'){const headers={};if(cookie)headers.Cookie=cookie;if(body)headers['Content-Type']=type;const r=await fetchWithDeadline(origin+path,{method,headers,body:body?(type==='application/json'?JSON.stringify(body):body):undefined},120000);if(!r.ok)throw new Error(path+' '+r.status+' '+(await r.text()).slice(0,300));return r;}
function find(rows,name,key){const found=rows.filter(r=>normalizeKey(r[key])===normalizeKey(name));if(found.length>1)throw new Error('Nome duplicado: '+name);return found[0];}
const fontBytes=await readFile(new URL('../assets/fonts/noto-serif-latin-400-normal.woff',import.meta.url));
try{
 const login=await request('/api/login',{username:'alirio',password:process.env.INVITE_ADMIN_PASSWORD});cookie=login.headers.get('set-cookie').split(';')[0];
 let xai=(await (await request('/api/admin/xai-xai/invitations')).json()).invitations;let ed=find(xai,'Edmilson Marques','recipient_name');
 if(!ed){const result=await (await request('/api/admin/xai-xai/invitations',{recipientName:'Edmilson Marques',guestLimit:2,category:'Amigo do noivo',guestOf:'Noivo',contactPhone:'840000000',invitationType:'family',notes:'Contacto fictício, preenchido a pedido do administrador.'})).json();receipt.edmilsonId=result.id;await persist();xai=(await (await request('/api/admin/xai-xai/invitations')).json()).invitations;ed=find(xai,'Edmilson Marques','recipient_name');}
 if(ed.guest_limit!==2||ed.category!=='Amigo do noivo')throw new Error('Edmilson existente com dados diferentes');
 if(!ed.pdf_object_key||ed.pdf_needs_update){
  const draft=await createDigitalPdf({template:await readFile(new URL('../assets/images/convite-base.png',import.meta.url)),fontBytes,invitation:{recipient_name:ed.recipient_name,guest_count:2,public_token:ed.public_token},origin});
  const doc=await PDFDocument.load(draft);const link=doc.getPage(0).node.Annots().lookup(0);link.lookup(PDFName.of('A')).set(PDFName.of('URI'),PDFString.of(origin+'/xai-xai?invite='+ed.public_token));
  await request('/api/admin/xai-xai/pdfs?id='+ed.id,await doc.save(),'POST','application/pdf');
 }
 const edPdf=await (await request('/api/admin/xai-xai/pdfs?id='+ed.id)).arrayBuffer();await writeFile(folder+'/Xai-Xai - Edmilson Marques.pdf',new Uint8Array(edPdf));console.log('Edmilson Marques: convite Xai-Xai guardado, 2 pessoas.');
 let data=await (await request('/api/admin/inharrime')).json();let eu=find(data.invitations,'Eugenio Manhique','recipient_name');
 if(!eu){await request('/api/admin/inharrime',{requestId:receipt.requestId,invitations:[{recipientName:'Eugenio Manhique',guestCount:1,category:categories[6],contactPhone:'842575261'}]});data=await (await request('/api/admin/inharrime')).json();eu=find(data.invitations,'Eugenio Manhique','recipient_name');}
 if(eu.guest_count!==1)throw new Error('Eugenio existente com quantidade diferente');
 if(!eu.generated)await request('/api/admin/inharrime/generate',{ids:data.invitations.map(r=>r.id)});
 const euPdf=await (await request('/api/admin/inharrime/pdf?id='+eu.id+'&download=1')).arrayBuffer();await writeFile(folder+'/19 - Eugenio Manhique.pdf',new Uint8Array(euPdf));console.log('Eugenio Manhique: convite Inharrime guardado, 1 pessoa.');
 data=await (await request('/api/admin/inharrime')).json();
 const rows=data.invitations;const total=rows.reduce((sum,r)=>sum+r.guest_count,0);const doc=await PDFDocument.create();doc.registerFontkit(fontkit);const font=await doc.embedFont(fontBytes,{subset:true});const green=rgb(.09,.23,.17);let page,y;
 function text(s,x,y,size=11){page.drawText(String(s),{x,y,size,font,color:green});}
 function start(){page=doc.addPage([595.28,841.89]);text('Convidados de Inharrime',42,790,22);text('Casamento de Alírio e Engrácia | 4 de outubro de 2026',42,765,11);text('Lista completa do painel · 30 de setembro de 2026',42,743,10);text('N.º',42,709);text('Nome do convidado',80,709);text('Pessoas',490,709);page.drawLine({start:{x:42,y:697},end:{x:552,y:697},color:green,thickness:1});y=674;}
 start();rows.forEach((r,i)=>{if(y<110)start();text(i+1,42,y);let size=11;while(font.widthOfTextAtSize(r.recipient_name,size)>390)size-=.5;text(r.recipient_name,80,y,size);text(r.guest_count,509,y);y-=25;});
 if(y<110)start();page.drawLine({start:{x:42,y:y+7},end:{x:552,y:y+7},color:green,thickness:1});text('Total: '+total+' pessoas em '+rows.length+' convites',42,y-18,15);
 doc.getPages().forEach((p,i)=>p.drawText('Página '+(i+1)+' de '+doc.getPageCount(),{x:445,y:34,size:9,font,color:green}));
 await writeFile(folder+'/Lista de convidados - Inharrime.pdf',await doc.save());
 receipt.completedAt=new Date().toISOString();receipt.totalPeople=total;receipt.invitations=rows.length;receipt.names=rows.map(r=>({name:r.recipient_name,people:r.guest_count}));await persist();console.log(JSON.stringify({totalPeople:total,invitations:rows.length,listPages:doc.getPageCount(),folder}));
}finally{if(cookie)await request('/api/logout',{});}
