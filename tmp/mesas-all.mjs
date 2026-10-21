import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {PDFDocument,rgb,degrees} from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import qrcode from 'qrcode-generator';
const root='C:/Users/anham/Desktop/Screepts/Fotos/A4 sem categorias';
const dest=root+'/Mesas finais';await mkdir(dest+'/Individuais',{recursive:true});
const mm=72/25.4,W=210*mm,H=297*mm,tab=30*mm,face=118.5*mm;
const cream=rgb(.985,.970,.935),green=rgb(.12,.22,.15),gold=rgb(.66,.46,.16),grey=rgb(.48,.48,.45);
const fontBytes=await readFile('assets/fonts/noto-serif-latin-400-normal.woff');
const groups=[
 {numbers:[1,2,3,4,5],category:1,lines:['O amor floresce','onde as raízes','são família.']},
 {numbers:[6,7],category:2,lines:['O carinho dos tios','é luz que aquece','o nosso caminho.']},
 {numbers:[8,9,10],category:3,lines:['De mãos dadas,','os irmãos tornam','a vida mais bonita.']},
 {numbers:[11,12],category:4,lines:['Caminhos cruzados,','amizades que ficam','para toda a vida.']},
 {numbers:[13,14],category:5,lines:['Uma porta aberta,','um vizinho perto,','um carinho sincero.']},
 {numbers:[15,16],category:6,lines:['Que a fé nos una','e a paz encontre','morada no amor.']},
 {numbers:[17,18],category:7,lines:['Juntos aprendemos,','construímos sonhos','e celebramos a vida.']},
 {numbers:[19,20,21],category:8,lines:['Cada gesto conta','na obra que fazemos','juntos pela vida.']},
 {numbers:[22],category:9,lines:['Uma comunidade','cresce unida,','floresce no cuidado.']},
 {numbers:[23],category:10,lines:['Servir com respeito,','construir confiança,','celebrar a união.']},
 {numbers:[24,25],category:11,lines:['Laços de carinho,','bênçãos que abraçam','o nosso amor.']},
];
const rows=groups.flatMap(g=>g.numbers.map(number=>({number,title:'Mesa '+number,image:`Mesa ${String(number).padStart(2,'0')}.png`,category:g.category,lines:g.lines})));
if(!process.argv.includes('--numbered-only'))rows.push({number:26,title:'Mesa dos Noivos',image:'Mesa dos Noivos.png',category:process.argv.includes('--noivos-no-qr')?null:1,lines:['Que o nosso amor','floresça em cada','novo amanhecer.']});
const all=await PDFDocument.create();
for(const row of rows){
 const doc=await PDFDocument.create();doc.registerFontkit(fontkit);const font=await doc.embedFont(fontBytes,{subset:true});
 const page=doc.addPage([W,H]);page.drawRectangle({x:0,y:tab,width:W,height:2*face,color:cream});
 const image=await doc.embedPng(await readFile(root+'/Imagens/'+row.image));
 const scale=Math.min((W-8*mm)/image.width,(face-4*mm)/image.height),iw=image.width*scale,ih=image.height*scale;
 page.drawImage(image,{x:(W+iw)/2,y:tab+face+(face+ih)/2,width:iw,height:ih,rotate:degrees(180)});
 const center=(s,y,size,color=green)=>page.drawText(s,{x:(W-font.widthOfTextAtSize(s,size))/2,y,size,font,color});
 center(row.title,tab+face-23*mm,18,gold);
 page.drawLine({start:{x:W/2-25*mm,y:tab+face-31*mm},end:{x:W/2+25*mm,y:tab+face-31*mm},thickness:.8,color:gold});
 let size=32;while(row.lines.some(s=>font.widthOfTextAtSize(s,size)>170*mm))size-=.5;
 row.lines.forEach((s,i)=>center(s,tab+face-51*mm-i*15*mm,size));
 if(row.category){
  const link='https://casamento.purruma.com/mensagem/categoria/'+row.category;
  const qr=qrcode(0,'M');qr.addData(link);qr.make();
  const side=28*mm,count=qr.getModuleCount(),cell=side/(count+8),qx=8*mm,qy=tab+10*mm;
  page.drawRectangle({x:qx,y:qy,width:side,height:side,color:rgb(1,1,1)});
  for(let r=0;r<count;r++)for(let c=0;c<count;c++)if(qr.isDark(r,c))page.drawRectangle({x:qx+(c+4)*cell,y:qy+side-(r+5)*cell,width:cell+.01,height:cell+.01,color:rgb(0,0,0)});
  const label=link;page.drawText(label,{x:qx,y:tab+6*mm,size:7,font,color:grey});
  page.node.addAnnot(doc.context.register(doc.context.obj({Type:'Annot',Subtype:'Link',Rect:[qx,tab+5*mm,qx+Math.max(side,font.widthOfTextAtSize(label,7)),qy+side],Border:[0,0,0],A:{Type:'Action',S:'URI',URI:link}})));
 }
 const credit='by purruma.com';page.drawText(credit,{x:W-8*mm-font.widthOfTextAtSize(credit,7),y:tab+6*mm,size:7,font,color:grey});
 for(const y of [tab,H/2,H-tab])page.drawLine({start:{x:4*mm,y},end:{x:W-4*mm,y},thickness:.5,dashArray:[3,4],color:grey});
 center('ABA DA BASE - dobrar para dentro',tab/2+4,9,grey);center('Sobrepor as abas e fixar com fita ou cola.',tab/2-11,8,grey);center('ABA DA BASE - dobrar para dentro',H-tab/2,9,grey);
 doc.setTitle(row.title+' - Expositor triangular A4');
 const bytes=await doc.save();await writeFile(dest+'/Individuais/'+(row.number===26?'Mesa dos Noivos':`Mesa ${String(row.number).padStart(2,'0')}`)+'.pdf',bytes);
 const checked=await PDFDocument.load(bytes);if(checked.getPageCount()!==1)throw new Error('Page count');
 all.addPage((await all.copyPages(checked,[0]))[0]);console.log(row.title+' - fonte '+size+' pt');
}
all.setTitle('Identificadores de mesas - A4 para dobrar');
await writeFile(dest+'/Todas as mesas - A4 com links completos.pdf',await all.save());
await writeFile(dest+'/Mensagens e categorias.json',JSON.stringify(rows,null,2));
console.log(JSON.stringify({pages:all.getPageCount(),dest}));
