import {writeFile} from 'node:fs/promises';
import JSZip from 'jszip';
import {PDFDocument} from 'pdf-lib';
import {readyBadgePdfs,generateBadgePdfs,badgePdfArchive,fetchWithDeadline} from '../shared/badge-pdfs.js';
const origin='https://casamento.purruma.com';let cookie;
async function request(path,body){const headers={};if(cookie)headers.Cookie=cookie;if(body)headers['Content-Type']='application/json';const r=await fetchWithDeadline(origin+path,{method:body?'POST':'GET',headers,body:body?JSON.stringify(body):undefined});if(!r.ok)throw new Error(path+' '+r.status+' '+(await r.text()).slice(0,200));return r;}
try{
 const login=await request('/api/login',{username:'alirio',password:process.env.INVITE_ADMIN_PASSWORD});cookie=login.headers.get('set-cookie').split(';')[0];
 const html=await (await request('/admin/crachas')).text();if(!html.includes('id="download-all"')||html.includes('id="model"'))throw new Error('Nova interface indisponível');
 let data=await (await request('/api/admin/badges')).json();const ids=data.badges.map(b=>b.id);
 if(!readyBadgePdfs(data.runs))await generateBadgePdfs(ids,async(model,ids)=>(await request('/api/admin/badges/generate',{model,ids})).json(),model=>console.log('A actualizar '+model));
 data=await (await request('/api/admin/badges')).json();
 const bytes=await badgePdfArchive(data.runs,async run=>(await request('/api/admin/badges/pdf?run='+run.id)).arrayBuffer());
 const zip=await JSZip.loadAsync(bytes);const files=[];
 for(const [name,entry] of Object.entries(zip.files)){const pdf=await entry.async('uint8array');const pages=(await PDFDocument.load(pdf)).getPageCount();const model=name.includes('horizontal')?'horizontal':'vertical';const expected=Math.ceil(ids.length/(model==='horizontal'?6:4));if(pages!==expected)throw new Error('Número de páginas inesperado');files.push({name,pages});}
 await writeFile(new URL('../output/pdf/crachas-pdfs.zip',import.meta.url),bytes);
 console.log(JSON.stringify({badges:data.badges.length,current:!!readyBadgePdfs(data.runs),files,bytes:bytes.length}));
}finally{if(cookie)await request('/api/logout',{});}
