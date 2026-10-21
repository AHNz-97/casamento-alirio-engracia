import { clean, ensureSchema } from "../_db.js";
import { requireAdmin } from "./_access.js";

function noStoreJson(payload, init = {}) {
  const headers = new Headers(init.headers);
  headers.set("Cache-Control", "no-store");
  return Response.json(payload, { ...init, headers });
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

async function refreshInvitationStatus(db, invitationId) {
  const totals = await db.prepare(
    `SELECT
       COUNT(*) AS response_count,
       COALESCE(SUM(CASE WHEN decision_status = 'confirmed' THEN guest_count ELSE 0 END), 0) AS confirmed_people,
       COALESCE(SUM(CASE WHEN decision_status = 'rejected' THEN 1 ELSE 0 END), 0) AS rejected_count,
       COALESCE(SUM(CASE WHEN decision_status = 'absent' THEN 1 ELSE 0 END), 0) AS absent_count
     FROM rsvps
     WHERE invitation_id = ?`,
  ).bind(invitationId).first();

  const confirmedPeople = Number(totals?.confirmed_people ?? 0);
  const rejectedCount = Number(totals?.rejected_count ?? 0);
  const absentCount = Number(totals?.absent_count ?? 0);
  const responseCount = Number(totals?.response_count ?? 0);
  const status = rejectedCount > 0
    ? "inflation"
    : confirmedPeople > 0
      ? "confirmed"
      : responseCount > 0 && absentCount === responseCount
        ? "absent"
        : "sent";

  await db.prepare(
    "UPDATE invitations SET status = ?, updated_at = ? WHERE id = ?",
  ).bind(status, new Date().toISOString(), invitationId).run();
}

export async function onRequestGet({ request, env }) {
  const admin = await authorize(request, env);
  if (admin.response) return admin.response;
  const invitationId = clean(new URL(request.url).searchParams.get("invitationId"), 80);
  if (!invitationId) return noStoreJson({ error: "Convite não identificado." }, { status: 400 });

  await ensureSchema(env.DB);
  const invitation = await env.DB.prepare(
    "SELECT id, recipient_name FROM invitations WHERE id = ?",
  ).bind(invitationId).first();
  if (!invitation) return noStoreJson({ error: "Convite não encontrado." }, { status: 404 });

  const result = await env.DB.prepare(
    `SELECT id, name, phone, requested_guest_count, created_at, updated_at
     FROM rsvps
     WHERE invitation_id = ? AND decision_status = 'rejected'
     ORDER BY updated_at, created_at`,
  ).bind(invitationId).all();

  return noStoreJson({ invitation, responses: result.results ?? [] });
}

export async function onRequestPut({ request, env }) {
  const admin = await authorize(request, env);
  if (admin.response) return admin.response;

  let body;
  try {
    body = await request.json();
  } catch {
    return noStoreJson({ error: "Dados inválidos." }, { status: 400 });
  }

  const id = clean(body.id, 80);
  const action = clean(body.action, 20);
  if (!id || action !== "approve") {
    return noStoreJson({ error: "Pedido de aprovação inválido." }, { status: 400 });
  }

  await ensureSchema(env.DB);
  const response = await env.DB.prepare(
    `SELECT id, invitation_id, decision_status, requested_guest_count
     FROM rsvps
     WHERE id = ?`,
  ).bind(id).first();
  if (!response) return noStoreJson({ error: "Confirmação não encontrada." }, { status: 404 });
  if (response.decision_status !== "rejected") {
    return noStoreJson({ error: "Esta confirmação já foi revista." }, { status: 409 });
  }

  const now = new Date().toISOString();
  const updateResult = await env.DB.prepare(
    `UPDATE rsvps
     SET attendance = 'yes', decision_status = 'confirmed', guest_count = requested_guest_count,
         reviewed_by = ?, reviewed_at = ?, updated_at = ?
     WHERE id = ? AND decision_status = 'rejected'`,
  ).bind(admin.email, now, now, id).run();
  if (Number(updateResult.meta?.changes ?? 0) !== 1) {
    return noStoreJson({ error: "Esta confirmação já foi revista por outro administrador." }, { status: 409 });
  }
  await refreshInvitationStatus(env.DB, response.invitation_id);

  return noStoreJson({ ok: true, reviewedBy: admin.email, reviewedAt: now });
}
