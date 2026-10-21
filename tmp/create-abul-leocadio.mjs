import {readFile,writeFile} from 'node:fs/promises';
import {PDFDocument,PDFName,PDFString} from 'pdf-lib';
import {createDigitalPdf} from '../lib/digital-pdf.js';
import {fetchWithDeadline} from '../shared/badge-pdfs.js';
import {normalizeKey} from '../shared/inharrime.js';
const folder='C:/Users/anham/Desktop/Screepts/Convites Inharrime - Colegas da escola - 2026-09-30';
const origin='https://casamento.purruma.com';let cookie;
if(!process.env.INVITE_CONTACT)throw Error('Missing contact');
async function request(path,body,method=body?'POST':'GET',type='application/json'){
 const headers={};if(cookie)headers.Cookie=cookie;if(body)headers['Content-Type']=type;
 const r=await fetchWithDeadline(origin+path,{method,headers,body:body?(type==='application/json'?JSON.stringify(body):body):undefined},120000);
 if(!r.ok)throw Error(path+' '+r.status+' '+(await r.text()).slice(0,250));return r;
}
const guests=[{name:'Abul Razak',count:2},{name:'Leocadio Paulo',count:1}];
const receipt=[];
try{
 const login=await request('/api/login',{username:'alirio',password:process.env.INVITE_ADMIN_PASSWORD});cookie=login.headers.get('set-cookie').split(';')[0];
 for(const guest of guests){
  const get=async()=>{const rows=(await(await request('/api/admin/xai-xai/invitations')).json()).invitations;const matches=rows.filter(r=>normalizeKey(r.recipient_name)===normalizeKey(guest.name));if(matches.length>1)throw Error('Duplicate '+guest.name);return matches[0];};
  let row=await get();
  if(!row){await request('/api/admin/xai-xai/invitations',{recipientName:guest.name,guestLimit:guest.count,category:'Amigo',guestOf:'Noivo',contactPhone:process.env.INVITE_CONTACT,invitationType:guest.count===1?'individual':'family',notes:process.env.INVITE_CONTACT==='840000000'?'Contacto fictício autorizado pelo administrador.':''});row=await get();}
  if(row&&(row.guest_limit!==guest.count||row.category!=='Amigo'||row.contact_phone!==process.env.INVITE_CONTACT)){
   await request('/api/admin/xai-xai/invitations',{id:row.id,recipientName:guest.name,guestLimit:guest.count,category:'Amigo',guestOf:row.guest_of||'Noivo',contactPhone:process.env.INVITE_CONTACT,invitationType:guest.count===1?'individual':'family',notes:row.notes||''},'PUT');row=await get();
  }
  if(!row||row.guest_limit!==guest.count||row.category!=='Amigo')throw Error('Invitation details mismatch '+guest.name);
  if(!row.pdf_object_key||row.pdf_needs_update){
   const draft=await createDigitalPdf({template:await readFile('assets/images/convite-base.png'),fontBytes:await readFile('assets/fonts/noto-serif-latin-400-normal.woff'),invitation:{recipient_name:row.recipient_name,guest_count:guest.count,public_token:row.public_token},origin});
   const pdf=await PDFDocument.load(draft);pdf.getPage(0).node.Annots().lookup(0).lookup(PDFName.of('A')).set(PDFName.of('URI'),PDFString.of(origin+'/xai-xai?invite='+row.public_token));
   await request('/api/admin/xai-xai/pdfs?id='+row.id,await pdf.save(),'POST','application/pdf');
  }
  const bytes=new Uint8Array(await(await request('/api/admin/xai-xai/pdfs?id='+row.id)).arrayBuffer());
  const pdf=await PDFDocument.load(bytes);if(pdf.getPageCount()!==1)throw Error('PDF pages');
  const url=pdf.getPage(0).node.Annots().lookup(0).lookup(PDFName.of('A')).lookup(PDFName.of('URI')).decodeText();
  if(url!==origin+'/xai-xai?invite='+row.public_token)throw Error('Incorrect PDF link');
  const file=folder+'/Xai-Xai - '+guest.name+'.pdf';await writeFile(file,bytes);
  receipt.push({name:guest.name,count:guest.count,id:row.id,file});await writeFile('tmp/abul-leocadio-receipt.json',JSON.stringify(receipt,null,2));
  console.log(guest.name+': '+guest.count+' pessoa(s), PDF guardado.');
 }
}finally{if(cookie)await request('/api/logout',{});}

