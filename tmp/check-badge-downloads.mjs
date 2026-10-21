import {performance} from 'node:perf_hooks';
const origin='https://casamento.purruma.com';
const r=await fetch(origin+'/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:'alirio',password:process.env.INVITE_ADMIN_PASSWORD}),signal:AbortSignal.timeout(30000)});
if(!r.ok)throw new Error('Login '+r.status);const Cookie=r.headers.get('set-cookie').split(';')[0];
try{
 const data=await (await fetch(origin+'/api/admin/badges',{headers:{Cookie},signal:AbortSignal.timeout(30000)})).json();console.log(JSON.stringify({count:data.badges.length,runs:data.runs}));
 for(const run of data.runs){const start=performance.now();const pdf=await fetch(origin+'/api/admin/badges/pdf?run='+run.id,{headers:{Cookie},signal:AbortSignal.timeout(60000)});const bytes=await pdf.arrayBuffer();console.log(JSON.stringify({model:run.model,status:pdf.status,bytes:bytes.byteLength,seconds:Math.round((performance.now()-start)/100)/10}));}
}finally{await fetch(origin+'/api/logout',{method:'POST',headers:{Cookie},signal:AbortSignal.timeout(30000)});}
