import test from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import {PDFDocument} from 'pdf-lib';
import {readyBadgePdfs,generateBadgePdfs,badgePdfArchive,fetchWithDeadline} from '../shared/badge-pdfs.js';

const pair=()=>['horizontal','vertical'].map(model=>({model,id:model,fingerprint:'same-selection',stale:false}));
test('both badge formats must be current and from the same selection',()=>{
  assert.equal(readyBadgePdfs([]),null);assert.equal(readyBadgePdfs(pair().slice(0,1)),null);
  for(const changed of [{stale:true},{fingerprint:'other-selection'},{fingerprint:undefined}]){const runs=pair();Object.assign(runs[1],changed);assert.equal(readyBadgePdfs(runs),null);}
  assert.deepEqual(readyBadgePdfs(pair()),pair());
});
test('generation includes both models and exposes partial failure for retry',async()=>{
  const calls=[],progress=[];const ids=['one','two'];
  await generateBadgePdfs(ids,async(model,selection)=>{calls.push([model,selection]);return {model};},model=>progress.push(model));
  assert.deepEqual(calls,[['horizontal',ids],['vertical',ids]]);assert.deepEqual(progress,['horizontal','vertical']);
  await assert.rejects(generateBadgePdfs(ids,async model=>{if(model==='vertical')throw new Error('Vertical failed');}),/Vertical failed/);
  await assert.rejects(generateBadgePdfs([],()=>assert.fail()),/Seleccione/);
});
test('one archive contains two complete PDFs; stale, invalid and interrupted downloads fail',async()=>{
  const doc=await PDFDocument.create();doc.addPage();const pdf=await doc.save();
  const archive=await badgePdfArchive(pair(),async()=>pdf);
  const zip=await JSZip.loadAsync(archive);assert.deepEqual(Object.keys(zip.files),['crachas-horizontal.pdf','crachas-vertical.pdf']);
  for(const entry of Object.values(zip.files)){const bytes=await entry.async('uint8array');assert.deepEqual(bytes,pdf);assert.equal((await PDFDocument.load(bytes)).getPageCount(),1);}
  const stale=pair();stale[1].stale=true;await assert.rejects(badgePdfArchive(stale,()=>assert.fail()),/Gere os dois/);
  await assert.rejects(badgePdfArchive(pair(),async()=>new TextEncoder().encode('<html>Error</html>')),/não chegou completo/);
  await assert.rejects(badgePdfArchive(pair(),async run=>{if(run.model==='vertical')throw new Error('Network failure');return pdf;}),/Network failure/);
});
test('stalled headers and bodies time out and a later request can succeed',async()=>{
  let signal;
  const hung=async(_url,options)=>{signal=options.signal;return new Promise(()=>{});};
  await assert.rejects(fetchWithDeadline('/pdf',{},10,hung),/demorou demasiado/);assert.equal(signal.aborted,true);
  await assert.rejects(fetchWithDeadline('/pdf',{},10,async()=>({arrayBuffer:()=>new Promise(()=>{})})),/demorou demasiado/);
  const result=await fetchWithDeadline('/pdf',{},100,async()=>new Response('complete'));assert.equal(await result.text(),'complete');
});
