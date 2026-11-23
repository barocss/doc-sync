import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import os from 'node:os';
const [origin='http://127.0.0.1:5418', output='output/d1-engine-selection/baseline/chrome-performance.json', prefix='d1-base']=process.argv.slice(2);
const engine=process.argv[5];if(engine&&engine!=='typescript')throw Error('Unsupported controlled engine option');
const session='d1-after-owned';
const run=(...args)=>{const r=JSON.parse(execFileSync('agent-browser',['--session',session,'--json',...args],{encoding:'utf8',timeout:90000,maxBuffer:20000000}));if(!r.success)throw Error(JSON.stringify(r));return r.data;};
const ev=code=>run('eval','-b',Buffer.from(code).toString('base64')).result;
const wait=code=>run('wait','--fn',code);
const hash=x=>createHash('sha256').update(typeof x==='string'?x:JSON.stringify(x)).digest('hex');
const report={format:1,started:new Date().toISOString(),origin,session,boundary:'Real Google Chrome native trusted beforeinput; DOM mutation and second requestAnimationFrame are rendering opportunity proxies, not physical paint. Localhost SSE. Three existing product editors; no CodeMirror product adapter.',node:process.version,cpu:os.cpus()[0],platform:{platform:os.platform(),arch:os.arch(),release:os.release()},samples:8,warmups:2,rows:[],harnessHash:hash(readFileSync(new URL(import.meta.url),'utf8')),inputs:{}};
for(const p of ['fixtures/product-documents.ts','fixtures/product-schemas.ts','apps/demo/products/documents.ts','apps/demo/products/main.jsx','package-lock.json'])report.inputs[p]=hash(readFileSync(p));
const save=()=>writeFileSync(output,JSON.stringify(report,null,2)+'\n');
try{
 for(const profile of ['word','notion','presentation']){
  run('open',`${origin}/?profile=${profile}&size=large&doc=${prefix}-${profile}${engine?"&engine="+engine:""}`);
  wait('!!window.products?.ready()&&!products.errors.length&&products.status().every(p=>p.online&&!p.pending)');
  run('set','viewport','1680','1100');
  report.browser??=ev('navigator.userAgent');
  const initial=ev('(async()=>{const s=await products.snapshot();return {equal:s.equal,model:s.server}})()');if(!initial.equal)throw Error('initial mismatch');
  report.inputs[profile]={modelHash:hash(initial.model),utf16:JSON.stringify(initial.model).length};
  for(const source of ['Slate','Lexical','ProseMirror']){
   const point=ev(`(()=>{const p=[...document.querySelectorAll('#${source} .editor p')].find(p=>p.textContent.includes(products.target.text));if(!p)throw Error('target absent');p.scrollIntoView({block:'center'});const r=p.getBoundingClientRect();return {x:r.left+Math.min(50,r.width/2),y:r.top+r.height/2}})()`);
   run('mouse','move',String(Math.round(point.x)),String(Math.round(point.y)));run('mouse','down');run('mouse','up');
   ev(`(()=>{const p=[...document.querySelectorAll('#${source} .editor p')].find(p=>p.textContent.includes(products.target.text));const range=document.createRange();range.selectNodeContents(p);range.collapse(false);const s=getSelection();s.removeAllRanges();s.addRange(range);document.dispatchEvent(new Event('selectionchange'));products.clearHistory();products.clearMeasurements()})()`);
   run('press','ArrowLeft');run('press','ArrowRight');
   for(let i=0;i<10;i++){
    ev(`(()=>{const p=[...document.querySelectorAll('#${source} .editor p')].find(p=>p.textContent.includes(products.target.text));products.arm('${source}',p.textContent+'q')})()`);
    run('keyboard','inserttext','q');
    wait('products.measurement()?.complete||products.measurement()?.error||products.errors.length');
    const row=ev('products.measurement()');if(row.error||!row.complete||!row.input?.trusted||Object.keys(row.receive).length!==3)throw Error('invalid row '+JSON.stringify(row));
    wait('products.status().every(p=>p.online&&!p.pending)');
   }
   const diagnostics=ev('products.engine??null');if(engine&&(diagnostics?.selection!==engine||diagnostics.peers.length!==3||diagnostics.peers.some(p=>!p.calls.create||!p.calls.receive)))throw Error('Selected engine diagnostics absent '+JSON.stringify(diagnostics));
   const ownEngine=diagnostics?.peers.find(p=>p.name===source);if(engine&&(!ownEngine?.calls.record||!(ownEngine.calls.apply||ownEngine.calls.applyModelEdits||ownEngine.calls['session.apply']||ownEngine.calls['session.applyModelEdits'])))throw Error('Selected source record missing');
   const final=ev('(async()=>{const s=await products.snapshot();return {equal:s.equal,peers:s.peers.map(({name,seq,pending,fallbacks})=>({name,seq,pending,fallbacks})),errors:products.errors,records:products.records()}})()');
   if(!final.equal||final.errors.length||final.peers.some(p=>p.fallbacks))throw Error('final mismatch '+JSON.stringify(final));
   const row={profile,source,engine:diagnostics,...final,records:final.records.slice(2)};report.rows.push(row);save();console.log(JSON.stringify({profile,source,result:'PASS',samples:row.records.length}));
  }
 }
 report.result='PASS';
}catch(e){report.result='FAIL';report.firstFailure=String(e.stack);throw e;}finally{report.ended=new Date().toISOString();save();}
