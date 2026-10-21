const isLocalPreview = window.location.protocol === "file:";
const localBanner = document.querySelector("#local-banner");
const invitationRows = document.querySelector("#invitation-rows");
const tableWrap = document.querySelector("#table-wrap");
const loadingState = document.querySelector("#loading-state");
const emptyState = document.querySelector("#empty-state");
const pageStatus = document.querySelector("#page-status");
const resultCount = document.querySelector("#result-count");
const dialog = document.querySelector("#invitation-dialog");
const form = document.querySelector("#invitation-form");
const formStatus = document.querySelector("#form-status");
const dialogTitle = document.querySelector("#dialog-title");
const dialogEyebrow = document.querySelector("#dialog-eyebrow");
const typeNote = document.querySelector("#type-note");
const typeField = form.elements.invitationType;
const guestLimitField = form.elements.guestLimit;
const guestOfField = form.elements.guestOf;
const categoryFilter = document.querySelector("#filter-category");
const categorySuggestions = document.querySelector("#category-suggestions");
const guestOfFilter = document.querySelector("#filter-guest-of");
const responsesDialog = document.querySelector("#responses-dialog");
const responsesTitle = document.querySelector("#responses-title");
const responsesIntro = document.querySelector("#responses-intro");
const rejectedList = document.querySelector("#rejected-list");
const responsesStatus = document.querySelector("#responses-status");
const originsDialog = document.querySelector("#origins-dialog");
const originForm = document.querySelector("#origin-form");
const originList = document.querySelector("#origin-list");
const originStatus = document.querySelector("#origin-status");
const adminMessageList = document.querySelector("#admin-message-list");
const messageLoading = document.querySelector("#message-loading");
const messageEmpty = document.querySelector("#message-empty");
const messageAdminStatus = document.querySelector("#message-admin-status");
const messageSearch = document.querySelector("#message-search");
const messageFilterStatus = document.querySelector("#message-filter-status");

const labels = {
  types: {
    individual: "Individual",
    family: "Familiar",
    collective: "Coletivo",
  },
  statuses: {
    sent: "Enviado",
    confirmed: "Confirmado",
    absent: "Ausente",
    inflation: "Inflação",
  },
  messageStatuses: {
    pending: "Pendente",
    approved: "Aprovada",
    hidden: "Ocultada",
  },
};

let invitations = [];
let localInvitations = [];
let localOrigins = [
  "Noivo",
  "Noiva",
  "Pais do noivo",
  "Pais da noiva",
  "Irmãos do noivo",
  "Irmãos da noiva",
].map((label, index) => ({
  id: `local-origin-${index + 1}`,
  label,
  created_by: "Sistema",
  created_at: "2026-08-02T00:00:00.000Z",
}));
const localPdfs = new Map();
let localMessages = [
  {
    id: "local-message-pending",
    name: "Lina e família",
    message: "Que esta nova caminhada seja cheia de fé, amizade e muitos motivos para sorrir.",
    moderation_status: "pending",
    invitation_recipient: "Família de demonstração",
    invitation_guest_of: "Noiva",
    created_at: new Date().toISOString(),
    moderated_by: null,
    moderated_at: null,
  },
  {
    id: "local-message-approved",
    name: "Amigos do casal",
    message: "Desejamos uma vida construída com respeito, paciência e muito amor.",
    moderation_status: "approved",
    invitation_recipient: "Colegas da escola",
    invitation_guest_of: "Noivo",
    created_at: new Date(Date.now() - 3_600_000).toISOString(),
    moderated_by: "Pré-visualização local",
    moderated_at: new Date().toISOString(),
  },
];
let searchTimer;
let messageSearchTimer;
let activeReviewInvitation = null;

if (isLocalPreview) localBanner.hidden = false;

function setPageStatus(message, type = "") {
  pageStatus.textContent = message;
  pageStatus.className = `page-status ${type}`.trim();
}

function setFormStatus(message, type = "") {
  formStatus.textContent = message;
  formStatus.className = `form-status ${type}`.trim();
}

function formatDateTime(value) {
  if (!value) return "data não disponível";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("pt-MZ", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

function invitationUrl(invitation) {
  if (isLocalPreview) {
    const localUrl = new URL("index.html", window.location.href);
    localUrl.searchParams.set("invite", invitation.public_token);
    return localUrl.href;
  }
  return `${window.location.origin}/xai-xai?invite=${encodeURIComponent(invitation.public_token)}`;
}

function pdfFilename(recipientName) {
  const name = String(recipientName)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase()
    .slice(0, 80);
  return `convite-${name || "convidado"}.pdf`;
}

function triggerBlobDownload(blob, filename) {
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 30_000);
}

function downloadInvitationPdf(invitation) {
  if (isLocalPreview) {
    const saved = localPdfs.get(invitation.id);
    if (!saved) {
      setPageStatus("O PDF desta pré-visualização já não está disponível nesta sessão.", "error");
      return;
    }
    triggerBlobDownload(saved.blob, saved.filename);
    setPageStatus(`PDF de ${invitation.recipient_name} baixado novamente.`, "success");
    return;
  }

  const link = document.createElement("a");
  link.href = `/api/admin/xai-xai/pdfs?id=${encodeURIComponent(invitation.id)}`;
  link.download = invitation.pdf_filename || pdfFilename(invitation.recipient_name);
  document.body.append(link);
  link.click();
  link.remove();
  setPageStatus(`Download do PDF de ${invitation.recipient_name} iniciado.`, "success");
}

async function generateInvitationPdf(invitation, button) {
  const originalLabel = button.textContent;
  button.disabled = true;
  button.textContent = "A gerar…";
  setPageStatus("A preparar o convite personalizado…");

  try {
    if (!window.WeddingPdf?.createInvitationPdf) {
      throw new Error("O gerador de PDF não está disponível.");
    }
    const blob = await window.WeddingPdf.createInvitationPdf({
      baseImageUrl: "/assets/images/convite-base.png",
      recipientName: invitation.recipient_name,
      guestLimit: invitation.guest_limit,
      invitationUrl: invitationUrl(invitation),
    });
    const filename = pdfFilename(invitation.recipient_name);

    if (isLocalPreview) {
      localPdfs.set(invitation.id, { blob, filename });
      const localInvitation = localInvitations.find((item) => item.id === invitation.id);
      if (localInvitation) {
        localInvitation.pdf_object_key = `local/${invitation.id}/convite.pdf`;
        localInvitation.pdf_filename = filename;
        localInvitation.pdf_generated_at = new Date().toISOString();
        localInvitation.pdf_generated_by = "Pré-visualização local";
        localInvitation.pdf_needs_update = 0;
      }
    } else {
      const response = await fetch(`/api/admin/xai-xai/pdfs?id=${encodeURIComponent(invitation.id)}`, {
        method: "POST",
        headers: { "Content-Type": "application/pdf" },
        body: blob,
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Não foi possível guardar o PDF.");
    }

    await loadInvitations();
    const updatedInvitation = invitations.find((item) => item.id === invitation.id) || invitation;
    downloadInvitationPdf(updatedInvitation);
  } catch (error) {
    setPageStatus(error.message, "error");
    button.disabled = false;
    button.textContent = originalLabel;
  }
}

function makeCell(label, content) {
  const cell = document.createElement("td");
  cell.dataset.label = label;
  if (content instanceof Node) cell.append(content);
  else cell.textContent = String(content);
  return cell;
}

function makeBadge(text, className) {
  const badge = document.createElement("span");
  badge.className = className;
  badge.textContent = text;
  return badge;
}

function makePdfCell(invitation) {
  const wrapper = document.createElement("div");
  wrapper.className = "pdf-cell";
  const actions = document.createElement("div");
  actions.className = "pdf-actions";
  const hasPdf = Boolean(invitation.pdf_object_key);
  const needsUpdate = Number(invitation.pdf_needs_update ?? 0) === 1;

  if (hasPdf) {
    const downloadButton = document.createElement("button");
    downloadButton.type = "button";
    downloadButton.className = "pdf-button";
    downloadButton.textContent = "Baixar PDF";
    downloadButton.addEventListener("click", () => downloadInvitationPdf(invitation));
    actions.append(downloadButton);

    if (needsUpdate) {
      const updateButton = document.createElement("button");
      updateButton.type = "button";
      updateButton.className = "pdf-button";
      updateButton.textContent = "Atualizar";
      updateButton.addEventListener("click", () => generateInvitationPdf(invitation, updateButton));
      actions.append(updateButton);
    }
  } else {
    const generateButton = document.createElement("button");
    generateButton.type = "button";
    generateButton.className = "pdf-button";
    generateButton.textContent = "Gerar PDF";
    generateButton.addEventListener("click", () => generateInvitationPdf(invitation, generateButton));
    actions.append(generateButton);
  }

  const note = document.createElement("small");
  if (needsUpdate) {
    note.className = "pdf-warning";
    note.textContent = "Desatualizado após edição";
  } else if (hasPdf) {
    note.textContent = `Guardado por ${invitation.pdf_generated_by || "Administrador"} · ${formatDateTime(invitation.pdf_generated_at)}`;
  } else {
    note.textContent = "Ainda não gerado";
  }
  wrapper.append(actions, note);
  return wrapper;
}

function renderRows() {
  invitationRows.replaceChildren();

  invitations.forEach((invitation) => {
    const row = document.createElement("tr");

    const recipient = document.createElement("div");
    recipient.className = "recipient-cell";
    const name = document.createElement("strong");
    name.textContent = invitation.recipient_name;
    const phone = document.createElement("small");
    phone.textContent = invitation.contact_phone;
    const audit = document.createElement("span");
    audit.className = "recipient-audit";
    audit.textContent = `Criado por ${invitation.created_by || "Administrador"} · ${formatDateTime(invitation.created_at)}`;
    recipient.append(name, phone, audit);

    const rejectedCount = Number(invitation.rejected_count ?? 0);
    const responseText = rejectedCount
      ? `${invitation.confirmed_people ?? 0} confirmado(s) · ${rejectedCount} recusado(s)`
      : `${invitation.response_count ?? 0} resposta(s) · ${invitation.confirmed_people ?? 0} confirmado(s)`;
    const typeBadge = makeBadge(labels.types[invitation.invitation_type], "type-badge");
    const statusBadge = makeBadge(
      labels.statuses[invitation.status],
      `status-badge status-${invitation.status}`,
    );
    const editButton = document.createElement("button");
    editButton.type = "button";
    editButton.className = "edit-button";
    editButton.textContent = "Editar";
    editButton.addEventListener("click", () => openEditDialog(invitation));

    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "delete-button";
    deleteButton.textContent = "Apagar";
    deleteButton.addEventListener("click", () => deleteInvitation(invitation, deleteButton));

    const actions = document.createElement("div");
    actions.className = "row-actions";
    actions.append(editButton, deleteButton);
    if (rejectedCount > 0) {
      const reviewButton = document.createElement("button");
      reviewButton.type = "button";
      reviewButton.className = "review-button";
      reviewButton.textContent = `Rever ${rejectedCount}`;
      reviewButton.addEventListener("click", () => openResponsesDialog(invitation));
      actions.prepend(reviewButton);
    }

    row.append(
      makeCell("Destinatário", recipient),
      makeCell("Convidado de", invitation.guest_of || "—"),
      makeCell("Categoria", invitation.category),
      makeCell("Tipo", typeBadge),
      makeCell("Limite", invitation.guest_limit),
      makeCell("Respostas", responseText),
      makeCell("Estado", statusBadge),
      makeCell("PDF", makePdfCell(invitation)),
      makeCell("Ações", actions),
    );
    invitationRows.append(row);
  });

  loadingState.hidden = true;
  emptyState.hidden = invitations.length > 0;
  tableWrap.hidden = invitations.length === 0;
  resultCount.textContent = `${invitations.length} ${invitations.length === 1 ? "resultado" : "resultados"}`;
}

async function deleteInvitation(invitation, button) {
  const confirmed = window.confirm(
    `Apagar definitivamente o convite de “${invitation.recipient_name}”?\n\n` +
    "Também serão apagadas as confirmações, mensagens e o PDF associados. Esta ação não pode ser anulada.",
  );
  if (!confirmed) return;

  const originalLabel = button.textContent;
  button.disabled = true;
  button.textContent = "A apagar…";
  setPageStatus("");

  try {
    let warning = "";
    if (isLocalPreview) {
      localInvitations = localInvitations.filter((item) => item.id !== invitation.id);
      localMessages = localMessages.filter((item) => item.invitation_id !== invitation.id);
      localPdfs.delete(invitation.id);
    } else {
      const response = await fetch(
        `/api/admin/xai-xai/invitations?id=${encodeURIComponent(invitation.id)}`,
        { method: "DELETE", headers: { Accept: "application/json" } },
      );
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Não foi possível apagar o convite.");
      warning = result.warning || "";
    }

    await Promise.all([loadInvitations(), loadAdminMessages()]);
    setPageStatus(
      warning || `O convite de ${invitation.recipient_name} foi apagado.`,
      warning ? "error" : "success",
    );
  } catch (error) {
    button.disabled = false;
    button.textContent = originalLabel;
    setPageStatus(error.message, "error");
  }
}

function renderSummary(summary) {
  document.querySelector("#stat-invitations").textContent = summary.invitations ?? 0;
  document.querySelector("#stat-capacity").textContent = summary.capacity ?? 0;
  document.querySelector("#stat-responses").textContent = summary.responses ?? 0;
  document.querySelector("#stat-confirmed").textContent = summary.confirmedPeople ?? 0;
}

function renderFilterOptions(categories, guestOfOptions) {
  const currentFilter = categoryFilter.value;
  const currentGuestOf = guestOfFilter.value;
  const currentFormGuestOf = guestOfField.value;
  categoryFilter.replaceChildren(new Option("Todas", ""));
  guestOfFilter.replaceChildren(new Option("Todos", ""));
  guestOfField.replaceChildren(new Option("Escolha uma opção", ""));
  categorySuggestions.replaceChildren();

  categories.forEach((category) => {
    categoryFilter.add(new Option(category, category));
    categorySuggestions.append(new Option(category, category));
  });

  if (categories.includes(currentFilter)) categoryFilter.value = currentFilter;
  guestOfOptions.forEach((value) => {
    guestOfFilter.add(new Option(value, value));
    guestOfField.add(new Option(value, value));
  });
  if (guestOfOptions.includes(currentGuestOf)) guestOfFilter.value = currentGuestOf;
  if (guestOfOptions.includes(currentFormGuestOf)) guestOfField.value = currentFormGuestOf;
}

function getFilters() {
  return {
    q: document.querySelector("#search").value.trim(),
    type: document.querySelector("#filter-type").value,
    status: document.querySelector("#filter-status").value,
    category: categoryFilter.value,
    guestOf: guestOfFilter.value,
  };
}

function localPayload() {
  const filters = getFilters();
  const q = filters.q.toLocaleLowerCase("pt");
  const filtered = localInvitations.filter((item) => {
    const searchable = `${item.recipient_name} ${item.contact_phone} ${item.category} ${item.guest_of}`.toLocaleLowerCase("pt");
    return (
      (!q || searchable.includes(q)) &&
      (!filters.type || item.invitation_type === filters.type) &&
      (!filters.status || item.status === filters.status) &&
      (!filters.category || item.category === filters.category) &&
      (!filters.guestOf || item.guest_of === filters.guestOf)
    );
  });

  return {
    invitations: filtered,
    categories: [...new Set(localInvitations.map((item) => item.category))].sort((a, b) => a.localeCompare(b, "pt")),
    guestOfOptions: [...new Set([
      ...localOrigins.map((item) => item.label),
      ...localInvitations.map((item) => item.guest_of),
    ])].filter(Boolean).sort((a, b) => a.localeCompare(b, "pt")),
    summary: {
      invitations: localInvitations.length,
      capacity: localInvitations.reduce((total, item) => total + item.guest_limit, 0),
      responses: localInvitations.reduce((total, item) => total + item.response_count, 0),
      confirmedPeople: localInvitations.reduce((total, item) => total + item.confirmed_people, 0),
    },
  };
}

async function loadInvitations() {
  loadingState.hidden = false;
  emptyState.hidden = true;
  tableWrap.hidden = true;
  setPageStatus("");

  try {
    let payload;

    if (isLocalPreview) {
      payload = localPayload();
    } else {
      const params = new URLSearchParams(getFilters());
      [...params.entries()].forEach(([key, value]) => {
        if (!value) params.delete(key);
      });
      const response = await fetch(`/api/admin/xai-xai/invitations?${params}`, {
        headers: { Accept: "application/json" },
      });
      if (!response.ok) throw new Error(response.status === 403 ? "Acesso administrativo não autorizado." : "Não foi possível carregar os convites.");
      payload = await response.json();
    }

    invitations = payload.invitations ?? [];
    renderRows();
    renderSummary(payload.summary ?? {});
    renderFilterOptions(payload.categories ?? [], payload.guestOfOptions ?? []);
  } catch (error) {
    loadingState.hidden = true;
    setPageStatus(error.message, "error");
  }
}

function setAdminMessageStatus(message, type = "") {
  messageAdminStatus.textContent = message;
  messageAdminStatus.className = `page-status ${type}`.trim();
}

function renderMessageSummary(summary) {
  document.querySelector("#message-stat-pending").textContent = summary.pending ?? 0;
  document.querySelector("#message-stat-approved").textContent = summary.approved ?? 0;
  document.querySelector("#message-stat-hidden").textContent = summary.hidden ?? 0;
}

function makeMessageAction(label, className, action, messageItem) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `message-action-button ${className}`.trim();
  button.textContent = label;
  button.addEventListener("click", () => moderateMessage(messageItem, action, button));
  return button;
}

function renderAdminMessages(items) {
  adminMessageList.replaceChildren();
  items.forEach((messageItem) => {
    const card = document.createElement("article");
    card.className = "admin-message-card";
    card.dataset.status = messageItem.moderation_status;

    const content = document.createElement("div");
    const author = document.createElement("div");
    author.className = "message-author";
    const name = document.createElement("strong");
    name.textContent = messageItem.name;
    const status = document.createElement("span");
    status.className = `message-status-badge message-status-${messageItem.moderation_status}`;
    status.textContent = labels.messageStatuses[messageItem.moderation_status] || messageItem.moderation_status;
    author.append(name, status);

    const body = document.createElement("p");
    body.className = "message-body";
    body.textContent = messageItem.message;
    const meta = document.createElement("p");
    meta.className = "message-meta";
    const invitationLabel = messageItem.invitation_recipient
      ? `Convite: ${messageItem.invitation_recipient}`
      : "Convite antigo";
    const guestOfLabel = messageItem.invitation_guest_of ? ` · Convidado de: ${messageItem.invitation_guest_of}` : "";
    const moderationLabel = messageItem.moderated_at
      ? ` · Revista por ${messageItem.moderated_by || "Administrador"} em ${formatDateTime(messageItem.moderated_at)}`
      : "";
    meta.textContent = `${invitationLabel}${guestOfLabel} · Recebida em ${formatDateTime(messageItem.created_at)}${moderationLabel}`;
    content.append(author, body, meta);

    const actions = document.createElement("div");
    actions.className = "message-actions";
    if (messageItem.moderation_status === "pending") {
      actions.append(
        makeMessageAction("Aprovar", "message-approve", "approve", messageItem),
        makeMessageAction("Ocultar", "message-hide", "hide", messageItem),
      );
    } else if (messageItem.moderation_status === "approved") {
      actions.append(makeMessageAction("Retirar do ecrã", "message-hide", "hide", messageItem));
    } else {
      actions.append(
        makeMessageAction("Reconsiderar", "", "reconsider", messageItem),
        makeMessageAction("Aprovar", "message-approve", "approve", messageItem),
      );
    }

    card.append(content, actions);
    adminMessageList.append(card);
  });

  messageLoading.hidden = true;
  messageEmpty.hidden = items.length > 0;
  adminMessageList.hidden = items.length === 0;
}

function localMessagesPayload() {
  const q = messageSearch.value.trim().toLocaleLowerCase("pt");
  const status = messageFilterStatus.value;
  const filtered = localMessages.filter((messageItem) => {
    const searchable = `${messageItem.name} ${messageItem.message} ${messageItem.invitation_recipient || ""}`.toLocaleLowerCase("pt");
    return (!q || searchable.includes(q)) && (!status || messageItem.moderation_status === status);
  });
  return {
    messages: filtered,
    summary: {
      total: localMessages.length,
      pending: localMessages.filter((item) => item.moderation_status === "pending").length,
      approved: localMessages.filter((item) => item.moderation_status === "approved").length,
      hidden: localMessages.filter((item) => item.moderation_status === "hidden").length,
    },
  };
}

async function loadAdminMessages() {
  messageLoading.hidden = false;
  messageEmpty.hidden = true;
  adminMessageList.hidden = true;
  setAdminMessageStatus("");

  try {
    let payload;
    if (isLocalPreview) {
      payload = localMessagesPayload();
    } else {
      const params = new URLSearchParams({
        q: messageSearch.value.trim(),
        status: messageFilterStatus.value,
      });
      [...params.entries()].forEach(([key, value]) => {
        if (!value) params.delete(key);
      });
      const response = await fetch(`/api/admin/xai-xai/messages?${params}`, {
        headers: { Accept: "application/json" },
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Não foi possível carregar as mensagens.");
      payload = result;
    }
    renderAdminMessages(payload.messages ?? []);
    renderMessageSummary(payload.summary ?? {});
  } catch (error) {
    messageLoading.hidden = true;
    setAdminMessageStatus(error.message, "error");
  }
}

async function moderateMessage(messageItem, action, button) {
  const originalLabel = button.textContent;
  button.disabled = true;
  button.textContent = "A guardar…";
  setAdminMessageStatus("");

  try {
    if (isLocalPreview) {
      const localMessage = localMessages.find((item) => item.id === messageItem.id);
      if (!localMessage) throw new Error("Mensagem não encontrada.");
      localMessage.moderation_status = action === "approve" ? "approved" : action === "hide" ? "hidden" : "pending";
      localMessage.moderated_by = "Pré-visualização local";
      localMessage.moderated_at = new Date().toISOString();
    } else {
      const response = await fetch("/api/admin/xai-xai/messages", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: messageItem.id,
          action,
          currentStatus: messageItem.moderation_status,
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Não foi possível moderar a mensagem.");
    }
    await loadAdminMessages();
    setAdminMessageStatus("Moderação guardada. O ecrã público será atualizado automaticamente.", "success");
  } catch (error) {
    setAdminMessageStatus(error.message, "error");
    button.disabled = false;
    button.textContent = originalLabel;
  }
}

function updateTypeRules() {
  if (typeField.value === "individual") {
    guestLimitField.value = 1;
    guestLimitField.readOnly = true;
    typeNote.textContent = "Um convite individual representa uma pessoa e aceita uma única confirmação.";
    return;
  }

  guestLimitField.readOnly = false;
  if (Number(guestLimitField.value) < 2) guestLimitField.value = 2;
  typeNote.textContent = typeField.value === "family"
    ? "Uma única confirmação representará toda a família, até ao limite indicado."
    : "Várias pessoas poderão responder separadamente usando o mesmo convite, até ao limite indicado.";
}

function openNewDialog() {
  form.reset();
  form.elements.id.value = "";
  dialogEyebrow.textContent = "Novo registo";
  dialogTitle.textContent = "Cadastrar convite";
  setFormStatus("");
  updateTypeRules();
  dialog.showModal();
  form.elements.recipientName.focus();
}

function openEditDialog(invitation) {
  form.reset();
  form.elements.id.value = invitation.id;
  form.elements.recipientName.value = invitation.recipient_name;
  form.elements.contactPhone.value = invitation.contact_phone;
  form.elements.category.value = invitation.category;
  form.elements.guestOf.value = invitation.guest_of;
  form.elements.invitationType.value = invitation.invitation_type;
  form.elements.guestLimit.value = invitation.guest_limit;
  form.elements.notes.value = invitation.notes ?? "";
  dialogEyebrow.textContent = "Editar registo";
  dialogTitle.textContent = invitation.recipient_name;
  setFormStatus("");
  updateTypeRules();
  dialog.showModal();
  form.elements.recipientName.focus();
}

function closeDialog() {
  if (dialog.open) dialog.close();
}

function setResponsesStatus(message, type = "") {
  responsesStatus.textContent = message;
  responsesStatus.className = `form-status ${type}`.trim();
}

function renderRejectedResponses(responses) {
  rejectedList.replaceChildren();
  if (!responses.length) {
    const empty = document.createElement("p");
    empty.className = "responses-intro";
    empty.textContent = "Não existem pedidos recusados por excesso neste convite.";
    rejectedList.append(empty);
    return;
  }

  responses.forEach((response) => {
    const card = document.createElement("article");
    card.className = "response-card";
    const details = document.createElement("div");
    const name = document.createElement("strong");
    name.textContent = response.name;
    const contact = document.createElement("span");
    contact.textContent = `${response.phone} · solicitou ${response.requested_guest_count} pessoa(s)`;
    const date = document.createElement("small");
    date.textContent = `Pedido recebido em ${formatDateTime(response.updated_at || response.created_at)}`;
    details.append(name, contact, date);

    const approveButton = document.createElement("button");
    approveButton.type = "button";
    approveButton.className = "button button-primary";
    approveButton.textContent = "Aprovar";
    approveButton.addEventListener("click", () => approveRejectedResponse(response, approveButton));
    card.append(details, approveButton);
    rejectedList.append(card);
  });
}

async function loadRejectedResponses() {
  if (!activeReviewInvitation) return;
  setResponsesStatus("A carregar…");
  try {
    const response = await fetch(
      `/api/admin/xai-xai/responses?invitationId=${encodeURIComponent(activeReviewInvitation.id)}`,
      { headers: { Accept: "application/json" } },
    );
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || "Não foi possível carregar os pedidos.");
    renderRejectedResponses(result.responses ?? []);
    setResponsesStatus("");
  } catch (error) {
    setResponsesStatus(error.message, "error");
  }
}

function openResponsesDialog(invitation) {
  activeReviewInvitation = invitation;
  responsesTitle.textContent = `Inflação — ${invitation.recipient_name}`;
  responsesIntro.textContent = "Estas presenças foram recusadas automaticamente porque ultrapassavam o limite. A aprovação manual pode aumentar o total previsto.";
  rejectedList.replaceChildren();
  responsesDialog.showModal();
  loadRejectedResponses();
}

async function approveRejectedResponse(responseItem, button) {
  button.disabled = true;
  button.textContent = "A aprovar…";
  setResponsesStatus("");

  try {
    const response = await fetch("/api/admin/xai-xai/responses", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: responseItem.id, action: "approve" }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || "Não foi possível aprovar o pedido.");
    setResponsesStatus("Presença aprovada. A pessoa deverá ser informada diretamente.", "success");
    await loadInvitations();
    await loadRejectedResponses();
  } catch (error) {
    setResponsesStatus(error.message, "error");
    button.disabled = false;
    button.textContent = "Aprovar";
  }
}

function setOriginStatus(message, type = "") {
  originStatus.textContent = message;
  originStatus.className = `form-status ${type}`.trim();
}

function renderOrigins(origins) {
  originList.replaceChildren();
  origins.forEach((origin) => {
    const item = document.createElement("article");
    item.className = "origin-item";
    const label = document.createElement("strong");
    label.textContent = origin.label;
    const audit = document.createElement("small");
    audit.textContent = `Criado por ${origin.created_by || "Administrador"} · ${formatDateTime(origin.created_at)}`;
    item.append(label, audit);
    originList.append(item);
  });
}

async function loadOrigins() {
  setOriginStatus("A carregar…");
  try {
    let origins;
    if (isLocalPreview) {
      origins = [...localOrigins].sort((a, b) => a.label.localeCompare(b.label, "pt"));
    } else {
      const response = await fetch("/api/admin/xai-xai/guest-origins", {
        headers: { Accept: "application/json" },
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Não foi possível carregar as opções.");
      origins = result.origins ?? [];
    }
    renderOrigins(origins);
    setOriginStatus("");
  } catch (error) {
    setOriginStatus(error.message, "error");
  }
}

function openOriginsDialog() {
  setOriginStatus("");
  originsDialog.showModal();
  loadOrigins();
  originForm.elements.label.focus();
}

originForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!originForm.reportValidity()) return;
  const label = originForm.elements.label.value.trim();
  const submitButton = originForm.querySelector("button[type='submit']");
  submitButton.disabled = true;
  submitButton.textContent = "A adicionar…";
  setOriginStatus("");

  try {
    if (isLocalPreview) {
      if (localOrigins.some((origin) => origin.label.localeCompare(label, "pt", { sensitivity: "base" }) === 0)) {
        throw new Error("Esta opção já existe.");
      }
      localOrigins.push({
        id: typeof crypto.randomUUID === "function" ? crypto.randomUUID() : makeLocalToken(),
        label,
        created_by: "Pré-visualização local",
        created_at: new Date().toISOString(),
      });
    } else {
      const response = await fetch("/api/admin/xai-xai/guest-origins", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Não foi possível adicionar a opção.");
    }

    originForm.reset();
    await Promise.all([loadOrigins(), loadInvitations()]);
    guestOfField.value = label;
    setOriginStatus("Opção adicionada e disponível nos convites.", "success");
  } catch (error) {
    setOriginStatus(error.message, "error");
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = "Adicionar";
  }
});

function makeLocalToken() {
  const bytes = new Uint8Array(15);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function localSave(data) {
  const existingIndex = localInvitations.findIndex((item) => item.id === data.id);
  const now = new Date().toISOString();

  if (existingIndex >= 0) {
    const existing = localInvitations[existingIndex];
    const pdfNeedsUpdate = existing.pdf_object_key && (
      existing.recipient_name !== data.recipientName ||
      Number(existing.guest_limit) !== Number(data.guestLimit)
    );
    localInvitations[existingIndex] = {
      ...existing,
      recipient_name: data.recipientName,
      contact_phone: data.contactPhone,
      category: data.category,
      guest_of: data.guestOf,
      invitation_type: data.invitationType,
      guest_limit: data.guestLimit,
      notes: data.notes,
      pdf_needs_update: pdfNeedsUpdate ? 1 : existing.pdf_needs_update,
      updated_at: now,
    };
    return;
  }

  localInvitations.unshift({
    id: typeof crypto.randomUUID === "function" ? crypto.randomUUID() : makeLocalToken(),
    public_token: makeLocalToken(),
    recipient_name: data.recipientName,
    contact_phone: data.contactPhone,
    category: data.category,
    guest_of: data.guestOf,
    created_by: "Pré-visualização local",
    invitation_type: data.invitationType,
    guest_limit: data.guestLimit,
    status: "sent",
    notes: data.notes,
    response_count: 0,
    confirmed_people: 0,
    rejected_count: 0,
    pdf_object_key: null,
    pdf_filename: null,
    pdf_generated_at: null,
    pdf_generated_by: null,
    pdf_needs_update: 0,
    created_at: now,
    updated_at: now,
  });
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  setFormStatus("");
  if (!form.reportValidity()) return;

  const payload = {
    id: form.elements.id.value,
    recipientName: form.elements.recipientName.value.trim(),
    contactPhone: form.elements.contactPhone.value.trim(),
    category: form.elements.category.value.trim(),
    guestOf: form.elements.guestOf.value.trim(),
    invitationType: form.elements.invitationType.value,
    guestLimit: Number.parseInt(form.elements.guestLimit.value, 10),
    notes: form.elements.notes.value.trim(),
  };

  const submitButton = form.querySelector("button[type='submit']");
  submitButton.disabled = true;
  submitButton.textContent = "A guardar…";

  try {
    if (isLocalPreview) {
      localSave(payload);
    } else {
      const response = await fetch("/api/admin/xai-xai/invitations", {
        method: payload.id ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Não foi possível guardar o convite.");
    }

    closeDialog();
    await loadInvitations();
    setPageStatus("Convite guardado com sucesso.", "success");
  } catch (error) {
    setFormStatus(error.message, "error");
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = "Guardar convite";
  }
});

document.querySelector("#new-invitation").addEventListener("click", openNewDialog);
document.querySelector("#manage-origins").addEventListener("click", openOriginsDialog);
document.querySelector("#manage-origins-from-form").addEventListener("click", openOriginsDialog);
document.querySelector("#close-dialog").addEventListener("click", closeDialog);
document.querySelector("#cancel-dialog").addEventListener("click", closeDialog);
document.querySelector("#close-responses").addEventListener("click", () => responsesDialog.close());
document.querySelector("#close-origins").addEventListener("click", () => originsDialog.close());
typeField.addEventListener("change", updateTypeRules);

document.querySelector("#search").addEventListener("input", () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(loadInvitations, 250);
});

document.querySelectorAll("#filter-type, #filter-status, #filter-category, #filter-guest-of").forEach((field) => {
  field.addEventListener("change", loadInvitations);
});

messageSearch.addEventListener("input", () => {
  clearTimeout(messageSearchTimer);
  messageSearchTimer = setTimeout(loadAdminMessages, 250);
});
messageFilterStatus.addEventListener("change", loadAdminMessages);

loadInvitations();
loadAdminMessages();


document.getElementById("logout").onclick=async()=>{const response=await fetch("/api/logout",{method:"POST"});if(response.ok)location.replace("/login");};
