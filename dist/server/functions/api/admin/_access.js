const encoder = new TextEncoder();
const cookieName = '__Host-inharrime_session';
export const hashText = async value => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value))), n => n.toString(16).padStart(2, '0')).join('');
export function sameOrigin(request) {
  const origin = request.headers.get('Origin');
  return (!origin || origin === new URL(request.url).origin) && request.headers.get('Sec-Fetch-Site') !== 'cross-site';
}
const json = (body, status = 200, headers = {}) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store', ...headers } });
async function ensureAuth(db) {
  await db.batch([
    db.prepare('CREATE TABLE IF NOT EXISTS admin_sessions (token_hash TEXT PRIMARY KEY, password_revision TEXT NOT NULL, created_at TEXT NOT NULL)'),
    db.prepare('CREATE TABLE IF NOT EXISTS admin_login_attempts (bucket TEXT PRIMARY KEY, attempts INTEGER NOT NULL)'),
    db.prepare('CREATE TABLE IF NOT EXISTS protocol_sessions (token_hash TEXT PRIMARY KEY, password_revision TEXT NOT NULL, created_at TEXT NOT NULL)'),
  ]);
}
function readCookie(request) { return (request.headers.get('Cookie') ?? '').split(';').map(v => v.trim()).find(v => v.startsWith(cookieName + '='))?.slice(cookieName.length + 1) ?? ''; }
export async function requireAdmin(request, env) {
  if (!env.DB || !env.ADMIN_ALIRIO_PASSWORD_SHA256) return { ok: false, response: json({ error: 'O acesso administrativo não está disponível.' }, 503) };
  if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method) && !sameOrigin(request)) return { ok: false, response: json({ error: 'Origem não autorizada.' }, 403) };
  const token = readCookie(request);
  if (!/^[a-f0-9]{64}$/.test(token)) return { ok: false, response: json({ error: 'Inicie sessão para continuar.' }, 401) };
  await ensureAuth(env.DB);
  const session = await env.DB.prepare('SELECT password_revision FROM admin_sessions WHERE token_hash = ?').bind(await hashText(token)).first();
  if (!session || session.password_revision !== await hashText(env.ADMIN_ALIRIO_PASSWORD_SHA256)) return { ok: false, response: json({ error: 'Inicie sessão para continuar.' }, 401) };
  return { ok: true, email: 'alirio' };
}
export async function login(request, env) {
  if (!sameOrigin(request)) return json({ error: 'Origem não autorizada.' }, 403);
  if (!env.DB || !env.ADMIN_ALIRIO_PASSWORD_SHA256) return json({ error: 'O acesso não está configurado.' }, 503);
  if (!request.headers.get('Content-Type')?.includes('application/json')) return json({ error: 'Dados inválidos.' }, 415);
  let body;
  try { const raw = await request.text(); if (raw.length > 4096) throw new Error(); body = JSON.parse(raw); if (!body || typeof body !== 'object') throw new Error(); } catch { return json({ error: 'Dados inválidos.' }, 400); }
  await ensureAuth(env.DB);
  const bucket = await hashText(`${request.headers.get('CF-Connecting-IP') || 'unknown'}:${Math.floor(Date.now() / 900000)}`);
  await env.DB.prepare('INSERT INTO admin_login_attempts (bucket, attempts) VALUES (?, 1) ON CONFLICT(bucket) DO UPDATE SET attempts = attempts + 1').bind(bucket).run();
  const attempt = await env.DB.prepare('SELECT attempts FROM admin_login_attempts WHERE bucket = ?').bind(bucket).first();
  if (attempt.attempts > 20) return json({ error: 'Demasiadas tentativas. Tente novamente dentro de 15 minutos.' }, 429);
  const received = await hashText(String(body.password ?? ''));
  const username = String(body.username ?? '').trim().toLowerCase();
  const passwordHash = username === 'protocolo' ? env.PROTOCOL_PASSWORD_SHA256 : username === 'alirio' ? env.ADMIN_ALIRIO_PASSWORD_SHA256 : null;
  const expected = (passwordHash || '0'.repeat(64)).toLowerCase();
  let difference = received.length ^ expected.length;
  for (let i = 0; i < received.length; i++) difference |= received.charCodeAt(i) ^ (expected.charCodeAt(i) || 0);
  if (!passwordHash || difference) return json({ error: 'Utilizador ou senha incorrectos.' }, 401);
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const token = Array.from(bytes, value => value.toString(16).padStart(2, '0')).join('');
  const sessions = username === 'alirio' ? 'admin_sessions' : 'protocol_sessions';
  await env.DB.prepare(`INSERT INTO ${sessions} (token_hash, password_revision, created_at) VALUES (?, ?, ?)`).bind(await hashText(token), await hashText(passwordHash), new Date().toISOString()).run();
  await env.DB.prepare('DELETE FROM admin_login_attempts WHERE bucket = ?').bind(bucket).run();
  return json({ ok: true, redirect: username === 'alirio' ? '/admin' : '/protocolo' }, 200, { 'Set-Cookie': `${cookieName}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict` });
}
export async function logout(request, env) {
  if (!sameOrigin(request)) return json({ error: 'Origem não autorizada.' }, 403);
  if (env.DB) { await ensureAuth(env.DB); const hash = await hashText(readCookie(request)); await env.DB.batch(['admin_sessions','protocol_sessions'].map(table=>env.DB.prepare(`DELETE FROM ${table} WHERE token_hash = ?`).bind(hash))); }
  return json({ ok: true }, 200, { 'Set-Cookie': `${cookieName}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0` });
}
export async function requireStaff(request, env) {
  const admin = await requireAdmin(request,env);
  if (admin.ok) return { ...admin, role:'admin' };
  if (!['GET','HEAD','OPTIONS'].includes(request.method) && !sameOrigin(request)) return admin;
  if (!env.DB || !env.PROTOCOL_PASSWORD_SHA256) return admin;
  const token = readCookie(request); if (!/^[a-f0-9]{64}$/.test(token)) return admin;
  await ensureAuth(env.DB);
  const session = await env.DB.prepare('SELECT password_revision FROM protocol_sessions WHERE token_hash = ?').bind(await hashText(token)).first();
  if (!session || session.password_revision !== await hashText(env.PROTOCOL_PASSWORD_SHA256)) return admin;
  return {ok:true,email:'protocolo',role:'protocol'};
}
export function loginPage() {
  return `<!doctype html><html lang="pt-MZ"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>Entrar · Alírio e Engrácia</title><link rel="stylesheet" href="/admin.css"><link rel="stylesheet" href="/inharrime.css"><script src="/login.js" defer></script></head><body><main class="login-main"><section class="management-card"><p class="eyebrow">Convites de Inharrime e Xai-Xai</p><h1>Bem-vindo.</h1><p>Entre com a sua conta de administrador ou protocolo.</p><form id="login-form"><label>Utilizador<input name="username" autocomplete="username" required></label><label>Senha<input name="password" type="password" autocomplete="current-password" required autofocus></label><p id="login-status" role="alert"></p><button class="button button-primary" type="submit">Entrar</button></form></section></main></body></html>`;
}
