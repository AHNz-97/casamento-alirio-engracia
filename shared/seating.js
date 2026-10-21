import { categories } from './inharrime.js';
export const tablePrefixes = Array.from({length:25},(_,i)=>`${Math.floor(i/5)}${'ABCDE'[i%5]}`);
export const tableNumber = prefix => tablePrefixes.indexOf(prefix)+1;
const tableNames = ['Mesa da família','Mesa dos tios','Mesa dos irmãos','Mesa dos amigos','Mesa dos vizinhos','Mesa dos convidados da igreja','Mesa dos colegas da escola / formadores do ensino técnico','Mesa dos colegas da função pública','Mesa da estrutura do bairro','Mesa dos membros do Governo do distrito','Mesa dos convidados dos padrinhos'];
export const tableLabel = category => tableNames[categories.indexOf(category)] || 'Mesa dos convidados';
export const categoryId = category => categories.indexOf(category)+1;
export const categoryPath = category => `/mensagem/categoria/${categoryId(category)}`;
export function seatLabel(code,category) { return `${tableLabel(category)} · Cadeira ${Number(code.slice(2))+1}`; }
export function planSeats(tables, occupied, invitations) {
  const owners=new Map(tables.map(t=>[t.prefix,t.category])),used=new Set(occupied.map(s=>s.code)),seats=[];
  for(const invitation of invitations){
    if(!categories.includes(invitation.category))throw new Error(`Indique a categoria de ${invitation.recipient_name || 'cada convidado'} antes de atribuir lugares.`);
    for(let ordinal=0;ordinal<invitation.guest_count;ordinal++){
      let prefix=tablePrefixes.find(p=>owners.get(p)===invitation.category&&Array.from({length:10},(_,i)=>p+String(i).padStart(2,'0')).some(c=>!used.has(c)));
      if(!prefix)prefix=tablePrefixes.find(p=>!owners.has(p)) || tablePrefixes.find(p=>!Array.from(used).some(c=>c.startsWith(p)));
      if(!prefix)throw new Error('Não há mesas livres para esta categoria. Existem 25 mesas com 10 cadeiras; categorias diferentes não partilham a mesma mesa.');
      owners.set(prefix,invitation.category);
      const code=Array.from({length:10},(_,i)=>prefix+String(i).padStart(2,'0')).find(c=>!used.has(c));
      used.add(code);seats.push({code,prefix,category:invitation.category,invitation_id:invitation.id,ordinal});
    }
  }
  return {seats,tables:[...owners].map(([prefix,category])=>({prefix,category}))};
}
