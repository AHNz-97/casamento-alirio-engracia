const revealElements = document.querySelectorAll('.reveal');
if ('IntersectionObserver' in window) {
  const observer = new IntersectionObserver(entries => entries.forEach(entry => { if (entry.isIntersecting) { entry.target.classList.add('visible'); observer.unobserve(entry.target); } }), { threshold: 0.05 });
  revealElements.forEach(element => observer.observe(element));
} else revealElements.forEach(element => element.classList.add('visible'));
const weddingDate = new Date('2026-10-04T10:00:00+02:00').getTime();
function updateCountdown() {
  const remaining = Math.max(0, weddingDate - Date.now());
  const values = [Math.floor(remaining / 86400000), Math.floor(remaining / 3600000) % 24, Math.floor(remaining / 60000) % 60, Math.floor(remaining / 1000) % 60];
  ['days', 'hours', 'minutes', 'seconds'].forEach((id, i) => { const el = document.getElementById(id); if (el) el.textContent = String(values[i]).padStart(2, '0'); });
}
updateCountdown(); setInterval(updateCountdown, 1000);
const music = document.getElementById('background-music'), musicButton = document.getElementById('music-control');
if (music && musicButton) {
  music.volume = 0.65;
  const update = () => { musicButton.setAttribute('aria-pressed', String(!music.paused)); document.getElementById('music-control-label').textContent = music.paused ? 'Ouvir música' : 'Pausar música'; };
  musicButton.onclick = async () => { if (music.paused) { try { await music.play(); } catch {} } else music.pause(); update(); };
  music.addEventListener('play', update); music.addEventListener('pause', update);
  document.addEventListener('pointerdown', event => { if (!musicButton.contains(event.target)) music.play().catch(() => {}); }, { once: true });
}
document.querySelectorAll('[data-copy]').forEach(button => button.onclick = async () => {
  try { await navigator.clipboard.writeText(button.dataset.copy); document.getElementById('copy-feedback').textContent = 'Copiado.'; } catch { document.getElementById('copy-feedback').textContent = 'Seleccione o número para copiar.'; }
});
const form = document.getElementById('guest-message-form');
if (form) {
  const input = document.getElementById('guest-photo'), preview = document.getElementById('photo-preview'), wrapper = document.getElementById('photo-preview-wrap'), status = document.getElementById('guest-message-status');
  let objectUrl = null, requestId = crypto.randomUUID();
  const clearPreview = () => { if (objectUrl) URL.revokeObjectURL(objectUrl); objectUrl = null; preview.removeAttribute('src'); wrapper.hidden = true; };
  form.addEventListener('input', () => { requestId = crypto.randomUUID(); });
  input.onchange = () => {
    clearPreview(); const file = input.files[0]; if (!file) return;
    if (!['image/jpeg','image/png','image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024) { status.textContent = 'Seleccione uma imagem JPEG, PNG ou WebP de até 5 MB.'; input.value = ''; return; }
    objectUrl = URL.createObjectURL(file); preview.src = objectUrl; wrapper.hidden = false; status.textContent = '';
  };
  document.getElementById('remove-photo').onclick = () => { input.value = ''; clearPreview(); requestId = crypto.randomUUID(); };
  form.onsubmit = async event => {
    event.preventDefault(); const button = form.querySelector('[type=submit]'); if (button.disabled) return;
    button.disabled = true; status.textContent = 'A enviar a mensagem…';
    const data = new FormData(form); data.set('requestId', requestId);
    const file = input.files[0];
    try {
      if (file) {
        const bitmap = await createImageBitmap(file);
        const factor = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
        const canvas = document.createElement('canvas'); canvas.width = Math.round(bitmap.width * factor); canvas.height = Math.round(bitmap.height * factor);
        const context = canvas.getContext('2d'); context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height); context.drawImage(bitmap, 0, 0, canvas.width, canvas.height); bitmap.close();
        const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.86));
        if (!blob) throw new Error('Não foi possível preparar a fotografia. Tente outra imagem.');
        data.set('photo', blob, 'fotografia.jpg');
      } else data.delete('photo');
      const response = await fetch(form.dataset.endpoint || `/api/guest-messages/${form.dataset.token}`, { method: 'POST', body: data });
      const result = await response.json(); if (!response.ok) throw new Error(result.error || 'Não foi possível enviar.');
      status.textContent = result.message; form.elements.message.value = ''; input.value = ''; clearPreview(); requestId = crypto.randomUUID();
    } catch (error) { status.textContent = error.message || 'Não foi possível enviar. Tente novamente.'; }
    finally { button.disabled = false; }
  };
}
