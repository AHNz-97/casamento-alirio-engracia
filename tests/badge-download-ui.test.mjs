import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {setImmediate as tick} from 'node:timers/promises';
import {badgeSummary} from '../shared/badges.js';
import {readyBadgePdfs,generateBadgePdfs,badgePdfArchive,fetchWithDeadline} from '../shared/badge-pdfs.js';

test('download UI recovers from a failed transfer and regenerates a stale pair',async()=>{
  const html=await readFile(new URL('../badges-admin.html',import.meta.url),'utf8');
  const source=(await readFile(new URL('../client/badges-admin.js',import.meta.url),'utf8')).replace(/^import .*;\r?\n/gm,'');
  const nodes=new Map();let clicks=0,failDownload=true;const generated=[];
  function element(){return {value:'',disabled:false,files:[],children:[],textContent:'',append(...children){this.children.push(...children);},prepend(...children){this.children.unshift(...children);},replaceChildren(...children){this.children=children;},showModal(){this.open=true;},close(){this.open=false;},click(){clicks++;},remove(){},reset(){}};}
  for(const match of html.matchAll(/id="([^"]+)"/g))nodes.set(match[1],element());
  const document={getElementById(id){assert.ok(nodes.has(id),'HTML contains '+id);return nodes.get(id);},createElement:element,body:element(),querySelectorAll(selector){return selector==='button,input,textarea,select'?[...nodes.values()]:[];}};
  let runs=['horizontal','vertical'].map(model=>({id:model,model,count:1,pages:1,templates:0,stale:false,fingerprint:'current'}));
  const mockFetch=async(url,options)=>{
    if(url.includes('/pdf?')){if(failDownload)throw new Error('Ligação interrompida');return new Response('%PDF-1.7\nTest');}
    if(url.endsWith('/generate')){const body=JSON.parse(options.body);generated.push(body);runs=runs.map(r=>r.model===body.model?{...r,stale:false,fingerprint:'current'}:r);return Response.json({count:1});}
    return Response.json({badges:[{id:'one',name:'Pessoa',role:'Protocolo',sequence:1}],runs});
  };
  const context={document,location:{replace(){assert.fail('unexpected login redirect');}},fetchWithDeadline:(url,options)=>fetchWithDeadline(url,options,100,mockFetch),readyBadgePdfs,generateBadgePdfs,badgePdfArchive,badgeSummary,Blob,URL:{createObjectURL:()=> 'blob:test',revokeObjectURL(){}},setTimeout(){},console};
  vm.runInNewContext(source,context);await tick();await tick();
  const download=nodes.get('download-all');assert.equal(download.disabled,false);
  await download.onclick();assert.equal(download.disabled,false);assert.equal(download.textContent,"Baixar PDF's");assert.match(nodes.get('status').textContent,/interrompida/);assert.equal(clicks,0);
  failDownload=false;await download.onclick();assert.equal(clicks,1);assert.equal(download.disabled,false);
  runs[1].stale=true;await download.onclick();assert.equal(nodes.get('generate-dialog').open,true);assert.equal(nodes.get('generate-save').disabled,false);
  await nodes.get('generate-save').onclick();assert.deepEqual(generated,[{model:'horizontal',ids:['one']},{model:'vertical',ids:['one']}]);assert.equal(clicks,2);assert.equal(nodes.get('generate-dialog').open,false);assert.equal(download.disabled,false);
});
