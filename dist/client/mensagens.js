const $ = id => document.getElementById(id);
const card=$('message-card'), text=$('message-text'), name=$('message-name'), photo=$('message-photo'), copy=$('message-copy');
let messages=[], index=0, paused=false, timer=null, renderVersion=0;
function fitText() {
  if (!copy.clientHeight) return;
  let size=Math.min(messages[index]?.photo_url || messages[index]?.table_label ? 64 : 88, Math.max(28, innerWidth * .045));
  text.style.fontSize=size+'px';
  while(copy.scrollHeight > copy.clientHeight + 1 && size>15) { size-=1; text.style.fontSize=size+'px'; }
}
function progress() {
  $('progress-bar').classList.remove('running'); void $('progress-bar').offsetWidth;
  if (!paused && messages.length) $('progress-bar').classList.add('running');
}
function render() {
  const version=++renderVersion, selected=messages[index];
  photo.hidden=true; photo.removeAttribute('src'); card.classList.remove('has-photo');
  $('table-placeholder').hidden=true;
  text.textContent=selected?.message || 'As mensagens e fotografias aprovadas aparecerão aqui.';
  name.textContent=selected?.name || 'Alírio & Engrácia';
  $('message-counter').textContent=selected ? `${index+1} de ${messages.length}` : 'A aguardar mensagens';
  card.classList.toggle('waiting',!selected);
  if(selected?.table_label&&!selected.photo_url){$('table-label').textContent=selected.table_label;$('table-placeholder').hidden=false;card.classList.add('has-photo');}
  if(selected?.photo_url) {
    photo.onload=() => { if(version!==renderVersion) return; photo.hidden=false; card.classList.add('has-photo'); requestAnimationFrame(fitText); };
    photo.onerror=() => { if(version!==renderVersion) return; photo.hidden=true; if(selected.table_label){card.classList.add('has-photo');$('table-label').textContent=selected.table_label;$('table-placeholder').hidden=false;}else card.classList.remove('has-photo'); requestAnimationFrame(fitText); };
    photo.alt=`Fotografia de ${selected.name}`; photo.src=selected.photo_url;
  }
  requestAnimationFrame(fitText); progress();
}
function startTimer() { clearInterval(timer); if(!paused && messages.length>1) timer=setInterval(()=>move(1),14000); }
function move(direction) { if(!messages.length) return; index=(index+direction+messages.length)%messages.length; render(); startTimer(); }
async function refresh() {
  try {
    const response=await fetch(document.body.dataset.messagesEndpoint||'/api/messages',{cache:'no-store'}); if(!response.ok) throw new Error();
    const data=await response.json(), current=messages[index]?.id;
    const next=data.messages || [];
    if(JSON.stringify(next)!==JSON.stringify(messages)) { messages=next; index=Math.max(0,messages.findIndex(row=>row.id===current)); render(); startTimer(); }
    $('connection-state').textContent=`${messages.length} mensagens aprovadas`;
  } catch { $('connection-state').textContent='Ligação interrompida. A tentar novamente…'; }
}
$('pause-button').onclick=()=>{paused=!paused;$('pause-button').textContent=paused?'Continuar':'Pausar';$('pause-button').setAttribute('aria-pressed',String(paused));progress();startTimer();};
$('previous-button').onclick=()=>move(-1);$('next-button').onclick=()=>move(1);
$('fullscreen-button').onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();}catch{$('connection-state').textContent='Ecrã inteiro indisponível neste dispositivo.';}};
addEventListener('resize',fitText);document.fonts?.ready.then(fitText);
addEventListener('keydown',event=>{if(event.target.closest('button,a,input,textarea'))return;if(event.key==='ArrowLeft')move(-1);if(event.key==='ArrowRight')move(1);if(event.key===' '){event.preventDefault();$('pause-button').click();}if(event.key.toLowerCase()==='f')$('fullscreen-button').click();});
render();refresh();setInterval(refresh,15000);
