document.getElementById('login-form').addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget, button = form.querySelector('button'), status = document.getElementById('login-status');
  button.disabled = true; status.textContent = 'A entrar…';
  try {
    const response = await fetch('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(Object.fromEntries(new FormData(form))) });
    const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Não foi possível entrar.');
    location.replace(data.redirect === '/protocolo' ? '/protocolo' : '/admin');
  } catch (error) { status.textContent = error.message; button.disabled = false; }
});
