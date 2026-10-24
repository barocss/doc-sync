import {execFileSync} from 'node:child_process';
import {existsSync,mkdtempSync,mkdirSync,readFileSync,writeFileSync,symlinkSync} from 'node:fs';
import {tmpdir,loadavg} from 'node:os';
import {join,resolve} from 'node:path';
import {createHash} from 'node:crypto';
const args=process.argv.slice(2),index=args.indexOf('--out-dir'),root=process.cwd();
const out=resolve(index<0?'benchmarks/results/logical-text-scopes-2026-10-24/abba':args[index+1]);
if(existsSync(out))throw new Error('Use a fresh output directory; measurements are preserved');
const baseline='84fa81df7ff2288551fd33285dd6f3f2fa2de781';
const before=mkdtempSync(join(tmpdir(),'doc-sync-logical-baseline-'));
execFileSync('tar',['-x','-C',before],{input:execFileSync('git',['archive',baseline,'package.json','packages/doc-sync','benchmarks/capabilities.ts','fixtures']),maxBuffer:32*1024*1024});
symlinkSync(join(root,'node_modules'),join(before,'node_modules'),'dir');
const source=join(before,'benchmarks/capabilities.ts');
writeFileSync(source,readFileSync(source,'utf8').replaceAll('"@barocss/doc-sync/sync"',JSON.stringify(join(before,'packages/doc-sync/src/sync/index.ts'))).replaceAll('"@barocss/doc-sync"',JSON.stringify(join(before,'packages/doc-sync/src/index.ts'))));
const paths=['packages/doc-sync/src/sync/model-events.ts','packages/doc-sync/src/crdt/edit.ts','packages/doc-sync/src/crdt/doc.ts','packages/doc-sync/src/sync/client.ts','benchmarks/capabilities.ts'];
const hashes=()=>paths.map(path=>({path,sha256:createHash('sha256').update(readFileSync(path)).digest('hex')}));
const sourceHashes=hashes(),startedAt=new Date().toISOString(),startedLoad=loadavg(),runs=[];
mkdirSync(out,{recursive:true});
for(const [label,base]of [['before-1',before],['after-1',root],['after-2',root],['before-2',before]]){
 const started=new Date().toISOString(),load=loadavg();
 const log=execFileSync(process.execPath,[join(base,'benchmarks/capabilities.ts'),'--samples','30','--out',join(out,`${label}.json`)],{cwd:base,encoding:'utf8',maxBuffer:32*1024*1024});
 writeFileSync(join(out,`${label}.log`),log,{flag:'wx'});
 runs.push({label,startedAt:started,endedAt:new Date().toISOString(),startedLoad:load,endedLoad:loadavg()});console.log(label+' PASS');
}
if(JSON.stringify(hashes())!==JSON.stringify(sourceHashes))throw new Error('Measured source changed during timing');
writeFileSync(join(out,'metadata.json'),JSON.stringify({baseline,node:process.version,startedAt,endedAt:new Date().toISOString(),startedLoad,endedLoad:loadavg(),order:'before/after/after/before; sequential processes',samples:30,warmups:5,metric:'synchronous change receipt through model-event callback; no network, native conversion, DOM or correctness work in timed interval',baselineAdaptation:'Only benchmark bare imports point at archived baseline source; shared installed dependencies. No product adaptation.',sourceHashes,runs},null,2)+'\n',{flag:'wx'});
