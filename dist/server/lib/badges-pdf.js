import { PDFDocument, rgb } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { badgeSummary } from '../shared/badges.js';

export async function createBadgesPdf({ template, symbol, fontBytes, badges, model, horizontalImage, loadPhoto }) {
  if (!['horizontal', 'vertical'].includes(model) || !badges.length) throw new Error('Modelo ou lista inválidos.');
  const source = await PDFDocument.load(template), doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const font = await doc.embedFont(fontBytes, { subset: true }), photo = await doc.embedPng(symbol);
  const portraits=new Map();
  for(const row of badges){if(row.photo_key){if(!loadPhoto)throw new Error('Fotografia indisponível.');const asset=await loadPhoto(row),bytes=new Uint8Array(asset.bytes);portraits.set(row.id,asset.type==='image/jpeg'?await doc.embedJpg(bytes):await doc.embedPng(bytes));}}
  function drawPortrait(page,row,box){const picture=portraits.get(row?.id)||photo,scale=Math.min(box.width/picture.width,box.height/picture.height),width=picture.width*scale,height=picture.height*scale;page.drawImage(picture,{x:box.x+(box.width-width)/2,y:box.y+(box.height-height)/2,width,height});}
  // The supplied horizontal sheet clips the card borders. Reimpose the matching
  // original PNG at its natural proportions so all six complete cards can be cut.
  if (model === 'horizontal' && horizontalImage) {
    const art=await doc.embedPng(horizontalImage),cream=rgb(.973,.969,.949),green=rgb(.09,.20,.14);
    for(let offset=0;offset<badges.length;offset+=6){
      const sheet=doc.addPage([841.89,595.28]);
      for(let slot=0;slot<6;slot++){
        const row=badges[offset+slot],card=doc.addPage([1536,1024]);card.drawImage(art,{x:0,y:0,width:1536,height:1024});
        const rect=(x,y,w,h,color)=>card.drawRectangle({x,y:1024-y-h,width:w,height:h,color});
        rect(588,429,786,94,cream);rect(744,638,442,65,green);
        drawPortrait(card,row,{x:187,y:1024-275-491,width:360,height:491});
        function label(value,x,y,w,h,color,size){
          if(!value)return;let lines=[value];
          if(font.widthOfTextAtSize(value,size)>w && value.includes(' ')){const words=value.split(/\s+/);let split=1,diff=Infinity;for(let i=1;i<words.length;i++){const d=Math.abs(font.widthOfTextAtSize(words.slice(0,i).join(' '),size)-font.widthOfTextAtSize(words.slice(i).join(' '),size));if(d<diff){diff=d;split=i;}}lines=[words.slice(0,split).join(' '),words.slice(split).join(' ')];}
          size=Math.min(size,h/(lines.length*1.35));const widest=Math.max(...lines.map(t=>font.widthOfTextAtSize(t,size)));if(widest>w)size*=w/widest;
          lines.forEach((text,i)=>card.drawText(text,{font,size,color,x:x+w/2-font.widthOfTextAtSize(text,size)/2,y:1024-y-(h-lines.length*size*1.3)/2-size-i*size*1.3}));
        }
        label(row?.name,592,431,776,88,green,51);label(row?.role.toUpperCase(),750,639,430,62,rgb(1,1,1),45);
        const embedded=await doc.embedPage(card,{left:68,bottom:106,right:1466,top:919});
        doc.removePage(doc.getPageCount()-1);
        const height=182,width=height*1398/813;
        sheet.drawPage(embedded,{x:(slot%2)*420.945+(420.945-width)/2,y:595.28-(Math.floor(slot/2)+1)*198.4267+(198.4267-height)/2,width,height});
      }
    }
    doc.setTitle('Crachás horizontais — Alírio e Engrácia');return doc.save();
  }
  const base = source.getPage(0), box = base.getCropBox();
  const [background] = await doc.embedPages([base], [{ left: box.x, bottom: box.y, right: box.x + box.width, top: box.y + box.height }]);
  const horizontal = model === 'horizontal', refW = horizontal ? 1685 : 1191, refH = horizontal ? 1191 : 1685;
  const sx = box.width / refW, sy = box.height / refH;
  const cream = rgb(.973, .969, .949), green = rgb(.09, .20, .14);
  const offsets = horizontal ? [[0,0],[849,12],[-6,401],[843,413],[-11,802],[837,814]] : [[0,0],[606,0],[0,852],[606,852]];
  const { perPage } = badgeSummary(badges.length, model);
  for (let offset = 0; offset < badges.length; offset += perPage) {
    const page = doc.addPage([box.width, box.height]); page.drawPage(background);
    offsets.forEach(([ox, oy], slot) => {
      const row = badges[offset + slot];
      const rect = (x,y,w,h,color=cream) => page.drawRectangle({ x:(x+ox)*sx,y:box.height-(y+oy+h)*sy,width:w*sx,height:h*sy,color });
      function text(value, x,y,w,h,size,color=green) {
        if (!value) return;
        let lines = [value], fs = size * sy;
        if (font.widthOfTextAtSize(value, fs) > w*sx && value.includes(' ')) {
          const words=value.split(/\s+/);let best=1,delta=Infinity;
          for(let i=1;i<words.length;i++){const d=Math.abs(font.widthOfTextAtSize(words.slice(0,i).join(' '),fs)-font.widthOfTextAtSize(words.slice(i).join(' '),fs));if(d<delta){best=i;delta=d;}}
          lines=[words.slice(0,best).join(' '),words.slice(best).join(' ')];
        }
        fs=Math.min(fs, h*sy/(lines.length*1.35));
        const widest=Math.max(...lines.map(l=>font.widthOfTextAtSize(l,fs))); if(widest>w*sx)fs*=w*sx/widest;
        const lineHeight=fs*1.3, top=box.height-(y+oy)*sy;
        lines.forEach((line,i)=>page.drawText(line,{font,size:fs,color,x:(x+ox+w/2)*sx-font.widthOfTextAtSize(line,fs)/2,y:top-(h*sy-lines.length*lineHeight)/2-fs-i*lineHeight}));
      }
      const p=horizontal?[99,81,197,269]:[163,183,260,335];
      drawPortrait(page,row,{x:(p[0]+ox)*sx,y:box.height-(p[1]+oy+p[3])*sy,width:p[2]*sx,height:p[3]*sy});
      if(horizontal){rect(320,164,430,53);rect(393,276,263,43,green);text(row?.name,324,165,422,50,32);text(row?.role.toUpperCase(),397,277,255,40,31,rgb(1,1,1));}
      else {rect(84,543,421,43);rect(198,625,193,42);text(row?.name,87,544,415,40,29);text(row?.role.toUpperCase(),202,625,185,40,31);}
    });
  }
  doc.setTitle(`Crachás ${model === 'horizontal' ? 'horizontais' : 'verticais'} — Alírio e Engrácia`);
  return doc.save();
}
