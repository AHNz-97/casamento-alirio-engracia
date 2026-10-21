import JSZip from 'jszip';
import qrcode from 'qrcode-generator';
import { categoryPath, tableLabel } from '../shared/seating.js';
import { categories, validateBatch, parseDelimited, rowsToObjects } from '../shared/inharrime.js';

const $ = id => document.getElementById(id);
let invitations = [], reviewed = null, currentPdf = null, pdfVersion = 0, saving = false;
let createRequest = null, importRequest = null;
let editing = null, deleting = null, latestRun = null, selected = new Set(), adminMessages = [];
const status = (id, message, error = false) => { $(id).textContent = message; $(id).classList.toggle('error', error); };
for (const id of ['category', 'filter-category']) categories.forEach((category, index) => $(id).add(new Option(`${index + 1}. ${category}`, category)));
const qrSection=document.createElement('section');qrSection.className='management-card';
const qrDetails=document.createElement('details'),qrTitle=document.createElement('summary'),qrGrid=document.createElement('div');qrTitle.textContent='Os 11 QR das categorias — mensagens para os noivos';qrGrid.className='category-qr-grid';
categories.forEach((category,index)=>{const card=document.createElement('article'),label=document.createElement('strong'),image=document.createElement('img'),download=document.createElement('a'),open=document.createElement('a');const qr=qrcode(0,'M');qr.addData(location.origin+categoryPath(category));qr.make();const url='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(qr.createSvgTag({cellSize:5,margin:20,scalable:true}));label.textContent=`${index+1}. ${category}`;image.src=url;image.alt=`QR de ${category}`;download.href=url;download.download=`qr-categoria-${index+1}.svg`;download.textContent='Baixar QR';open.href=categoryPath(category);open.target='_blank';open.rel='noopener';open.textContent='Abrir página de mensagens';card.append(label,image,download,open);qrGrid.append(card);});qrDetails.append(qrTitle,qrGrid);qrSection.append(qrDetails);$('message-management').before(qrSection);
document.querySelectorAll('[data-close]').forEach(button => button.addEventListener('click', () => { if (!saving) button.closest('dialog').close(); }));
document.querySelectorAll('dialog').forEach(dialog => dialog.addEventListener('cancel', event => { if (saving) event.preventDefault(); }));
$('create-open').onclick = () => { editing = null; $('create-title').textContent = 'Cadastrar convidado'; $('create-form').querySelector('[type=submit]').textContent = 'Guardar convidado'; $('create-form').reset(); createRequest = null; status('create-status', ''); $('create-dialog').showModal(); };
$('import-open').onclick = () => $('import-dialog').showModal();
$('database-open').onclick = () => { $('database').hidden = false; $('database-open').setAttribute('aria-expanded', 'true'); $('database').scrollIntoView({ behavior: 'smooth', block: 'start' }); };
$('logout').onclick = async () => { try { await api('/api/logout', { method: 'POST' }); location.replace('/login'); } catch (error) { status('status', error.message, true); } };

async function api(url, options) {
  const response = await fetch(url, { cache: 'no-store', ...options });
  if (!response.ok) {
    if (response.status === 401) { location.assign('/login'); throw new Error('Inicie sessão para continuar.'); }
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error || 'Não foi possível concluir. Actualize a página e tente novamente.');
  }
  return response;
}
function tableRow(values, labels = ['Nome', 'Pessoas', 'Categoria', 'Mesa', 'Contacto']) {
  const tr = document.createElement('tr');
  values.forEach((value, index) => { const td = document.createElement('td'); td.textContent = value || '—'; td.dataset.label = labels[index]; tr.append(td); });
  return tr;
}
function render() {
  const query = $('search').value.toLocaleLowerCase('pt');
  const category = $('filter-category').value;
  const rows = invitations.filter(row => (!category || row.category === category) && [row.recipient_name, tableLabel(row.category), row.contact_phone, ...(row.seats??[]).map(s=>s.code)].some(value => value.toLocaleLowerCase('pt').includes(query)));
  $('rows').replaceChildren();
  for (const row of rows) {
    const tr = tableRow([(row.seats??[]).map(s=>s.code).join(' · ') || 'Por atribuir', row.recipient_name, row.guest_count, row.category, tableLabel(row.category), row.contact_phone], ['Código', 'Nome', 'Pessoas', 'Categoria', 'Mesa', 'Contacto']);
    const td = document.createElement('td'); td.dataset.label = 'Convite'; td.textContent = row.generated ? 'Gerado' : 'Por gerar'; tr.append(td);
    const actions = document.createElement('td'); actions.className = 'guest-actions';
    const edit = document.createElement('button'); edit.className = 'button button-secondary'; edit.textContent = 'Editar'; edit.onclick = () => editGuest(row);
    const remove = document.createElement('button'); remove.className = 'button button-secondary'; remove.textContent = 'Apagar'; remove.onclick = () => { deleting = row; $('delete-description').textContent = `Pretende apagar “${row.recipient_name}”?`; status('delete-status', ''); $('delete-dialog').showModal(); };
    const link = document.createElement(row.generated ? 'a' : 'button'); link.textContent = 'Baixar convite digital'; link.className = 'button button-secondary';
    if (row.generated) link.href = `/api/admin/inharrime/pdf?id=${encodeURIComponent(row.id)}&download=1`; else { link.disabled = true; link.title = 'Gere o convite primeiro'; }
    actions.append(edit, remove, link); tr.append(actions); $('rows').append(tr);
  }
  $('empty').hidden = rows.length > 0;
  $('result-count').textContent = `${rows.length} de ${invitations.length} convites`;
}
function clearPdf() {
  $('pdf-frame').removeAttribute('src');
  if (currentPdf) URL.revokeObjectURL(currentPdf);
  currentPdf = null; $('pdf-preview').disabled = true; $('pdf-download').disabled = true;
}
async function openPdf(download = false) {
  const generation = ++pdfVersion;
  clearPdf();
  if (!latestRun || latestRun.stale) return;
  status('pdf-status', 'A abrir o PDF gerado…');
  try {
    const response = await api(`/api/admin/inharrime/pdf?run=${encodeURIComponent(latestRun.id)}`);
    const blob = await response.blob();
    if (generation !== pdfVersion) return;
    currentPdf = URL.createObjectURL(blob);
    $('pdf-preview').disabled = false; $('pdf-download').disabled = false;
    status('pdf-status', `PDF gerado com ${latestRun.count} convites.`);
    if (download) { const link = document.createElement('a'); link.href = currentPdf; link.download = 'convites-inharrime.pdf'; link.click(); }
    else { $('pdf-frame').src = currentPdf; $('pdf-dialog').showModal(); }
  } catch (error) { if (generation === pdfVersion) { status('pdf-status', error.message, true); $('pdf-preview').disabled = false; $('pdf-download').disabled = false; } }
}
async function reload() {
  const response = await api('/api/admin/inharrime');
  const data = await response.json(); invitations = data.invitations; latestRun = data.run;
  const s = data.summary;
  $('total').textContent = s.invitations; $('people').textContent = s.people; $('sheets').textContent = latestRun?.sheets ?? 0; $('templates').textContent = latestRun?.templates ?? 0;
  $('pages').textContent = `${latestRun?.pages ?? 0} páginas na última geração`;
  clearPdf(); pdfVersion++;
  $('pdf-preview').disabled = !latestRun || latestRun.stale; $('pdf-download').disabled = !latestRun || latestRun.stale;
  status('pdf-status', !latestRun ? 'Nenhum PDF gerado. Use “Ver base de dados” e depois “Gerar PDF”.' : latestRun.stale ? 'A lista usada neste PDF foi alterada. Gere novamente os convites.' : `${latestRun.count} convites no último PDF · ${s.invitations - s.generated} registos por gerar.`);
  render();
}
$('refresh').onclick = async () => { $('refresh').disabled = true; try { await reload(); status('status', 'Lista actualizada.'); } catch (error) { status('status', error.message, true); } finally { $('refresh').disabled = false; } };
$('search').oninput = render; $('filter-category').onchange = render;
$('pdf-preview').onclick = () => openPdf();
$('pdf-download').onclick = () => openPdf(true);

async function save(rows, type) {
  if (type === 'create' && editing) {
    await api('/api/admin/inharrime', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...rows[0], id: editing.id, revision: editing.revision }) }); return;
  }
  const payload = JSON.stringify(rows);
  let request = type === 'create' ? createRequest : importRequest;
  if (!request || request.payload !== payload) request = { payload, id: crypto.randomUUID() };
  if (type === 'create') createRequest = request; else importRequest = request;
  await api('/api/admin/inharrime', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ requestId: request.id, invitations: rows }) });
}
async function submit(rows, type) {
  if (saving) return;
  saving = true;
  const dialog = $(type === 'create' ? 'create-dialog' : 'import-dialog');
  dialog.querySelectorAll('button, input, textarea, select').forEach(el => el.disabled = true);
  status(`${type}-status`, 'A guardar os convites…');
  let saved = false;
  try {
    await save(rows, type); saved = true; dialog.close();
    if (type === 'import') { reviewed = null; importRequest = null; $('import-text').value = ''; $('import-file').value = ''; $('import-review').hidden = true; }
    await reload(); status('status', `${rows.length} ${rows.length === 1 ? 'convidado guardado' : 'convidados guardados'}. Abra a base de dados para gerar os convites.`);
  } catch (error) { status(saved ? 'status' : `${type}-status`, saved ? `Os convites foram guardados. Não foi possível actualizar a lista: ${error.message}` : error.message, true); }
  finally { saving = false; dialog.querySelectorAll('button, input, textarea, select').forEach(el => el.disabled = false); $('import-save').disabled = !reviewed; }
}
$('create-form').onsubmit = async event => {
  event.preventDefault();
  try { await submit(validateBatch([Object.fromEntries(new FormData(event.currentTarget))]), 'create'); }
  catch (error) { status('create-status', error.message, true); }
};
function invalidateReview() { reviewed = null; importRequest = null; $('import-review').hidden = true; $('import-save').disabled = true; status('import-status', ''); }
$('import-text').oninput = () => { $('import-file').value = ''; invalidateReview(); };
$('import-file').onchange = () => { $('import-text').value = ''; invalidateReview(); };

async function readImport() {
  const file = $('import-file').files[0];
  if (file && file.size > 10 * 1024 * 1024) throw new Error('O ficheiro deve ter no máximo 10 MB.');
  if (file?.name.toLowerCase().endsWith('.docx')) {
    const zip = await JSZip.loadAsync(await file.arrayBuffer());
    const entry = zip.file('word/document.xml');
    if (!entry || entry._data?.uncompressedSize > 5 * 1024 * 1024) throw new Error('Documento Word inválido ou demasiado grande.');
    const xml = new DOMParser().parseFromString(await entry.async('string'), 'application/xml');
    if (xml.getElementsByTagName('parsererror').length) throw new Error('Não foi possível ler o documento Word.');
    const tables = Array.from(xml.getElementsByTagNameNS('*', 'tbl'));
    if (!tables.length) throw new Error('O Word deve conter uma tabela com cabeçalhos e um convidado por linha.');
    return tables.flatMap(table => rowsToObjects(Array.from(table.children).filter(el => el.localName === 'tr').map(row => Array.from(row.children).filter(el => el.localName === 'tc').map(cell => Array.from(cell.getElementsByTagNameNS('*', 't')).map(text => text.textContent).join('')))));
  }
  const source = (file ? await file.text() : $('import-text').value).replace(/^\uFEFF/, '').trim();
  if (!source) throw new Error('Cole uma lista ou escolha um documento.');
  if (source.startsWith('[') || source.startsWith('{')) {
    let data;
    try { data = JSON.parse(source); } catch { throw new Error('O JSON não é válido. Verifique as aspas e as vírgulas.'); }
    return Array.isArray(data) ? data : data.convidados ?? data.invitations ?? [data];
  }
  return parseDelimited(source);
}
$('import-validate').onclick = async () => {
  invalidateReview(); $('import-validate').disabled = true;
  try {
    reviewed = validateBatch(await readImport());
    $('review-rows').replaceChildren(...reviewed.map(row => tableRow([row.recipientName, row.guestCount, row.category, tableLabel(row.category), row.contactPhone])));
    $('review-title').textContent = `${reviewed.length} convites · ${reviewed.reduce((sum, row) => sum + row.guestCount, 0)} pessoas`;
    $('import-review').hidden = false; $('import-save').disabled = false; $('import-save').textContent = `Criar ${reviewed.length} convites`;
    status('import-status', 'Lista validada. Reveja os dados antes de criar.');
  } catch (error) { reviewed = null; status('import-status', error.message, true); }
  finally { $('import-validate').disabled = false; }
};
$('import-save').onclick = () => { if (reviewed) submit(reviewed, 'import'); };
function editGuest(row) {
  editing = row; const form = $('create-form');
  form.elements.recipientName.value = row.recipient_name; form.elements.guestCount.value = row.guest_count;
  form.elements.category.value = row.category; form.elements.tableName.value = tableLabel(row.category); form.elements.contactPhone.value = row.contact_phone;
  $('create-title').textContent = 'Editar convidado'; form.querySelector('[type=submit]').textContent = 'Guardar alterações';
  status('create-status', 'Depois de alterar, gere novamente o convite.'); $('create-dialog').showModal();
}
$('delete-confirm').onclick = async () => {
  if (!deleting || saving) return; saving = true; $('delete-confirm').disabled = true;
  try {
    await api('/api/admin/inharrime', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: deleting.id, revision: deleting.revision }) });
    $('delete-dialog').close(); await reload(); await loadMessages(); status('status', 'Convidado apagado.');
  } catch (error) { status('delete-status', error.message, true); }
  finally { saving = false; $('delete-confirm').disabled = false; }
};
function selectionCount() {
  $('selection-count').textContent = `${selected.size} de ${invitations.length} convidados seleccionados · ${Math.ceil(selected.size / 4) * 2} páginas A4`;
  $('generate-save').disabled = !selected.size;
  $('generate-all').checked = selected.size === invitations.length && invitations.length > 0;
  $('generate-all').indeterminate = selected.size > 0 && selected.size < invitations.length;
}
function renderSelection() {
  $('generate-list').replaceChildren(...invitations.map(row => {
    const label = document.createElement('label'), input = document.createElement('input'), copy = document.createElement('span');
    input.type = 'checkbox'; input.checked = selected.has(row.id); input.dataset.id = row.id;
    copy.textContent = `${row.seats?.[0]?.code || 'Por atribuir'} · ${row.recipient_name} · ${row.guest_count} pessoa(s)`;
    input.onchange = () => { if (input.checked) selected.add(row.id); else selected.delete(row.id); selectionCount(); };
    label.append(input, copy); return label;
  })); selectionCount();
}
$('generate-open').onclick = () => { selected = new Set(invitations.map(row => row.id)); renderSelection(); status('generate-status', ''); $('generate-dialog').showModal(); };
$('generate-all').onchange = () => { selected = $('generate-all').checked ? new Set(invitations.map(row => row.id)) : new Set(); renderSelection(); };
$('generate-save').onclick = async () => {
  if (!selected.size || saving) return; saving = true;
  $('generate-dialog').querySelectorAll('button,input').forEach(el => el.disabled = true);
  status('generate-status', 'A gerar os convites seleccionados. Aguarde…');
  try {
    const response = await api('/api/admin/inharrime/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: [...selected] }) });
    const result = await response.json(); $('generate-dialog').close(); await reload();
    status('status', `${result.invitations} convites gerados em ${result.pages} páginas. Pode baixar o PDF A4 e os convites digitais.`);
  } catch (error) { status('generate-status', error.message, true); }
  finally { saving = false; $('generate-dialog').querySelectorAll('button,input').forEach(el => el.disabled = false); selectionCount(); }
};
async function loadMessages() {
  try { const data = await (await api('/api/admin/guest-messages')).json(); adminMessages = data.messages; renderMessages(); }
  catch (error) { status('moderation-status', error.message, true); }
}
function renderMessages() {
  const filter = $('message-filter').value;
  const rows = adminMessages.filter(row => !filter || row.moderation_status === filter);
  $('moderation-list').replaceChildren();
  status('moderation-status', `${rows.length} mensagens · ${adminMessages.filter(row => row.moderation_status === 'pending').length} por aprovar`);
  const labels = { pending: 'Pendente', approved: 'Aprovada', hidden: 'Ocultada' };
  rows.forEach(row => {
    const article = document.createElement('article'); article.className = 'moderation-card';
    if (row.photo_url) { const photoLink = document.createElement('a'); photoLink.href = row.photo_url; photoLink.target = '_blank'; photoLink.rel = 'noopener'; const image = document.createElement('img'); image.src = row.photo_url; image.alt = `Fotografia enviada por ${row.name}`; image.loading = 'lazy'; photoLink.append(image); article.append(photoLink); }
    const copy = document.createElement('div'), name = document.createElement('strong'), text = document.createElement('p'), detail = document.createElement('small'), actions = document.createElement('div');
    name.textContent = row.name; text.textContent = row.message; detail.textContent = `${labels[row.moderation_status]} · Convite: ${row.invitation_recipient}`; actions.className = 'admin-actions';
    for (const [next, label] of [['approved', 'Aprovar'], ['hidden', 'Ocultar']]) {
      if (next === row.moderation_status) continue;
      const button = document.createElement('button'); button.className = 'button button-secondary'; button.textContent = label;
      button.onclick = async () => { button.disabled = true; try { await api('/api/admin/guest-messages', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: row.id, source:row.source, status: next, currentStatus: row.moderation_status }) }); await loadMessages(); } catch (error) { status('moderation-status', error.message, true); button.disabled = false; } };
      actions.append(button);
    }
    copy.append(name, text, detail, actions); article.append(copy); $('moderation-list').append(article);
  });
}
$('message-filter').onchange = renderMessages;
loadMessages(); setInterval(loadMessages, 30000);
reload().then(() => status('status', '')).catch(error => status('status', error.message, true));
