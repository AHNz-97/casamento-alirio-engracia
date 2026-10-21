import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { PDFDocument, PDFName } from 'pdf-lib';
import { validateBatch, parseDelimited, sheetSummary, categories } from '../shared/inharrime.js';
import { onRequestPost, onRequestGet, onRequestPdf, onRequestGenerate, onRequestPut, onRequestDelete } from '../functions/api/admin/inharrime.js';
import { publicInvitation } from '../lib/inharrime-public.js';
import { login, logout, requireAdmin } from '../functions/api/admin/_access.js';
import { submitMessage, listMessages, moderateMessage, servePhoto } from '../functions/api/guest-messages.js';

function database() {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  return {
    prepare(sql) {
      const statement = () => db.prepare(sql); let bindings = [];
      return {
        bind(...values) { bindings = values; return this; },
        async first() { return statement().get(...bindings) ?? null; },
        async all() { return { results: statement().all(...bindings) }; },
        async run() { return { meta: statement().run(...bindings) }; },
      };
    },
    async batch(statements) {
      db.exec('BEGIN');
      try { const results = []; for (const statement of statements) results.push(await statement.run()); db.exec('COMMIT'); return results; }
      catch (error) { db.exec('ROLLBACK'); throw error; }
    },
  };
}
const headers = { 'Content-Type': 'application/json' };
const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode('test-password'))), x => x.toString(16).padStart(2, '0')).join('');
const stored = new Map();
const env = {
  DB: database(), ADMIN_ALIRIO_PASSWORD_SHA256: hash,
  ASSETS: { async fetch(request) { return new Response(await readFile(new URL(`../${new URL(request.url).pathname.slice(1)}`, import.meta.url))); } },
  PDFS: { async get(key) { return stored.has(key) ? { body: stored.get(key) } : null; }, async put(key, bytes) { stored.set(key, bytes); }, async delete(key) { stored.delete(key); } },
};
const jsonRequest = (path, body, method = 'POST', extraHeaders = {}) => new Request(`https://example.com${path}`, { method, headers: { ...headers, ...extraHeaders }, body: JSON.stringify(body) });
async function signIn(username = 'alirio', password = 'test-password') { return login(jsonRequest('/api/login', { username, password }), env); }
async function generate(ids) { return onRequestGenerate({ request: jsonRequest('/api/admin/inharrime/generate', { ids }), env }); }
function post(rows, id = crypto.randomUUID()) { return onRequestPost({ request: new Request('https://example.com/api/admin/inharrime', { method: 'POST', headers, body: JSON.stringify({ requestId: id, invitations: rows }) }), env }); }
async function list() { return (await onRequestGet({ request: new Request('https://example.com/api/admin/inharrime', { headers }), env })).json(); }

test('optional fields, all categories and strict quantities', () => {
  assert.equal(validateBatch([{ nome: 'João', pessoas: 2 }])[0].category, '');
  categories.forEach((category, index) => assert.equal(validateBatch([{ nome: 'Ana', pessoas: 1, categoria: index + 1 }])[0].category, category));
  for (const value of [0, -1, 1.5, '2abc', '2.1', '', 201, null]) assert.throws(() => validateBatch([{ nome: 'Ana', pessoas: value }]));
  assert.throws(() => validateBatch([{ nome: 'Ana', pessoas: 1, categoria: 'Não existe' }]));
  assert.throws(() => validateBatch([{ nome: '', pessoas: 1 }]));
  const csv = 'Nome do convidado;Número de convidados;Categoria\r\n"Família; Nhamize";4;Família\r\nMaria;1;';
  assert.equal(validateBatch(parseDelimited(csv))[0].recipientName, 'Família; Nhamize');
  assert.throws(() => parseDelimited('Nome;Pessoas\nAna;1;extra'));
  assert.throws(() => parseDelimited('Nome;Pessoas\n"Ana;1'));
});

test('only alirio can log in; session survives requests and logout revokes it', async () => {
  assert.equal((await signIn('engracia')).status, 401);
  assert.equal((await signIn('alirio', 'wrong-password')).status, 401);
  const signed = await signIn(); assert.equal(signed.status, 200);
  const cookie = signed.headers.get('Set-Cookie');
  assert.match(cookie, /HttpOnly/); assert.match(cookie, /Secure/); assert.match(cookie, /SameSite=Strict/); assert.doesNotMatch(cookie, /Max-Age|Expires/);
  headers.Cookie = cookie.split(';')[0];
  for (let i = 0; i < 3; i++) assert.equal((await requireAdmin(new Request('https://example.com/admin', { headers }), env)).ok, true);
  assert.equal((await requireAdmin(new Request('https://example.com/admin', { headers: { Authorization: `Basic ${btoa('alirio:test-password')}` } }), env)).ok, false);
  assert.equal((await requireAdmin(new Request('https://example.com/admin', { headers: { Cookie: '__Host-inharrime_session=' + 'f'.repeat(64) } }), env)).ok, false);
  assert.equal((await requireAdmin(jsonRequest('/api/admin/inharrime', {}, 'POST', { Origin: 'https://another.example' }), env)).response.status, 403);
  assert.equal((await logout(jsonRequest('/api/logout', {}), env)).status, 200);
  assert.equal((await requireAdmin(new Request('https://example.com/admin', { headers }), env)).ok, false);
  headers.Cookie = (await signIn()).headers.get('Set-Cookie').split(';')[0];
});

test('registration, selected generation, digital PDF, edits, photo moderation and deletion', async () => {
  const denied = await onRequestGet({ request: new Request('https://example.com/api/admin/inharrime'), env });
  assert.equal(denied.status, 401);
  const names = ['Família Nhamize', 'Maria e João', 'Engrácia Nhancumbe', 'Convidado Quatro', 'Família Cinco', 'Convidado Seis'];
  const rows = names.map((nome, index) => ({ nome, pessoas: index + 1, categoria: index + 1, mesa: index + 1, contacto: '841234567' }));
  const requestId = crypto.randomUUID();
  assert.equal((await post(rows, requestId)).status, 201);
  assert.equal((await post(rows, requestId)).status, 200);
  assert.equal((await list()).invitations.length, 6);
  assert.deepEqual(sheetSummary(6), { invitations: 6, sheets: 2, pages: 4, templates: 2 });
  assert.equal((await post([{ nome: 'Outra pessoa', pessoas: 1, categoria:1 }], requestId)).status, 409);
  assert.equal((await post([{ nome: 'Válido', pessoas: 1 }, { nome: '', pessoas: 1 }])).status, 400);
  assert.equal((await list()).invitations.length, 6);
  await mkdir('output/pdf', { recursive: true });
  const pdfRequest = () => new Request('https://example.com/api/admin/inharrime/pdf', { headers });
  assert.equal((await onRequestPdf({ request: pdfRequest(), env })).status, 404);
  const registered = (await list()).invitations;
  assert.equal(registered.every(row => !row.generated), true);
  assert.equal((await onRequestPdf({ request: new Request(`https://example.com/api/admin/inharrime/pdf?id=${registered[0].id}`, { headers }), env })).status, 409);
  assert.equal((await generate([])).status, 400);
  assert.equal((await generate([registered[0].id, 'missing-id'])).status, 409);
  assert.equal((await generate(registered.slice(0, 5).map(row => row.id))).status, 200);
  assert.equal((await list()).summary.generated, 5);
  assert.equal((await publicInvitation(new Request(`https://example.com/convite/${registered[5].public_token}`), env)).status, 404);
  assert.equal((await generate(registered.map(row => row.id))).status, 200);
  let pdf = await onRequestPdf({ request: pdfRequest(), env });
  let bytes = new Uint8Array(await pdf.arrayBuffer());
  assert.equal((await PDFDocument.load(bytes)).getPageCount(), 4);
  await writeFile('output/pdf/teste-6-convites.pdf', bytes);
  assert.equal((await post([{ nome: 'Sétimo Convidado', pessoas: 1, categoria:1 }, { nome: 'Oitavo Convidado', pessoas: 2, categoria:1 }, { nome: 'Nono Convidado', pessoas: 3, categoria:1 }])).status, 201);
  const data = await list();
  assert.equal(data.invitations.length, 9); assert.equal(data.summary.pages, 6); assert.equal(data.summary.templates, 3);
  assert.equal(data.invitations.at(-1).sequence, 9);
  assert.deepEqual(data.invitations.slice(0, 6).map(row => row.recipient_name), names);
  assert.equal(data.run.count, 6, 'registration does not silently generate a new PDF');
  assert.equal((await generate(data.invitations.map(row => row.id))).status, 200);
  pdf = await onRequestPdf({ request: pdfRequest(), env }); bytes = new Uint8Array(await pdf.arrayBuffer());
  const doc = await PDFDocument.load(bytes);
  assert.equal(doc.getPageCount(), 6);
  assert.ok(Math.abs(doc.getPage(0).getWidth() - 595.28) < 2, 'A4 width');
  assert.ok(Math.abs(doc.getPage(0).getHeight() - 841.89) < 2, 'A4 height');
  await writeFile('output/pdf/teste-9-convites.pdf', bytes);
  const cacheCount = stored.size; await onRequestPdf({ request: pdfRequest(), env }); assert.equal(stored.size, cacheCount);
  const first = data.invitations[0];
  const publicPage = await publicInvitation(new Request(`https://example.com/convite/${first.public_token}`), env);
  const html = await publicPage.text(); assert.ok(html.includes(first.recipient_name)); assert.ok(!html.includes('841234567')); assert.ok(!html.includes('table_name'));
  assert.ok(html.includes('10h00')); assert.ok(html.includes('12h30')); assert.ok(!html.includes('name="attendance"')); assert.ok(html.includes('/mensagem/categoria/1'));
  const individual = await publicInvitation(new Request(`https://example.com/convite/${first.public_token}/pdf`), env);
  const singleBytes = new Uint8Array(await individual.arrayBuffer());
  const single = await PDFDocument.load(singleBytes); assert.equal(single.getPageCount(), 1);
  const annotation = single.getPage(0).node.Annots().lookup(0);
  assert.equal(annotation.lookup(PDFName.of('A')).lookup(PDFName.of('URI')).decodeText(), `https://example.com/convite/${first.public_token}`);
  await writeFile('output/pdf/teste-individual.pdf', singleBytes);
  const edit = { id: first.id, revision: first.revision, recipientName: 'Família Nhamize Actualizada', guestCount: 5, category: 'Família', tableName: 'Girassol', contactPhone: first.contact_phone };
  assert.equal((await onRequestPut({ request: jsonRequest('/api/admin/inharrime', edit, 'PUT'), env })).status, 200);
  assert.equal((await onRequestPut({ request: jsonRequest('/api/admin/inharrime', edit, 'PUT'), env })).status, 409);
  assert.equal((await list()).run.stale, true);
  assert.equal((await onRequestPdf({ request: pdfRequest(), env })).status, 409);
  assert.equal((await generate((await list()).invitations.map(row => row.id))).status, 200);
  const updated = (await list()).invitations[0]; assert.equal(updated.generated, true);
  assert.equal((await list()).run.stale, false);

  const messageId = crypto.randomUUID();
  const makeMessage = () => {
    const form = new FormData(); form.set('name', 'Visitante <script>'); form.set('message', 'Felicidades aos noivos!'); form.set('requestId', messageId);
    form.set('photo', new Blob([Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6V9cAAAAASUVORK5CYII=', 'base64')], { type: 'image/png' }), 'photo.png');
    return new Request(`https://example.com/api/guest-messages/${first.public_token}`, { method: 'POST', body: form });
  };
  assert.equal((await submitMessage(makeMessage(), env, first.public_token)).status, 201);
  assert.equal((await submitMessage(makeMessage(), env, first.public_token)).status, 200);
  assert.equal((await listMessages(new Request('https://example.com/api/messages'), env)).status, 401);
  let visible = await (await listMessages(new Request('https://example.com/api/messages', { headers }), env)).json(); assert.equal(visible.messages.length, 0);
  const adminRequest = new Request('https://example.com/api/admin/guest-messages', { headers });
  let moderation = await (await listMessages(adminRequest, env, true)).json(); assert.equal(moderation.messages.length, 1);
  const message = moderation.messages[0]; assert.ok(message.photo_url);
  assert.equal((await servePhoto(new Request('https://example.com' + message.photo_url), env, message.id)).status, 404);
  assert.equal((await servePhoto(new Request('https://example.com' + message.photo_url, { headers }), env, message.id)).status, 200);
  assert.equal((await moderateMessage(jsonRequest('/api/admin/guest-messages', { id: message.id, status: 'approved', currentStatus: 'pending' }, 'PUT'), env)).status, 200);
  assert.equal((await listMessages(new Request('https://example.com/api/messages'), env)).status, 401);
  visible = await (await listMessages(new Request('https://example.com/api/messages', { headers }), env)).json(); assert.equal(visible.messages.length, 1); assert.ok(visible.messages[0].photo_url); assert.ok(!JSON.stringify(visible).includes(first.contact_phone));
  assert.equal((await servePhoto(new Request('https://example.com' + message.photo_url), env, message.id)).status, 404);
  assert.equal((await moderateMessage(jsonRequest('/api/admin/guest-messages', { id: message.id, status: 'hidden', currentStatus: 'approved' }, 'PUT'), env)).status, 200);
  assert.equal((await servePhoto(new Request('https://example.com' + message.photo_url), env, message.id)).status, 404);
  const textForm = new FormData(); textForm.set('name', 'Maria'); textForm.set('message', 'Uma vida feliz!'); textForm.set('requestId', crypto.randomUUID());
  assert.equal((await submitMessage(new Request('https://example.com/api/guest-messages/' + first.public_token, { method: 'POST', body: textForm }), env, first.public_token)).status, 201);
  moderation = await (await listMessages(adminRequest, env, true)).json(); assert.equal(moderation.messages.find(row => row.name === 'Maria').photo_url, null);
  const beforeDelete = stored.size;
  assert.equal((await onRequestDelete({ request: jsonRequest('/api/admin/inharrime', { id: updated.id, revision: updated.revision }, 'DELETE'), env })).status, 200);
  assert.equal((await list()).invitations.length, 8); assert.equal((await list()).run.stale, true);
  assert.equal((await publicInvitation(new Request(`https://example.com/convite/${first.public_token}`), env)).status, 404);
  assert.equal((await (await listMessages(adminRequest, env, true)).json()).messages.length, 0);
  assert.equal(stored.size, beforeDelete - 1, 'deleted guest photo removed from storage');
});
