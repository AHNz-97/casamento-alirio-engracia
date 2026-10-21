import { clean, ensureSchema } from "../_db.js";

function noStoreJson(payload, init = {}) {
  const headers = new Headers(init.headers);
  headers.set("Cache-Control", "no-store");
  return Response.json(payload, { ...init, headers });
}

export async function onRequestGet({ env, params }) {
  if (!env.DB) {
    return noStoreJson({ error: "O convite ainda não está disponível." }, { status: 503 });
  }

  const token = clean(params.token, 80);
  if (!/^[A-Za-z0-9_-]{16,80}$/.test(token)) {
    return noStoreJson({ error: "Convite não encontrado." }, { status: 404 });
  }

  await ensureSchema(env.DB);
  const invitation = await env.DB.prepare(
    `SELECT
       i.recipient_name,
       i.contact_phone,
       i.invitation_type,
       i.guest_limit,
       i.status,
       COUNT(r.id) AS response_count,
       COALESCE(SUM(CASE WHEN r.decision_status = 'confirmed' THEN r.guest_count ELSE 0 END), 0) AS confirmed_people
     FROM invitations i
     LEFT JOIN rsvps r ON r.invitation_id = i.id
     WHERE i.public_token = ?
     GROUP BY i.id`,
  ).bind(token).first();

  if (!invitation) {
    return noStoreJson({ error: "Convite não encontrado." }, { status: 404 });
  }

  const isCollective = invitation.invitation_type === "collective";
  const confirmedPeople = Number(invitation.confirmed_people ?? 0);
  const guestLimit = Number(invitation.guest_limit);

  return noStoreJson({
    invitation: {
      token,
      recipientName: invitation.recipient_name,
      prefillName: isCollective ? "" : invitation.recipient_name,
      prefillPhone: isCollective ? "" : invitation.contact_phone,
      invitationType: invitation.invitation_type,
      guestLimit,
      status: invitation.status,
      responseCount: Number(invitation.response_count ?? 0),
      confirmedPeople,
      remainingCapacity: Math.max(0, guestLimit - confirmedPeople),
    },
  });
}
