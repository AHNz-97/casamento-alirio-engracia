import { ensureSchema } from "./_db.js";

export async function onRequestGet({ env }) {
  if (!env.DB) {
    return Response.json({ messages: [] });
  }

  await ensureSchema(env.DB);
  const result = await env.DB.prepare(
    `SELECT id, name, message, created_at
     FROM messages
     WHERE approved = 1 AND moderation_status = 'approved'
     ORDER BY COALESCE(moderated_at, created_at) DESC
     LIMIT 100`,
  ).all();

  return Response.json(
    { messages: result.results ?? [] },
    { headers: { "Cache-Control": "no-store" } },
  );
}
