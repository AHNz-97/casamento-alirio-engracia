import { PDFDocument, rgb, PDFName, PDFString } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';

export async function createDigitalPdf({ template, fontBytes, invitation, origin }) {
  const doc = await PDFDocument.create(); doc.registerFontkit(fontkit);
  const font = await doc.embedFont(fontBytes, { subset: true });
  const image = await doc.embedPng(template);
  const width = 419.53, height = width * image.height / image.width;
  const page = doc.addPage([width, height]); page.drawImage(image, { x: 0, y: 0, width, height });
  const sx = width / image.width, sy = height / image.height;
  const box = (x, y, w, h) => page.drawRectangle({ x: x * sx, y: height - (y + h) * sy, width: w * sx, height: h * sy, color: rgb(0.98, 0.973, 0.949) });
  const text = (value, center, baseline, maxWidth, size) => {
    let scaled = size * sx;
    while (font.widthOfTextAtSize(value, scaled) > maxWidth * sx && scaled > 7) scaled -= 0.25;
    page.drawText(value, { x: center * sx - font.widthOfTextAtSize(value, scaled) / 2, y: height - baseline * sy, size: scaled, font, color: rgb(0.09, 0.235, 0.17) });
  };
  box(260, 976, 424, 70); text(invitation.recipient_name, image.width / 2, 1022, 405, 40);
  box(299, 1588, 358, 47); text(`Convite válido para ${invitation.guest_count} ${invitation.guest_count === 1 ? 'pessoa' : 'pessoas'}`, image.width / 2, 1620, 355, 25);
  if(invitation.seats?.length){box(310,1637,330,32);text(`Código: ${invitation.seats[0].code}`,image.width/2,1662,320,25);}
  const url = `${origin}/convite/${invitation.public_token}`;
  const annotation = doc.context.obj({ Type: 'Annot', Subtype: 'Link', Rect: [220 * sx, height - 1570 * sy, 730 * sx, height - 1380 * sy], Border: [0, 0, 0], A: { Type: 'Action', S: 'URI', URI: PDFString.of(url) } });
  page.node.set(PDFName.of('Annots'), doc.context.obj([doc.context.register(annotation)]));
  doc.setTitle(`Convite digital - ${invitation.recipient_name}`); doc.setAuthor('Alírio e Engrácia');
  return doc.save();
}
