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

export async function onRequestGet({ request, env }) {
  const admin = await authorize(request, env);
  if (admin.response) return admin.response;
  await ensureSchema(env.DB);

  const result = await env.DB.prepare(
    `SELECT id, label, created_by, created_at
     FROM guest_origins
     ORDER BY label COLLATE NOCASE`,
  ).all();

  return noStoreJson({ origins: result.results ?? [] });
}

export async function onRequestPost({ request, env }) {
  const admin = await authorize(request, env);
  if (admin.response) return admin.response;

  let body;
  try {
    body = await request.json();
  } catch {
    return noStoreJson({ error: "Dados inválidos." }, { status: 400 });
  }

  const label = clean(body.label, 80);
  if (label.length < 2) {
    return noStoreJson({ error: "Escreva uma designação com pelo menos duas letras." }, { status: 400 });
  }

  await ensureSchema(env.DB);
  const existing = await env.DB.prepare(
    "SELECT id FROM guest_origins WHERE label = ? COLLATE NOCASE",
  ).bind(label).first();
  if (existing) {
    return noStoreJson({ error: "Esta opção já existe." }, { status: 409 });
  }

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const insertResult = await env.DB.prepare(
    `INSERT OR IGNORE INTO guest_origins (id, label, created_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?)`,
  ).bind(id, label, admin.email, now, now).run();
  if (Number(insertResult.meta?.changes ?? 0) !== 1) {
    return noStoreJson({ error: "Esta opção já foi criada por outro administrador." }, { status: 409 });
  }

  return noStoreJson({
    ok: true,
    origin: { id, label, created_by: admin.email, created_at: now },
  }, { status: 201 });
}
