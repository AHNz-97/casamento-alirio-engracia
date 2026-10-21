const key = value => value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/[^a-z]/g, '');
export function validateBadges(rows) {
  if (!Array.isArray(rows) || !rows.length || rows.length > 500) throw new Error('Envie entre 1 e 500 crachás.');
  return rows.map((row, index) => {
    if (!row || typeof row !== 'object' || Array.isArray(row)) throw new Error(`Linha ${index + 1}: dados inválidos.`);
    const values = Object.fromEntries(Object.entries(row).map(([k, v]) => [key(k), v]));
    const name = values.nome ?? values.name ?? values.nomecompleto;
    const role = values.funcao ?? values.role ?? values.cargo;
    if (typeof name !== 'string' || !name.trim() || name.trim().length > 120) throw new Error(`Linha ${index + 1}: indique um nome até 120 caracteres.`);
    if (typeof role !== 'string' || !role.trim() || role.trim().length > 60) throw new Error(`Linha ${index + 1}: indique uma função até 60 caracteres.`);
    if (/[\x00-\x1f\x7f]/.test(name + role)) throw new Error(`Linha ${index + 1}: retire os caracteres de controlo.`);
    return { name: name.trim(), role: role.trim() };
  });
}
export const badgeRevision = row => JSON.stringify([row.id, row.name, row.role, ...(row.photo_key ? [row.photo_key] : [])]);
export function badgeSummary(count, model) { const perPage = model === 'horizontal' ? 6 : 4; return { count, perPage, pages: Math.ceil(count / perPage), templates: (perPage - count % perPage) % perPage }; }
