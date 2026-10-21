import { clean, ensureSchema } from "../_db.js";
import { requireAdmin } from "./_access.js";

const moderationStatuses = new Set(["pending", "approved", "hidden"]);
const actionStatuses = new Map([
  ["approve", "approved"],
  ["hide", "hidden"],
  ["reconsider", "pending"],
]);

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

export async function onRequestGet({ request, env }) {
  const admin = await authorize(request, env);
  if (admin.response) return admin.response;
  await ensureSchema(env.DB);

  const url = new URL(request.url);
  const status = clean(url.searchParams.get("status"), 20);
  const q = clean(url.searchParams.get("q"), 120);
  const clauses = [];
  const bindings = [];

  if (moderationStatuses.has(status)) {
    clauses.push("m.moderation_status = ?");
    bindings.push(status);
  }
  if (q) {
    const pattern = `%${q}%`;
    clauses.push("(m.name LIKE ? OR m.message LIKE ? OR i.recipient_name LIKE ?)");
    bindings.push(pattern, pattern, pattern);
  }

  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const listStatement = env.DB.prepare(
    `SELECT
       m.id, m.name, m.message, m.created_at, m.moderation_status,
       m.moderated_by, m.moderated_at,
       i.recipient_name AS invitation_recipient,
       i.guest_of AS invitation_guest_of
     FROM messages m
     LEFT JOIN invitations i ON i.id = m.invitation_id
     ${where}
     ORDER BY
       CASE m.moderation_status WHEN 'pending' THEN 0 WHEN 'approved' THEN 1 ELSE 2 END,
       m.created_at DESC
     LIMIT 1000`,
  ).bind(...bindings);
  const summaryStatement = env.DB.prepare(
    `SELECT
       COUNT(*) AS total,
       COALESCE(SUM(CASE WHEN moderation_status = 'pending' THEN 1 ELSE 0 END), 0) AS pending,
       COALESCE(SUM(CASE WHEN moderation_status = 'approved' THEN 1 ELSE 0 END), 0) AS approved,
       COALESCE(SUM(CASE WHEN moderation_status = 'hidden' THEN 1 ELSE 0 END), 0) AS hidden
     FROM messages`,
  );
  const [listResult, summaryResult] = await env.DB.batch([listStatement, summaryStatement]);
  const summary = summaryResult.results?.[0] ?? {};

  return noStoreJson({
    messages: listResult.results ?? [],
    summary: {
      total: Number(summary.total ?? 0),
      pending: Number(summary.pending ?? 0),
      approved: Number(summary.approved ?? 0),
      hidden: Number(summary.hidden ?? 0),
    },
  });
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
  const currentStatus = clean(body.currentStatus, 20);
  const nextStatus = actionStatuses.get(action);
  if (!id || !nextStatus || !moderationStatuses.has(currentStatus) || nextStatus === currentStatus) {
    return noStoreJson({ error: "Ação de moderação inválida." }, { status: 400 });
  }

  await ensureSchema(env.DB);
  const now = new Date().toISOString();
  const approved = nextStatus === "approved" ? 1 : 0;
  const result = await env.DB.prepare(
    `UPDATE messages
     SET approved = ?, moderation_status = ?, moderated_by = ?, moderated_at = ?
     WHERE id = ? AND moderation_status = ?`,
  ).bind(approved, nextStatus, admin.email, now, id, currentStatus).run();

  if (Number(result.meta?.changes ?? 0) !== 1) {
    const existing = await env.DB.prepare("SELECT id FROM messages WHERE id = ?").bind(id).first();
    if (!existing) return noStoreJson({ error: "Mensagem não encontrada." }, { status: 404 });
    return noStoreJson({ error: "Esta mensagem já foi revista por outro administrador." }, { status: 409 });
  }

  return noStoreJson({ ok: true, status: nextStatus, moderatedBy: admin.email, moderatedAt: now });
}
