import JSZip from 'jszip';

export function readyBadgePdfs(runs){
  const pair=['horizontal','vertical'].map(model=>runs.find(run=>run.model===model));
  return pair.every(run=>run&&!run.stale&&run.fingerprint)&&pair[0].fingerprint===pair[1].fingerprint?pair:null;
}

export async function generateBadgePdfs(ids,generate,onProgress=()=>{}){
  if(!ids.length)throw new Error('Seleccione pelo menos um crachá.');
  const results=[];
  for(const model of ['horizontal','vertical']){
    onProgress(model);
    results.push(await generate(model,[...ids]));
  }
  return results;
}

export async function badgePdfArchive(runs,fetchPdf,onProgress=()=>{}){
  const pair=readyBadgePdfs(runs);
  if(!pair)throw new Error('Gere os dois modelos para a mesma lista antes de baixar.');
  const zip=new JSZip();
  for(const run of pair){
    onProgress(run.model);
    const bytes=new Uint8Array(await fetchPdf(run));
    if(new TextDecoder().decode(bytes.subarray(0,5))!=='%PDF-')throw new Error('O PDF não chegou completo. Tente novamente.');
    zip.file(`crachas-${run.model}.pdf`,bytes);
  }
  return zip.generateAsync({type:'uint8array',compression:'STORE'});
}

// Keep the deadline active through the response body, not just the headers.
export async function fetchWithDeadline(url,options={},timeoutMs=120000,fetcher=fetch){
  const controller=new AbortController();let timer;
  const deadline=new Promise((_,reject)=>{timer=setTimeout(()=>{reject(new Error('O pedido demorou demasiado. Verifique a ligação e tente novamente.'));controller.abort();},timeoutMs);});
  try{
    return await Promise.race([deadline,(async()=>{
      const response=await fetcher(url,{...options,signal:controller.signal});
      const bytes=await response.arrayBuffer();
      return new Response(response.status===204?null:bytes,{status:response.status,headers:response.headers});
    })()]);
  }finally{clearTimeout(timer);}
}
