import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync,existsSync,readdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
const root=new URL('../../',import.meta.url).pathname;
const base=resolve(root,'output/rust-d3-moved-2026-11-04');
const owned='experiments/runtime-document-moved/';
const plans=[
 ['unused-oracle','experiments/runtime-document-unused/oracle.mjs','output/rust-d2-unused-2026-11-04/compare-oracle','output/rust-d3-moved-2026-11-04/compare-regression-unused-oracle'],
 ['textfalse-oracle','experiments/runtime-document-textfalse/oracle.mjs','output/rust-d2-textfalse-2026-11-04/compare-oracle','output/rust-d3-moved-2026-11-04/compare-regression-textfalse-oracle'],
 ['unused-product','experiments/runtime-document-unused/product-boundary.mjs','output/rust-d2-unused-2026-11-04/compare-product','output/rust-d3-moved-2026-11-04/compare-regression-unused-product'],
];
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const exclusions=[
 {path:'experiments/runtime-document-unused/compiler-boundaries.mjs',status:'NOT_RUN_STALE_EXPECTATION',reason:'Asserts the historical fresh-slide paragraph style=null wire failure that D3 repairs.'},
 {path:'experiments/runtime-document-textfalse/product-boundary.mjs',status:'NOT_RUN_STALE_EXPECTATION',reason:'Asserts that native compilation rejects unused original Word/Presentation declarations; D2 unused already supports them.'},
];
const mappings=plans.map(([name,original,oldText,newText])=>{
 const originalBytes=readFileSync(resolve(root,original));
 const source=originalBytes.toString();assert.equal(source.split(oldText).length-1,1,name+' one output destination replacement');
 const adapted=owned+'inherited-'+name+'.mjs',transformed=source.replace(oldText,newText);
 return{name,original,adapted,originalSha256:sha(originalBytes),adaptedSha256:sha(transformed),oldText,newText,transformed};
});
const sourceMap=resolve(base,'compare-inherited-source-map.json');
if(process.argv.includes('--prepare')){
 mkdirSync(base,{recursive:true});
 for(const m of mappings){
  writeFileSync(resolve(root,m.adapted),m.transformed);
  const diff=spawnSync('/usr/bin/diff',['-u',m.original,m.adapted],{cwd:root,encoding:'utf8'});
  assert.equal(diff.status,1);writeFileSync(resolve(base,'compare-inherited-'+m.name+'.diff'),diff.stdout);
 }
 writeFileSync(sourceMap,JSON.stringify({status:'OUTPUT_ONLY_ADAPTERS_PREPARED',scope:'Original source bytes preserved. Each adapter changes exactly one output destination; no semantic expectation changes.',mappings:mappings.map(({transformed,...m})=>m),exclusions},null,2)+'\n');
 console.log(JSON.stringify({status:'PREPARED',sourceMap}));
}else{
 const prepared=JSON.parse(readFileSync(sourceMap));
 assert.deepEqual(prepared.mappings,mappings.map(({transformed,...m})=>m),'original/adapted source map unchanged since prepare');
 for(const m of mappings)assert.equal(readFileSync(resolve(root,m.adapted),'utf8'),m.transformed,m.name+' adapter byte equality');
 const target=resolve(base,'native-target'),cli=resolve(target,'debug/doc-sync-rust-shadow');assert(existsSync(cli),'frozen current D3 CLI must be built first');
 const pins=JSON.parse(readFileSync(resolve(base,'before-pins.json'))),seals=JSON.parse(readFileSync(resolve(base,'earlier-seals.json')));
 const protectedPaths=[pins.binary];
 assert.equal(sha(readFileSync(resolve(root,pins.binary))),pins.sha256,'preserved old paragraph trace binary');
 for(const seal of seals){
  const path=seal.report+'/seal.json';assert.equal(sha(readFileSync(resolve(root,path))),seal.sealSha256,path);protectedPaths.push(path);
  const receipt=JSON.parse(readFileSync(resolve(root,path)));
  for(const[file,digest]of Object.entries(receipt.files)){const p=seal.report+'/'+file;assert.equal(sha(readFileSync(resolve(root,p))),digest,p);protectedPaths.push(p);}
 }
 const paths=[...protectedPaths,...mappings.flatMap(m=>[m.original,m.adapted]),...['experiments/runtime-document-paragraph/compare.mjs','experiments/runtime-document-unused/compare.mjs','experiments/runtime-document-textfalse/compare.mjs','experiments/runtime-document-unused/export-schemas.mjs','experiments/rust-sdk/examples/runtime_textfalse_trace.rs',...readdirSync(resolve(root,owned)).filter(p=>p.endsWith('.mjs')).map(p=>owned+p)],cli,resolve(target,'debug/examples/runtime_moved_trace')];
 const hashes=()=>Object.fromEntries([...new Set(paths)].sort().map(p=>[p,sha(readFileSync(resolve(root,p)))]));
 const before=hashes();
 const out=resolve(base,'compare-regressions/run-'+new Date().toISOString().replaceAll(':','-')+'-'+process.pid);mkdirSync(out,{recursive:true});
 const env={...process.env,CARGO_BUILD_JOBS:'1',CARGO_PROFILE_DEV_DEBUG:'0',CARGO_PROFILE_TEST_DEBUG:'0',CARGO_INCREMENTAL:'0',PARAGRAPH_TARGET:target,PARAGRAPH_OUT:resolve(base,'compare-regression-paragraph-main'),PARAGRAPH_SKIP_BUILD:'',PARAGRAPH_TRACE_REUSE:'',PARAGRAPH_FILTER:'',PARAGRAPH_TS_ONLY:'',UNUSED_TARGET:target,TEXTFALSE_TARGET:target,UNUSED_OUT:resolve(base,'compare-regression-unused-main'),TEXTFALSE_OUT:resolve(base,'compare-regression-textfalse-main'),UNUSED_ORACLE_BINARY:cli,TEXTFALSE_ORACLE_BINARY:cli,UNUSED_PRODUCT_BINARY:cli};
 const stages=[['schema-export','experiments/runtime-document-unused/export-schemas.mjs'],['paragraph-main-466','experiments/runtime-document-paragraph/compare.mjs'],['unused-main-84','experiments/runtime-document-unused/compare.mjs'],['textfalse-main-90','experiments/runtime-document-textfalse/compare.mjs'],...mappings.map(m=>[m.name,m.adapted])];
 const results=[];let failure=null;
 for(const[name,path]of stages){
  const run=spawnSync(process.execPath,[path],{cwd:root,env,encoding:'utf8',maxBuffer:8*1024*1024});
  writeFileSync(resolve(out,name+'.stdout.log'),run.stdout??'');writeFileSync(resolve(out,name+'.stderr.log'),run.stderr??'');
  const result={name,path,status:run.status===0?'PASS':'FAIL',exit:run.status,error:run.error?.message};results.push(result);
  try{assert.equal(run.status,0,name+': '+run.stderr);assert.deepEqual(hashes(),before,name+' source/protected evidence unchanged');}catch(e){failure=e.stack;break;}
 }
 const after=hashes();
 try{assert.deepEqual(after,before);}catch(e){failure??=e.stack;}
 const receipt={status:failure?'FAIL':'PASS',results,exclusions,sourceMap,protectedReportSeals:seals.length,oldBeforeBinary:pins,hashesBefore:before,hashesAfter:after,failure,scope:'Unmodified inherited paragraph466/unused84/textfalse90 main semantic corpora, exact schema export, and output-only adapters for unchanged unused/textfalse admission oracles and unused product compilation boundary. Historical stale-outcome probes explicitly excluded. No old target writes or resealing.'};
 writeFileSync(resolve(out,'receipt.json'),JSON.stringify(receipt,null,2)+'\n');
 console.log(JSON.stringify({status:receipt.status,out,results:results.map(r=>({name:r.name,status:r.status}))}));
 if(failure)process.exitCode=1;
}
