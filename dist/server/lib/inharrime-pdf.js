import { PDFDocument, rgb, pushGraphicsState, concatTransformationMatrix, drawObject, popGraphicsState } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import qrcode from 'qrcode-generator';
import { categoryPath } from '../shared/seating.js';

const green = rgb(0.15, 0.22, 0.12);
const cream = rgb(0.985, 0.977, 0.948);
const REF_W = 1191, REF_H = 1685;

export async function createInharrimePdf({ template, fontBytes, invitations, origin, single = false }) {
  const source = await PDFDocument.load(template);
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const font = await doc.embedFont(fontBytes, { subset: true });
  const frontSource = source.getPage(0), backSource = source.getPage(1);
  const width = frontSource.getWidth(), height = frontSource.getHeight();
  const sx = width / REF_W, sy = height / REF_H;
  const sourcePages = [frontSource, backSource];
  const [front, back] = await doc.embedPages(sourcePages, sourcePages.map(page => {
    const box = page.getCropBox();
    return { left: box.x, bottom: box.y, right: box.x + box.width, top: box.y + box.height };
  }));

  function fill(page, row, column, line, side) {
    const ox = column * width / 2, oy = line * height / 2;
    const point = (x, y) => ({ x: ox + x * sx, y: height - oy - y * sy });
    const rectangle = (x, y, w, h, color = cream) => page.drawRectangle({ ...point(x, y + h), width: w * sx, height: h * sy, color });
    function text(value, x, y, maxWidth, size = 20) {
      let fontSize = size * sy;
      const max = maxWidth * sx;
      while (font.widthOfTextAtSize(value, fontSize) > max && fontSize > 7 * sy) fontSize -= 0.25;
      const at = point(x, y);
      page.drawText(value, { x: at.x - font.widthOfTextAtSize(value, fontSize) / 2, y: at.y, font, size: fontSize, color: green });
    }
    if (side === 'back') {
      text(row.recipient_name, 298, 259, 510, 20);
      return;
    }
    text(row.recipient_name, 327, 545, 330, 20);
    rectangle(184, 559, 260, 35);
    text(`Convite para ${row.guest_count} ${row.guest_count === 1 ? 'pessoa' : 'pessoas'}`, 314, 582, 255, 22);
    rectangle(69, 630, 105, 139);
    const qr = qrcode(0, 'M');
    qr.addData(`${origin}${categoryPath(row.category)}`); qr.make();
    const count = qr.getModuleCount(), size = 96, extent = count + 8;
    // One compressed vector object per QR keeps large guest lists within Worker memory.
    const commands = [`1 1 1 rg 0 0 ${extent} ${extent} re f 0 0 0 rg`];
    for (let r = 0; r < count; r++) for (let c = 0; c < count; c++) {
      if (qr.isDark(r, c)) commands.push(`${c + 4} ${extent - r - 5} 1 1 re f`);
    }
    const form = doc.context.flateStream(commands.join('\n'), { Type: 'XObject', Subtype: 'Form', BBox: [0, 0, extent, extent], Resources: {} });
    const key = page.node.newXObject('QR', doc.context.register(form));
    const at = point(72, 633 + size);
    page.pushOperators(pushGraphicsState(), concatTransformationMatrix(size * sx / extent, 0, 0, size * sy / extent, at.x, at.y), drawObject(key), popGraphicsState());
    text(row.seats?.[0]?.code || '', 120, 756, 100, 22);
  }

  for (let offset = 0; offset < invitations.length; offset += 4) {
    const frontPage = doc.addPage([width, height]); frontPage.drawPage(front, { width, height });
    const backPage = doc.addPage([width, height]); backPage.drawPage(back, { width, height });
    invitations.slice(offset, offset + 4).forEach((row, slot) => {
      fill(frontPage, row, slot % 2, Math.floor(slot / 2), 'front');
      // Long-edge duplex printing mirrors the columns on the reverse.
      fill(backPage, row, 1 - slot % 2, Math.floor(slot / 2), 'back');
    });
  }
  doc.setTitle(single ? `Convite - ${invitations[0].recipient_name}` : 'Convites de Inharrime - Alírio e Engrácia');
  doc.setAuthor('Alírio e Engrácia');
  if (single) {
    await doc.flush();
    const individual = await PDFDocument.create();
    const [face] = await individual.embedPages([doc.getPage(0)], [{ left: 0, bottom: height / 2, right: width / 2, top: height }]);
    const [reverse] = await individual.embedPages([doc.getPage(1)], [{ left: width / 2, bottom: height / 2, right: width, top: height }]);
    for (const page of [face, reverse]) individual.addPage([width / 2, height / 2]).drawPage(page);
    individual.setTitle(`Convite - ${invitations[0].recipient_name}`);
    return individual.save();
  }
  return doc.save();
}
