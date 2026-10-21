import { clean, ensureSchema } from "./_db.js";

function normalizePhone(value) {
  let digits = String(value ?? "").replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.length === 10 && digits.startsWith("0")) digits = `258${digits.slice(1)}`;
  if (digits.length === 9 && digits.startsWith("8")) digits = `258${digits}`;
  return digits;
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
  return status;
}

async function saveMessage(db, { invitationId, rsvpId, name, normalizedPhone, message, createdAt }) {
  if (!message) return false;
  await db.prepare(
    `INSERT INTO messages
      (id, rsvp_id, invitation_id, name, sender_phone_normalized, message, approved, created_at)
     VALUES (?, ?, ?, ?, ?, ?, 0, ?)`,
  ).bind(
    crypto.randomUUID(),
    rsvpId,
    invitationId,
    name,
    normalizedPhone,
    message,
    createdAt,
  ).run();
  return true;
}

async function saveResponse(db, response) {
  if (response.existingId) {
    await db.prepare(
      `UPDATE rsvps
       SET name = ?, phone = ?, phone_normalized = ?, attendance = ?, guest_count = ?,
           requested_guest_count = ?, decision_status = ?, reviewed_by = NULL,
           reviewed_at = NULL, updated_at = ?
       WHERE id = ?`,
    ).bind(
      response.name,
      response.phone,
      response.normalizedPhone,
      response.attendance,
      response.guestCount,
      response.requestedGuestCount,
      response.decisionStatus,
      response.now,
      response.existingId,
    ).run();
    return response.existingId;
  }

  const id = crypto.randomUUID();
  await db.prepare(
    `INSERT INTO rsvps
      (id, invitation_id, name, phone, phone_normalized, attendance, guest_count,
       requested_guest_count, decision_status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    id,
    response.invitationId,
    response.name,
    response.phone,
    response.normalizedPhone,
    response.attendance,
    response.guestCount,
    response.requestedGuestCount,
    response.decisionStatus,
    response.now,
    response.now,
  ).run();
  return id;
}

export async function onRequestPost({ request, env }) {
  if (!env.DB) {
    return Response.json({ error: "Armazenamento ainda não configurado." }, { status: 503 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Dados inválidos." }, { status: 400 });
  }

  if (clean(body.website, 100)) return Response.json({ ok: true });

  const invitationToken = clean(body.invitationToken, 80);
  const name = clean(body.name, 100);
  const phone = clean(body.phone, 30);
  const normalizedPhone = normalizePhone(phone);
  const attendance = clean(body.attendance, 8);
  const message = clean(body.message, 500);
  const requestedGuestCount = Math.max(1, Math.min(200, Number.parseInt(body.guestCount, 10) || 1));

  if (!invitationToken || !name || !phone || !["yes", "no"].includes(attendance)) {
    return Response.json({ error: "Preencha os campos obrigatórios." }, { status: 400 });
  }
  if (normalizedPhone.length < 9 || normalizedPhone.length > 15) {
    return Response.json({ error: "Introduza um contacto válido." }, { status: 400 });
  }

  await ensureSchema(env.DB);
  const invitation = await env.DB.prepare(
    `SELECT id, invitation_type, guest_limit
     FROM invitations
     WHERE public_token = ?`,
  ).bind(invitationToken).first();
  if (!invitation) {
    return Response.json({ error: "Convite não encontrado." }, { status: 404 });
  }

  const isCollective = invitation.invitation_type === "collective";
  const guestLimit = Number(invitation.guest_limit);
  const requestedCount = isCollective ? 1 : requestedGuestCount;
  const now = new Date().toISOString();
  let existing;

  if (isCollective) {
    existing = await env.DB.prepare(
      `SELECT id, decision_status
       FROM rsvps
       WHERE invitation_id = ? AND phone_normalized = ?`,
    ).bind(invitation.id, normalizedPhone).first();
  } else {
    existing = await env.DB.prepare(
      `SELECT id, decision_status
       FROM rsvps
       WHERE invitation_id = ?
       ORDER BY created_at
       LIMIT 1`,
    ).bind(invitation.id).first();
  }

  let decisionStatus;
  if (attendance === "no") {
    decisionStatus = "absent";
  } else if (!isCollective) {
    decisionStatus = requestedCount <= guestLimit ? "confirmed" : "rejected";
  } else if (existing?.decision_status === "confirmed") {
    decisionStatus = "confirmed";
  } else {
    const capacity = await env.DB.prepare(
      `SELECT COALESCE(SUM(guest_count), 0) AS confirmed_people
       FROM rsvps
       WHERE invitation_id = ? AND decision_status = 'confirmed'`,
    ).bind(invitation.id).first();
    decisionStatus = Number(capacity?.confirmed_people ?? 0) < guestLimit ? "confirmed" : "rejected";
  }

  const rsvpId = await saveResponse(env.DB, {
    existingId: existing?.id,
    invitationId: invitation.id,
    name,
    phone,
    normalizedPhone,
    attendance,
    guestCount: requestedCount,
    requestedGuestCount: requestedCount,
    decisionStatus,
    now,
  });
  const messageSaved = await saveMessage(env.DB, {
    invitationId: invitation.id,
    rsvpId,
    name,
    normalizedPhone,
    message,
    createdAt: now,
  });
  await refreshInvitationStatus(env.DB, invitation.id);

  if (decisionStatus === "rejected") {
    return Response.json({
      ok: true,
      attendanceRecorded: false,
      messageSaved,
      noticeType: "warning",
      message: messageSaved
        ? "A sua mensagem foi guardada, mas a presença ficou recusada porque o limite deste convite já foi atingido. Os noivos poderão rever o pedido."
        : "A presença ficou recusada porque o limite deste convite já foi atingido. Os noivos poderão rever o pedido.",
    });
  }

  if (decisionStatus === "absent") {
    return Response.json({
      ok: true,
      attendanceRecorded: true,
      messageSaved,
      noticeType: "success",
      message: messageSaved
        ? "Obrigado pela resposta. A ausência e a sua mensagem foram registadas."
        : "Obrigado pela resposta. A ausência foi registada.",
    });
  }

  return Response.json({
    ok: true,
    attendanceRecorded: true,
    messageSaved,
    noticeType: "success",
    message: messageSaved
      ? "Presença confirmada. Obrigado também pela sua mensagem!"
      : "Presença confirmada com sucesso. Obrigado!",
  });
}
