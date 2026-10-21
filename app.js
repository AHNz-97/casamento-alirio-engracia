const revealElements = document.querySelectorAll(".reveal");

if ("IntersectionObserver" in window) {
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("visible");
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.12 },
  );

  revealElements.forEach((element) => observer.observe(element));
} else {
  revealElements.forEach((element) => element.classList.add("visible"));
}

const form = document.querySelector("#rsvp-form");
const statusElement = document.querySelector("#form-status");
const localNote = document.querySelector("#local-note");
const isLocalPreview = window.location.protocol === "file:";
const submitButton = form?.querySelector("button[type='submit']");
const invitationContext = document.querySelector("#invitation-context");
const invitationRecipient = document.querySelector("#invitation-recipient");
const invitationLimit = document.querySelector("#invitation-limit");
const guestCountHint = document.querySelector("#guest-count-hint");
const invitationToken = new URLSearchParams(window.location.search).get("invite")?.trim() ?? "";
let activeInvitation = null;

const backgroundMusic = document.querySelector("#background-music");
const musicControl = document.querySelector("#music-control");
const musicControlLabel = document.querySelector("#music-control-label");
let musicPausedByGuest = false;

function updateMusicControl(isPlaying) {
  if (!musicControl || !musicControlLabel) return;
  musicControl.classList.toggle("is-playing", isPlaying);
  musicControl.setAttribute("aria-pressed", String(isPlaying));
  musicControl.setAttribute(
    "aria-label",
    isPlaying ? "Pausar música de fundo" : "Ouvir música de fundo",
  );
  musicControlLabel.textContent = isPlaying ? "Pausar música" : "Ouvir música";
}

async function startBackgroundMusic() {
  if (!backgroundMusic) return false;
  backgroundMusic.volume = 1;
  try {
    await backgroundMusic.play();
    updateMusicControl(true);
    return true;
  } catch {
    updateMusicControl(false);
    return false;
  }
}

if (backgroundMusic && musicControl) {
  backgroundMusic.volume = 1;
  updateMusicControl(false);

  musicControl.addEventListener("click", async () => {
    if (backgroundMusic.paused) {
      musicPausedByGuest = false;
      await startBackgroundMusic();
    } else {
      musicPausedByGuest = true;
      backgroundMusic.pause();
      updateMusicControl(false);
    }
  });

  const startOnFirstInteraction = (event) => {
    if (musicControl.contains(event.target)) return;
    if (!musicPausedByGuest) startBackgroundMusic();
  };
  document.addEventListener("pointerdown", startOnFirstInteraction, { once: true, capture: true });

  backgroundMusic.addEventListener("play", () => updateMusicControl(true));
  backgroundMusic.addEventListener("pause", () => updateMusicControl(false));
  backgroundMusic.addEventListener("error", () => {
    musicControl.disabled = true;
    musicControlLabel.textContent = "Música indisponível";
  });

  startBackgroundMusic();
}

const weddingDate = new Date("2026-10-03T08:30:00+02:00").getTime();
const countdownFields = {
  days: document.querySelector("#days"),
  hours: document.querySelector("#hours"),
  minutes: document.querySelector("#minutes"),
  seconds: document.querySelector("#seconds"),
};

function updateCountdown() {
  const distance = Math.max(0, weddingDate - Date.now());
  const days = Math.floor(distance / 86_400_000);
  const hours = Math.floor((distance % 86_400_000) / 3_600_000);
  const minutes = Math.floor((distance % 3_600_000) / 60_000);
  const seconds = Math.floor((distance % 60_000) / 1_000);

  countdownFields.days.textContent = String(days).padStart(2, "0");
  countdownFields.hours.textContent = String(hours).padStart(2, "0");
  countdownFields.minutes.textContent = String(minutes).padStart(2, "0");
  countdownFields.seconds.textContent = String(seconds).padStart(2, "0");
}

updateCountdown();
window.setInterval(updateCountdown, 1000);

if (isLocalPreview) {
  localNote.hidden = false;
}

const copyFeedback = document.querySelector("#copy-feedback");

async function copyText(value) {
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(value);
    return;
  }

  const temporaryInput = document.createElement("textarea");
  temporaryInput.value = value;
  temporaryInput.setAttribute("readonly", "");
  temporaryInput.style.position = "fixed";
  temporaryInput.style.opacity = "0";
  document.body.appendChild(temporaryInput);
  temporaryInput.select();
  document.execCommand("copy");
  temporaryInput.remove();
}

document.querySelectorAll("[data-copy]").forEach((button) => {
  button.addEventListener("click", async () => {
    const originalLabel = button.textContent;

    try {
      await copyText(button.dataset.copy);
      button.textContent = "Copiado";
      if (copyFeedback) copyFeedback.textContent = `${button.dataset.copy} copiado.`;
    } catch {
      if (copyFeedback) copyFeedback.textContent = "Não foi possível copiar. Selecione o número manualmente.";
    }

    window.setTimeout(() => {
      button.textContent = originalLabel;
    }, 1800);
  });
});

function setStatus(message, type = "") {
  statusElement.textContent = message;
  statusElement.className = `form-status ${type}`.trim();
}

function applyInvitation(invitation) {
  activeInvitation = invitation;
  form.elements.invitationToken.value = invitation.token;
  invitationContext.hidden = false;
  invitationRecipient.textContent = invitation.recipientName;
  invitationLimit.textContent = `Convite válido para ${invitation.guestLimit} ${invitation.guestLimit === 1 ? "pessoa" : "pessoas"}.`;

  form.elements.name.value = invitation.prefillName;
  form.elements.phone.value = invitation.prefillPhone;
  form.elements.guestCount.max = invitation.guestLimit;

  if (invitation.invitationType === "family") {
    form.elements.guestCount.readOnly = false;
    guestCountHint.textContent = `Pode confirmar entre 1 e ${invitation.guestLimit} pessoas.`;
  } else {
    form.elements.guestCount.value = 1;
    form.elements.guestCount.max = 1;
    form.elements.guestCount.readOnly = true;
    guestCountHint.textContent = invitation.invitationType === "collective"
      ? "Cada participante deste convite coletivo confirma a própria presença."
      : "Este convite é válido para uma pessoa.";
  }
}

async function loadInvitation() {
  if (isLocalPreview) return;

  submitButton.disabled = true;
  if (!invitationToken) {
    setStatus("Para confirmar a presença, abra o link pessoal incluído no seu convite.", "error");
    return;
  }

  try {
    const response = await fetch(`/api/xai-xai/invitations/${encodeURIComponent(invitationToken)}`, {
      headers: { Accept: "application/json" },
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || "Convite não encontrado.");
    applyInvitation(result.invitation);
    submitButton.disabled = false;
  } catch (error) {
    setStatus(error.message, "error");
  }
}

form?.addEventListener("submit", async (event) => {
  event.preventDefault();
  setStatus("");

  if (!form.reportValidity()) return;

  const data = Object.fromEntries(new FormData(form).entries());

  if (isLocalPreview) {
    setStatus("Formulário verificado. Em modo local, nada foi enviado ou guardado.", "success");
    return;
  }

  submitButton.disabled = true;
  submitButton.textContent = "A enviar...";

  try {
    const response = await fetch("/api/xai-xai/rsvp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });

    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || "Não foi possível guardar a resposta.");

    form.reset();
    if (activeInvitation) applyInvitation(activeInvitation);
    setStatus(
      result.message || "Obrigado! A vossa resposta foi recebida com sucesso.",
      result.noticeType || "success",
    );
  } catch (error) {
    setStatus(error.message || "Não foi possível enviar agora. Por favor, tentem novamente.", "error");
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = "Enviar resposta";
  }
});

loadInvitation();
