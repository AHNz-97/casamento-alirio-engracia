import { ensureInharrime, pdfResponse, fingerprint } from '../functions/api/admin/inharrime.js';
import template from './guest-template.js';
import { attachSeats } from './seating-store.js';
import { categoryPath,seatLabel,tableLabel } from '../shared/seating.js';
const escape = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
export const programme = [{ time: '10h00', iso: '10:00', title: 'Chegada dos convidados' }, { time: '12h30', iso: '12:30', title: 'Copo de água' }];
export function invitationHtml(invitation = null) {
  const panel = invitation ? `<section class="guest-panel"><p class="eyebrow">Este convite é para si</p><h2>${escape(invitation.recipient_name)}</h2><p>Válido para ${invitation.guest_count} ${invitation.guest_count === 1 ? 'pessoa' : 'pessoas'}</p>${invitation.seats?.length?`<details><summary>${escape(tableLabel(invitation.category))}</summary>${invitation.seats.map(s=>`<p>${escape(seatLabel(s.code,invitation.category))}</p>`).join('')}</details>`:''}<a class="button button-primary" href="${categoryPath(invitation.category)}">Deixar uma mensagem</a></section>` : '';
  const form = invitation ? `<section class="rsvp reveal" id="mensagem"><div class="rsvp-intro"><p class="eyebrow">Palavras que ficam</p><h2>Deixe-nos uma mensagem</h2><p>Partilhe o seu carinho com os noivos. Se quiser, junte uma fotografia. As mensagens e fotografias serão revistas antes de aparecerem na apresentação.</p><p>Não é necessário confirmar a presença.</p></div><form class="rsvp-form" id="guest-message-form" data-token="${invitation.public_token}"><label>O seu nome<input name="name" value="${escape(invitation.recipient_name)}" maxlength="120" autocomplete="name" required></label><label>Mensagem para os noivos<textarea name="message" rows="6" maxlength="1000" placeholder="Uma palavra de carinho, uma memória, um desejo…" required></textarea></label><label>Fotografia (opcional)<input id="guest-photo" name="photo" type="file" accept="image/jpeg,image/png,image/webp"><small>JPEG, PNG ou WebP, até 5 MB.</small></label><div id="photo-preview-wrap" hidden><img id="photo-preview" alt="Fotografia seleccionada"><button type="button" id="remove-photo">Retirar fotografia</button></div><button class="button button-primary" type="submit">Enviar mensagem</button><p id="guest-message-status" class="form-status" role="status" aria-live="polite"></p></form></section>` : `<section class="welcome"><h2>Uma celebração feita de carinho</h2><p>Abra o link do seu convite para nos deixar uma mensagem e uma fotografia.</p></section>`;
  const program = `<ol class="detail-grid">${programme.map(item => `<li class="detail-card"><time datetime="2026-10-04T${item.iso}:00+02:00">${item.time}</time><div><h3>${item.title}</h3><p>Xibicana, Inharrime</p></div></li>`).join('')}</ol>`;
  return template.replace('{{GUEST_PANEL}}', panel).replace('{{MESSAGE_FORM}}', invitation ? '' : form).replace('{{PROGRAM}}', program);
}
export async function publicInvitation(request, env) {
  const match = new URL(request.url).pathname.match(/^\/(?:inharrime\/)?convite\/([a-f0-9]{32})(\/pdf)?$/);
  if (!match || !env.DB) return new Response('Convite não encontrado.', { status: 404 });
  await ensureInharrime(env.DB);
  let invitation = await env.DB.prepare('SELECT i.*, g.fingerprint AS generated_fingerprint FROM inharrime_invitations i LEFT JOIN inharrime_generated g ON g.invitation_id = i.id WHERE i.public_token = ?').bind(match[1]).first();
  if (!invitation || invitation.generated_fingerprint !== fingerprint(invitation)) return new Response('Este convite ainda não está disponível. Contacte os noivos.', { status: 404 });
  [invitation] = await attachSeats(env.DB,[invitation]);
  if (match[2]) return pdfResponse(request, env, [invitation], true);
  return new Response(invitationHtml(invitation), { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer' } });
}
