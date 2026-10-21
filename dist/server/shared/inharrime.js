export const categories = [
  'Família', 'Tios', 'Irmãos', 'Amigos', 'Vizinhos', 'Convidados da igreja',
  'Colegas da escola / formadores do ensino técnico', 'Colegas da função pública',
  'Estrutura do bairro', 'Membros do Governo do distrito', 'Convidados dos padrinhos',
];

export const normalizeKey = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
const aliases = {
  recipientName: ['recipientname', 'nome', 'nomedoconvidado', 'convidado', 'destinatario'],
  guestCount: ['guestcount', 'guestlimit', 'numerodeconvidados', 'numeroconvidados', 'convidados', 'pessoas', 'quantidade', 'numerodepessoas'],
  category: ['category', 'categoria'],
  tableName: ['tablename', 'mesa'],
  contactPhone: ['contactphone', 'contacto', 'contato', 'telefone', 'whatsapp'],
};

export function normalizeInvitation(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Cada convite deve ser um objecto com nome e número de convidados.');
  const mapped = Object.fromEntries(Object.entries(input).map(([key, value]) => [normalizeKey(key), value]));
  const fields = Object.fromEntries(Object.entries(aliases).map(([key, names]) => [key, names.map(name => mapped[name]).find(value => value !== undefined) ?? '']));
  const text = (value, label, max) => {
    if (!['string', 'number'].includes(typeof value)) throw new Error(`${label}: valor inválido.`);
    const result = String(value).normalize('NFC').trim().replace(/\s+/g, ' ');
    if (result.length > max || /[\x00-\x1f\x7f]/.test(result)) throw new Error(`${label}: máximo de ${max} caracteres.`);
    return result;
  };
  const recipientName = text(fields.recipientName, 'Nome', 120);
  if (!recipientName) throw new Error('O nome do convidado é obrigatório.');
  const rawCount = String(fields.guestCount).trim();
  if (!/^\d+$/.test(rawCount)) throw new Error('O número de convidados deve ser um inteiro entre 1 e 200.');
  const guestCount = Number(rawCount);
  if (guestCount < 1 || guestCount > 200) throw new Error('O número de convidados deve estar entre 1 e 200.');
  const rawCategory = text(fields.category, 'Categoria', 100);
  const category = !rawCategory ? '' : categories.find((value, index) => normalizeKey(value) === normalizeKey(rawCategory) || String(index + 1) === rawCategory);
  if (category === undefined) throw new Error('Escolha uma das 11 categorias ou deixe a categoria vazia.');
  return { recipientName, guestCount, category, tableName: text(fields.tableName, 'Mesa', 120), contactPhone: text(fields.contactPhone, 'Contacto', 40) };
}

export function validateBatch(rows) {
  if (!Array.isArray(rows) || !rows.length || rows.length > 500) throw new Error('Introduza entre 1 e 500 convites por importação.');
  return rows.map((row, index) => {
    try { return normalizeInvitation(row); }
    catch (error) { throw new Error(`Convite ${index + 1}: ${error.message}`); }
  });
}

export function sheetSummary(count) {
  const sheets = Math.ceil(count / 4);
  return { invitations: count, sheets, pages: sheets * 2, templates: sheets * 4 - count };
}

export function parseDelimited(source) {
  const text = source.replace(/^\uFEFF/, '');
  const firstLine = text.split(/\r?\n/, 1)[0];
  const delimiter = firstLine.includes('\t') ? '\t' : firstLine.includes(';') ? ';' : ',';
  const rows = []; let row = [], cell = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"') {
      if (quoted && text[i + 1] === '"') { cell += '"'; i++; }
      else quoted = !quoted;
    } else if (!quoted && char === delimiter) { row.push(cell); cell = ''; }
    else if (!quoted && (char === '\n' || char === '\r')) {
      if (char === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); if (row.some(value => value.trim())) rows.push(row); row = []; cell = '';
    } else cell += char;
  }
  if (quoted) throw new Error('Existe um campo com aspas por fechar no documento.');
  row.push(cell); if (row.some(value => value.trim())) rows.push(row);
  return rowsToObjects(rows);
}

export function rowsToObjects(rows) {
  if (rows.length < 2) throw new Error('O documento deve ter cabeçalhos e pelo menos um convidado.');
  const headers = rows[0].map(value => String(value).trim());
  if (new Set(headers.map(normalizeKey)).size !== headers.length) throw new Error('Existem cabeçalhos repetidos.');
  return rows.slice(1).map((cells, index) => {
    if (cells.length !== headers.length) throw new Error(`Linha ${index + 2}: o número de colunas não corresponde aos cabeçalhos.`);
    return Object.fromEntries(headers.map((header, i) => [header, cells[i]]));
  });
}
