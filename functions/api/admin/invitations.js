import { clean, ensureSchema } from "../_db.js";
import { requireAdmin } from "./_access.js";

const invitationTypes = new Set(["individual", "family", "collective"]);
const invitationStatuses = new Set(["sent", "confirmed", "absent", "inflation"]);

function noStoreJson(payload, init = {}) {
  const headers = new Headers(init.headers);
  headers.set("Cache-Control", "no-store");
  return Response.json(payload, { ...init, headers });
}

function normalizePhone(value) {
  let digits = String(value ?? "").replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.length === 10 && digits.startsWith("0")) digits = `258${digits.slice(1)}`;
  if (digits.length === 9 && digits.startsWith("8")) digits = `258${digits}`;
  return digits;
}

function makePublicToken() {
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);
  const binary = String.fromCharCode(...bytes);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function validateInvitation(body) {
  const invitation = {
    id: clean(body.id, 80),
    recipientName: clean(body.recipientName, 120),
    contactPhone: clean(body.contactPhone, 30),
    category: clean(body.category, 60),
    guestOf: clean(body.guestOf, 80),
    invitationType: clean(body.invitationType, 20),
    guestLimit: Number.parseInt(body.guestLimit, 10),
    notes: clean(body.notes, 500),
  };

  if (!invitation.recipientName || !invitation.contactPhone || !invitation.category || !invitation.guestOf) {
    return { error: "Preencha o nome, o contacto, a categoria e o campo convidado de." };
  }
  if (!invitationTypes.has(invitation.invitationType)) {
    return { error: "Escolha um tipo de convite válido." };
  }
  if (invitation.invitationType === "individual") invitation.guestLimit = 1;
  if (!Number.isInteger(invitation.guestLimit) || invitation.guestLimit < 1 || invitation.guestLimit > 200) {
    return { error: "O limite deve estar entre 1 e 200 pessoas." };
  }
  if (invitation.invitationType !== "individual" && invitation.guestLimit < 2) {
    return { error: "Convites familiares e coletivos devem abranger pelo menos duas pessoas." };
  }

  invitation.normalizedPhone = normalizePhone(invitation.contactPhone);
  if (invitation.normalizedPhone.length < 9 || invitation.normalizedPhone.length > 15) {
    return { error: "Introduza um contacto válido." };
  }

  return { invitation };
}

async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

async function authorize(request, env) {
  const access = await requireAdmin(request, env);
  if (!access.ok) return { response: access.response };
  if (!env.DB) {
    return {
      response: noStoreJson({ error: "A base de dados ainda não foi configurada." }, { status: 503 }),
    };
  }
  return { email: access.email || "administrador" };
}

export async function onRequestGet({ request, env }) {
  const admin = await authorize(request, env);
  if (admin.response) return admin.response;
  await ensureSchema(env.DB);

  const url = new URL(request.url);
  const q = clean(url.searchParams.get("q"), 120);
  const type = clean(url.searchParams.get("type"), 20);
  const status = clean(url.searchParams.get("status"), 20);
  const category = clean(url.searchParams.get("category"), 60);
  const guestOf = clean(url.searchParams.get("guestOf"), 80);
  const clauses = [];
  const bindings = [];

  if (q) {
    clauses.push("(i.recipient_name LIKE ? OR i.contact_phone LIKE ? OR i.category LIKE ? OR i.guest_of LIKE ? OR i.created_by LIKE ?)");
    const pattern = `%${q}%`;
    bindings.push(pattern, pattern, pattern, pattern, pattern);
  }
  if (invitationTypes.has(type)) {
    clauses.push("i.invitation_type = ?");
    bindings.push(type);
  }
  if (invitationStatuses.has(status)) {
    clauses.push("i.status = ?");
    bindings.push(status);
  }
  if (category) {
    clauses.push("i.category = ?");
    bindings.push(category);
  }
  if (guestOf) {
    clauses.push("i.guest_of = ?");
    bindings.push(guestOf);
  }

  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const listStatement = env.DB.prepare(
    `SELECT
       i.*,
       COUNT(r.id) AS response_count,
       COALESCE(SUM(CASE WHEN r.decision_status = 'confirmed' THEN r.guest_count ELSE 0 END), 0) AS confirmed_people,
       COALESCE(SUM(CASE WHEN r.decision_status = 'rejected' THEN 1 ELSE 0 END), 0) AS rejected_count
     FROM invitations i
     LEFT JOIN rsvps r ON r.invitation_id = i.id
     ${where}
     GROUP BY i.id
     ORDER BY i.created_at DESC
     LIMIT 1000`,
  ).bind(...bindings);
  const invitationSummaryStatement = env.DB.prepare(
    `SELECT
       COUNT(*) AS invitations,
       COALESCE(SUM(guest_limit), 0) AS capacity
     FROM invitations`,
  );
  const responseSummaryStatement = env.DB.prepare(
    `SELECT
       COUNT(*) AS responses,
       COALESCE(SUM(CASE WHEN decision_status = 'confirmed' THEN guest_count ELSE 0 END), 0) AS confirmed_people
     FROM rsvps
     WHERE invitation_id IS NOT NULL`,
  );
  const categoryStatement = env.DB.prepare(
    `SELECT DISTINCT category
     FROM invitations
     WHERE category <> ''
     ORDER BY category COLLATE NOCASE`,
  );
  const guestOfStatement = env.DB.prepare(
    `SELECT label
     FROM guest_origins
     UNION
     SELECT guest_of AS label
     FROM invitations
     WHERE guest_of <> ''
     ORDER BY label COLLATE NOCASE`,
  );

  const [listResult, invitationSummaryResult, responseSummaryResult, categoryResult, guestOfResult] = await env.DB.batch([
    listStatement,
    invitationSummaryStatement,
    responseSummaryStatement,
    categoryStatement,
    guestOfStatement,
  ]);
  const invitationSummary = invitationSummaryResult.results?.[0] ?? {};
  const responseSummary = responseSummaryResult.results?.[0] ?? {};

  return noStoreJson({
    invitations: listResult.results ?? [],
    categories: (categoryResult.results ?? []).map((row) => row.category),
    guestOfOptions: (guestOfResult.results ?? []).map((row) => row.label),
    summary: {
      invitations: Number(invitationSummary.invitations ?? 0),
      capacity: Number(invitationSummary.capacity ?? 0),
      responses: Number(responseSummary.responses ?? 0),
      confirmedPeople: Number(responseSummary.confirmed_people ?? 0),
    },
  });
}

export async function onRequestPost({ request, env }) {
  const admin = await authorize(request, env);
  if (admin.response) return admin.response;
  const body = await readJson(request);
  if (!body) return noStoreJson({ error: "Dados inválidos." }, { status: 400 });

  const validation = validateInvitation(body);
  if (validation.error) return noStoreJson({ error: validation.error }, { status: 400 });
  const value = validation.invitation;
  await ensureSchema(env.DB);

  const id = crypto.randomUUID();
  const publicToken = makePublicToken();
  const now = new Date().toISOString();
  const sentAt = now;

  await env.DB.prepare(
    `INSERT INTO invitations
      (id, public_token, recipient_name, contact_phone, contact_phone_normalized,
       category, guest_of, created_by, invitation_type, guest_limit, status, notes,
       sent_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    id,
    publicToken,
    value.recipientName,
    value.contactPhone,
    value.normalizedPhone,
    value.category,
    value.guestOf,
    admin.email,
    value.invitationType,
    value.guestLimit,
    "sent",
    value.notes,
    sentAt,
    now,
    now,
  ).run();

  return noStoreJson({ ok: true, id, publicToken }, { status: 201 });
}

export async function onRequestPut({ request, env }) {
  const admin = await authorize(request, env);
  if (admin.response) return admin.response;
  const body = await readJson(request);
  if (!body) return noStoreJson({ error: "Dados inválidos." }, { status: 400 });

  const validation = validateInvitation(body);
  if (validation.error) return noStoreJson({ error: validation.error }, { status: 400 });
  const value = validation.invitation;
  if (!value.id) return noStoreJson({ error: "Convite não identificado." }, { status: 400 });
  await ensureSchema(env.DB);

  const existing = await env.DB.prepare(
    "SELECT id FROM invitations WHERE id = ?",
  ).bind(value.id).first();
  if (!existing) return noStoreJson({ error: "Convite não encontrado." }, { status: 404 });

  const now = new Date().toISOString();
  await env.DB.prepare(
    `UPDATE invitations
     SET recipient_name = ?, contact_phone = ?, contact_phone_normalized = ?,
         category = ?, guest_of = ?, invitation_type = ?, guest_limit = ?, notes = ?,
         pdf_needs_update = CASE
           WHEN pdf_object_key IS NOT NULL AND (recipient_name <> ? OR guest_limit <> ?) THEN 1
           ELSE pdf_needs_update
         END,
         updated_at = ?
     WHERE id = ?`,
  ).bind(
    value.recipientName,
    value.contactPhone,
    value.normalizedPhone,
    value.category,
    value.guestOf,
    value.invitationType,
    value.guestLimit,
    value.notes,
    value.recipientName,
    value.guestLimit,
    now,
    value.id,
  ).run();

  return noStoreJson({ ok: true });
}

export async function onRequestDelete({ request, env }) {
  const admin = await authorize(request, env);
  if (admin.response) return admin.response;
  await ensureSchema(env.DB);

  const url = new URL(request.url);
  const id = clean(url.searchParams.get("id"), 80);
  if (!id) return noStoreJson({ error: "Convite não identificado." }, { status: 400 });

  const existing = await env.DB.prepare(
    `SELECT id, recipient_name, pdf_object_key
     FROM invitations
     WHERE id = ?`,
  ).bind(id).first();
  if (!existing) return noStoreJson({ error: "Convite não encontrado." }, { status: 404 });

  const deletionResults = await env.DB.batch([
    env.DB.prepare(
      `DELETE FROM messages
       WHERE invitation_id = ?
          OR rsvp_id IN (SELECT id FROM rsvps WHERE invitation_id = ?)`,
    ).bind(id, id),
    env.DB.prepare("DELETE FROM rsvps WHERE invitation_id = ?").bind(id),
    env.DB.prepare("DELETE FROM invitations WHERE id = ?").bind(id),
  ]);
  const invitationDeletion = deletionResults[2];
  if (Number(invitationDeletion?.meta?.changes ?? 0) !== 1) {
    return noStoreJson(
      { error: "O convite já foi eliminado por outro administrador." },
      { status: 409 },
    );
  }

  let pdfRemoved = !existing.pdf_object_key;
  if (existing.pdf_object_key && env.PDFS) {
    try {
      await env.PDFS.delete(existing.pdf_object_key);
      pdfRemoved = true;
    } catch {
      pdfRemoved = false;
    }
  }

  return noStoreJson({
    ok: true,
    deletedBy: admin.email,
    recipientName: existing.recipient_name,
    pdfRemoved,
    warning: pdfRemoved ? null : "O convite foi eliminado, mas o ficheiro PDF não pôde ser removido.",
  });
}
