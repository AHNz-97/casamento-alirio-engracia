import { clean, ensureSchema } from "../_db.js";
import { requireAdmin } from "./_access.js";

const maximumPdfBytes = 8 * 1024 * 1024;

function noStoreJson(payload, init = {}) {
  const headers = new Headers(init.headers);
  headers.set("Cache-Control", "no-store");
  return Response.json(payload, { ...init, headers });
}

async function authorize(request, env) {
  const access = await requireAdmin(request, env);
  if (!access.ok) return { response: access.response };
  if (!env.DB || !env.PDFS) {
    return {
      response: noStoreJson({ error: "O arquivo de PDFs ainda não foi configurado." }, { status: 503 }),
    };
  }
  return { email: access.email || "administrador" };
}

function invitationIdFrom(request) {
  return clean(new URL(request.url).searchParams.get("id"), 80);
}

function asciiFilename(value) {
  const cleaned = String(value ?? "convite.pdf")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
  return cleaned.toLowerCase().endsWith(".pdf") ? cleaned : `${cleaned || "convite"}.pdf`;
}

async function findInvitation(db, id) {
  return db.prepare(
    `SELECT id, recipient_name, pdf_object_key, pdf_filename, pdf_needs_update
     FROM invitations
     WHERE id = ?`,
  ).bind(id).first();
}

export async function onRequestGet({ request, env }) {
  const admin = await authorize(request, env);
  if (admin.response) return admin.response;
  const id = invitationIdFrom(request);
  if (!id) return noStoreJson({ error: "Convite não identificado." }, { status: 400 });

  await ensureSchema(env.DB);
  const invitation = await findInvitation(env.DB, id);
  if (!invitation?.pdf_object_key) {
    return noStoreJson({ error: "Este convite ainda não tem um PDF guardado." }, { status: 404 });
  }

  const object = await env.PDFS.get(invitation.pdf_object_key);
  if (!object) {
    return noStoreJson({ error: "O PDF guardado não foi encontrado." }, { status: 404 });
  }

  const filename = asciiFilename(invitation.pdf_filename || `convite-${invitation.recipient_name}.pdf`);
  const headers = new Headers();
  headers.set("Content-Type", "application/pdf");
  headers.set("Content-Disposition", `attachment; filename="${filename}"`);
  headers.set("Cache-Control", "private, no-store");
  if (object.size) headers.set("Content-Length", String(object.size));
  if (object.httpEtag) headers.set("ETag", object.httpEtag);
  return new Response(object.body, { headers });
}

export async function onRequestPost({ request, env }) {
  const admin = await authorize(request, env);
  if (admin.response) return admin.response;
  const id = invitationIdFrom(request);
  if (!id) return noStoreJson({ error: "Convite não identificado." }, { status: 400 });
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/pdf")) {
    return noStoreJson({ error: "O ficheiro enviado não é um PDF." }, { status: 415 });
  }

  const declaredLength = Number.parseInt(request.headers.get("content-length") || "0", 10);
  if (declaredLength > maximumPdfBytes) {
    return noStoreJson({ error: "O PDF ultrapassa o limite de 8 MB." }, { status: 413 });
  }

  await ensureSchema(env.DB);
  const invitation = await findInvitation(env.DB, id);
  if (!invitation) return noStoreJson({ error: "Convite não encontrado." }, { status: 404 });
  if (invitation.pdf_object_key && Number(invitation.pdf_needs_update ?? 0) === 0) {
    return noStoreJson({ error: "Este PDF já está guardado. Use o botão de download." }, { status: 409 });
  }

  const bytes = await request.arrayBuffer();
  if (bytes.byteLength < 5 || bytes.byteLength > maximumPdfBytes) {
    return noStoreJson({ error: "O tamanho do PDF é inválido." }, { status: 413 });
  }
  const signature = new Uint8Array(bytes, 0, 5);
  const expectedSignature = [37, 80, 68, 70, 45];
  if (!expectedSignature.every((value, index) => signature[index] === value)) {
    return noStoreJson({ error: "O conteúdo enviado não é um PDF válido." }, { status: 400 });
  }

  const objectKey = `invitations/${id}/convite.pdf`;
  const filename = asciiFilename(`convite-${invitation.recipient_name}.pdf`);
  const now = new Date().toISOString();
  await env.PDFS.put(objectKey, bytes, {
    httpMetadata: { contentType: "application/pdf" },
    customMetadata: { invitationId: id, generatedBy: admin.email },
  });
  await env.DB.prepare(
    `UPDATE invitations
     SET pdf_object_key = ?, pdf_filename = ?, pdf_generated_at = ?, pdf_generated_by = ?,
         pdf_needs_update = 0, sent_at = COALESCE(sent_at, ?), updated_at = ?
     WHERE id = ?`,
  ).bind(objectKey, filename, now, admin.email, now, now, id).run();

  return noStoreJson({ ok: true, filename, generatedAt: now }, { status: 201 });
}
