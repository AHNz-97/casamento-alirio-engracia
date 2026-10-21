(function exposeWeddingPdf() {
  const encoder = new TextEncoder();

  function encode(value) {
    return encoder.encode(value);
  }

  function concatenate(chunks) {
    const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const result = new Uint8Array(total);
    let offset = 0;
    chunks.forEach((chunk) => {
      result.set(chunk, offset);
      offset += chunk.length;
    });
    return result;
  }

  function escapePdfString(value) {
    return String(value).replaceAll("\\", "\\\\").replaceAll("(", "\\(").replaceAll(")", "\\)");
  }

  function fitText(context, text, maximumWidth, maximumSize, minimumSize) {
    let size = maximumSize;
    while (size > minimumSize) {
      context.font = `italic 600 ${size}px "Cormorant Garamond", Georgia, serif`;
      if (context.measureText(text).width <= maximumWidth) break;
      size -= 2;
    }
    return size;
  }

  function canvasBlob(canvas, type, quality) {
    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error("Não foi possível preparar a imagem do convite."));
      }, type, quality);
    });
  }

  function loadImageElement(url) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("Não foi possível abrir a imagem-base do convite."));
      image.src = url;
    });
  }

  async function loadImage(url) {
    if (window.location.protocol === "file:") return loadImageElement(url);
    const response = await fetch(url, { cache: "force-cache" });
    if (!response.ok) throw new Error("Não foi possível carregar a imagem-base do convite.");
    const blob = await response.blob();
    if ("createImageBitmap" in window) return createImageBitmap(blob);

    const objectUrl = URL.createObjectURL(blob);
    try {
      return await loadImageElement(objectUrl);
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  }

  function buildPdf(jpegBytes, imageWidth, imageHeight, linkUrl) {
    const pageWidth = 419.53;
    const pageHeight = 595.28;
    const linkX = 220;
    const linkY = 1380;
    const linkWidth = 510;
    const linkHeight = 190;
    const annotation = {
      left: (linkX / imageWidth) * pageWidth,
      bottom: ((imageHeight - linkY - linkHeight) / imageHeight) * pageHeight,
      right: ((linkX + linkWidth) / imageWidth) * pageWidth,
      top: ((imageHeight - linkY) / imageHeight) * pageHeight,
    };
    const content = `q\n${pageWidth.toFixed(2)} 0 0 ${pageHeight.toFixed(2)} 0 0 cm\n/Im0 Do\nQ\n`;
    const objects = [
      null,
      encode("<< /Type /Catalog /Pages 2 0 R >>"),
      encode("<< /Type /Pages /Kids [3 0 R] /Count 1 >>"),
      encode(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth.toFixed(2)} ${pageHeight.toFixed(2)}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R /Annots [6 0 R] >>`),
      [
        encode(`<< /Type /XObject /Subtype /Image /Width ${imageWidth} /Height ${imageHeight} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpegBytes.length} >>\nstream\n`),
        jpegBytes,
        encode("\nendstream"),
      ],
      encode(`<< /Length ${encode(content).length} >>\nstream\n${content}endstream`),
      encode(`<< /Type /Annot /Subtype /Link /Rect [${annotation.left.toFixed(2)} ${annotation.bottom.toFixed(2)} ${annotation.right.toFixed(2)} ${annotation.top.toFixed(2)}] /Border [0 0 0] /A << /S /URI /URI (${escapePdfString(linkUrl)}) >> >>`),
    ];

    const chunks = [encode("%PDF-1.7\n%âãÏÓ\n")];
    const offsets = new Array(objects.length).fill(0);
    let length = chunks[0].length;

    for (let number = 1; number < objects.length; number += 1) {
      offsets[number] = length;
      const beginning = encode(`${number} 0 obj\n`);
      const body = Array.isArray(objects[number]) ? objects[number] : [objects[number]];
      const ending = encode("\nendobj\n");
      chunks.push(beginning, ...body, ending);
      length += beginning.length + body.reduce((sum, chunk) => sum + chunk.length, 0) + ending.length;
    }

    const xrefOffset = length;
    const xrefRows = ["xref", `0 ${objects.length}`, "0000000000 65535 f "];
    for (let number = 1; number < objects.length; number += 1) {
      xrefRows.push(`${String(offsets[number]).padStart(10, "0")} 00000 n `);
    }
    chunks.push(encode(`${xrefRows.join("\n")}\ntrailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`));
    return new Blob([concatenate(chunks)], { type: "application/pdf" });
  }

  async function createInvitationPdf({ baseImageUrl, recipientName, guestLimit, invitationUrl }) {
    if (document.fonts?.ready) await document.fonts.ready;
    const image = await loadImage(baseImageUrl);
    const canvas = document.createElement("canvas");
    canvas.width = image.width;
    canvas.height = image.height;
    const context = canvas.getContext("2d", { alpha: false });
    context.drawImage(image, 0, 0);

    context.fillStyle = "#faf8f2";
    context.fillRect(260, 976, 424, 70);
    const fontSize = fitText(context, recipientName, 400, 48, 25);
    context.font = `italic 600 ${fontSize}px "Cormorant Garamond", Georgia, serif`;
    context.fillStyle = "#173c2b";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(recipientName, image.width / 2, 1010, 400);

    context.fillStyle = "#faf8f2";
    context.fillRect(502, 1606, 57, 31);
    context.font = '600 26px "Cormorant Garamond", Georgia, serif';
    context.fillStyle = "#173c2b";
    context.fillText(String(guestLimit), 530, 1622, 48);

    const jpegBlob = await canvasBlob(canvas, "image/jpeg", 0.92);
    const jpegBytes = new Uint8Array(await jpegBlob.arrayBuffer());
    return buildPdf(jpegBytes, canvas.width, canvas.height, invitationUrl);
  }

  window.WeddingPdf = { createInvitationPdf };
}());
