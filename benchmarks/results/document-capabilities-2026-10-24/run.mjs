import {execFileSync} from 'node:child_process';
import {mkdtempSync,mkdirSync,existsSync,readFileSync,writeFileSync,symlinkSync} from 'node:fs';
import {tmpdir,loadavg} from 'node:os';
import {join,resolve} from 'node:path';
import {createHash} from 'node:crypto';
const args=process.argv.slice(2),index=args.indexOf('--out-dir');
const root=process.cwd(),out=resolve(index<0?'benchmarks/results/document-capabilities-2026-10-24':args[index+1]);
const baseline='ce421449514698fdaa844194c65566200061011c';
for(const label of ['before-1','after-1','after-2','before-2'])for(const name of ['client','remote','structure'])for(const suffix of ['json','log'])if(existsSync(join(out,`${label}-${name}.${suffix}`)))throw new Error('Choose a fresh output folder; existing measurements are preserved');
if(existsSync(join(out,'comparison-metadata.json')))throw new Error('Existing comparison metadata is preserved');
const before=mkdtempSync(join(tmpdir(),'doc-sync-measured-baseline-'));
const paths=['package.json','packages/doc-sync/package.json','packages/doc-sync/src','benchmarks/client.ts','benchmarks/remote.ts','benchmarks/structure.ts','benchmarks/engines.ts','fixtures/demo-schema.ts'];
execFileSync('tar',['-x','-C',before],{input:execFileSync('git',['archive',baseline,...paths]),maxBuffer:32*1024*1024});
symlinkSync(join(root,'node_modules'),join(before,'node_modules'),'dir');
for(const file of ['client','remote','structure','engines']){
 const p=join(before,`benchmarks/${file}.ts`);let source=readFileSync(p,'utf8');
 source=source.replaceAll('"@barocss/doc-sync/sync"',JSON.stringify(join(before,'packages/doc-sync/src/sync/index.ts'))).replaceAll('"@barocss/doc-sync"',JSON.stringify(join(before,'packages/doc-sync/src/index.ts')));
 writeFileSync(p,source);
}
const startedAt=new Date().toISOString(),startedLoad=loadavg(),runs=[];
mkdirSync(out,{recursive:true});
for(const [label,base]of [['before-1',before],['after-1',root],['after-2',root],['before-2',before]]){
 for(const name of ['client','remote','structure']){
  const file=join(out,`${label}-${name}.json`);
  const args=[join(base,`benchmarks/${name}.ts`),'--samples','30','--label',label,'--out',file];
  if(name==='remote')args.push('--chars','10000,100000','--blocks','1,8','--operations','insert,format');
  const started=new Date().toISOString(),load=loadavg();
  const log=execFileSync(process.execPath,args,{cwd:root,encoding:'utf8',maxBuffer:32*1024*1024});
  writeFileSync(join(out,`${label}-${name}.log`),log,{flag:'wx'});
  runs.push({label,name,startedAt:started,endedAt:new Date().toISOString(),startedLoad:load,endedLoad:loadavg()});
  console.log(JSON.stringify({label,name,status:'passed',file}));
 }
}
const files=execFileSync('rg',['--files','packages/doc-sync/src','benchmarks/client.ts','benchmarks/remote.ts','benchmarks/structure.ts'],{encoding:'utf8'}).trim().split('\n');
const metadata={baseline,startedAt,endedAt:new Date().toISOString(),node:process.version,order:'before/after/after/before; sequential processes',samples:30,warmups:5,startedLoad,endedLoad:loadavg(),baselineAdaptation:'Benchmark import specifiers point at an isolated git archive of baseline product source. Current benchmark hello fixtures use protocol2 and stay connected; handshake is outside timing. Existing dependency directory is linked.',runs,sourceHashes:files.map(path=>({path,sha256:createHash('sha256').update(readFileSync(path)).digest('hex')}))};
writeFileSync(join(out,'comparison-metadata.json'),JSON.stringify(metadata,null,2)+'\n',{flag:'wx'});
