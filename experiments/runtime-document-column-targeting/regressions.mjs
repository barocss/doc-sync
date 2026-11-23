import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
const root=new URL('../../',import.meta.url).pathname;
const base=resolve(root,'output/rust-d3-column-targeting-2026-11-05');
const owned='experiments/runtime-document-column-targeting/';
const plans=[
 ['unused-oracle','experiments/runtime-document-unused/oracle.mjs','output/rust-d2-unused-2026-11-04/compare-oracle','output/rust-d3-column-targeting-2026-11-05/compare-regression-unused-oracle'],
 ['textfalse-oracle','experiments/runtime-document-textfalse/oracle.mjs','output/rust-d2-textfalse-2026-11-04/compare-oracle','output/rust-d3-column-targeting-2026-11-05/compare-regression-textfalse-oracle'],
 ['unused-product','experiments/runtime-document-unused/product-boundary.mjs','output/rust-d2-unused-2026-11-04/compare-product','output/rust-d3-column-targeting-2026-11-05/compare-regression-unused-product'],
];
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const exclusions=[
 {path:'experiments/runtime-document-unused/compiler-boundaries.mjs',status:'NOT_RUN_STALE_EXPECTATION',reason:'Asserts historical fresh-slide paragraph style=null wire failure already repaired by D3.'},
 {path:'experiments/runtime-document-textfalse/product-boundary.mjs',status:'NOT_RUN_STALE_EXPECTATION',reason:'Asserts native rejection of unused original Word/Presentation declarations already supported by D2.'},
];
const mappings=plans.map(([name,original,oldText,newText])=>{
 const bytes=readFileSync(resolve(root,original)),source=bytes.toString();assert.equal(source.split(oldText).length-1,1,name+' one output destination replacement');
 const adapted=owned+'inherited-'+name+'.mjs',transformed=source.replace(oldText,newText);
 return{name,original,adapted,originalSha256:sha(bytes),adaptedSha256:sha(transformed),oldText,newText,transformed};
});
const sourceMap=resolve(base,'compare-inherited-source-map.json');
if(process.argv.includes('--prepare')){
 for(const m of mappings){writeFileSync(resolve(root,m.adapted),m.transformed);const d=spawnSync('/usr/bin/diff',['-u',m.original,m.adapted],{cwd:root,encoding:'utf8'});assert.equal(d.status,1);writeFileSync(resolve(base,'compare-inherited-'+m.name+'.diff'),d.stdout);}
 writeFileSync(sourceMap,JSON.stringify({status:'OUTPUT_ONLY_ADAPTERS_PREPARED',scope:'Original source bytes preserved. Each adapter changes exactly one output destination. No semantic expectation changes.',mappings:mappings.map(({transformed,...m})=>m),exclusions},null,2)+'\n');
 console.log(JSON.stringify({status:'PREPARED',sourceMap}));
}else{
 assert(process.env.COLUMN_CARGO_RELEASED==='1','Root must release serial Cargo slot before inherited unused/textfalse unconditional builds');
 const prepared=JSON.parse(readFileSync(sourceMap));assert.deepEqual(prepared.mappings,mappings.map(({transformed,...m})=>m));for(const m of mappings)assert.equal(readFileSync(resolve(root,m.adapted),'utf8'),m.transformed);
 const target=resolve(base,'native-target'),cli=resolve(target,'debug/doc-sync-rust-shadow');
 const binaries=[cli,...['runtime_group_grid_trace','runtime_moved_trace','runtime_paragraph_trace','runtime_textfalse_trace','runtime_schema_trace','runtime_batch_trace','runtime_targeting_trace','runtime_grid_targeting_trace','runtime_column_targeting_trace'].map(x=>resolve(target,'debug/examples/'+x))];for(const path of binaries)assert(existsSync(path),path+' root-built first');
 const pins=JSON.parse(readFileSync(resolve(base,'before-pins.json'))),seals=JSON.parse(readFileSync(resolve(base,'earlier-seals.json'))),protectedPaths=[];
 for(const[path,digest]of Object.entries(pins)){assert.equal(sha(readFileSync(resolve(root,path))),digest,'preserved old binary '+path);protectedPaths.push(path);}
 for(const seal of seals){const path=seal.report+'/seal.json';assert.equal(sha(readFileSync(resolve(root,path))),seal.sealSha256,path);protectedPaths.push(path);for(const[file,digest]of Object.entries(JSON.parse(readFileSync(resolve(root,path))).files)){const p=seal.report+'/'+file;assert.equal(sha(readFileSync(resolve(root,p))),digest,p);protectedPaths.push(p);}}
 const mainSummary=JSON.parse(readFileSync(resolve(base,'compare-summary.json')));assert.equal(mainSummary.status,'PASS','current fresh main qualification first');
 const mainMap=resolve(root,mainSummary.finalRun,'run-source-hashes.json');const main=JSON.parse(readFileSync(mainMap));
 const stages=[['axis-main-435','experiments/runtime-document-axis-targeting/compare.mjs'],['axis-empty-cell-probe-12','output/rust-d3-axis-targeting-2026-11-05/compare-empty-cell-probe.mjs'],['targeting-main-390','experiments/runtime-document-targeting/compare.mjs'],['batch-main-351','experiments/runtime-document-batch/compare.mjs'],['schema-export','experiments/runtime-document-unused/export-schemas.mjs'],['schema-model-contract-19','experiments/runtime-document-schema-contract/test.mjs'],['group-grid-main-481','experiments/runtime-document-group-grid/compare.mjs'],['moved-main-1062','experiments/runtime-document-moved/compare.mjs'],['paragraph-main-466','experiments/runtime-document-paragraph/compare.mjs'],['unused-main-84','experiments/runtime-document-unused/compare.mjs'],['textfalse-main-90','experiments/runtime-document-textfalse/compare.mjs'],...mappings.map(m=>[m.name,m.adapted])];
 const paths=[...Object.keys(main),...protectedPaths,...mappings.flatMap(m=>[m.original,m.adapted]),...stages.map(([,path])=>path),owned+'regressions.mjs',...binaries];
 const hashes=()=>Object.fromEntries([...new Set(paths)].sort().map(p=>[p,sha(readFileSync(resolve(root,p)))]));
 const before=hashes(),out=resolve(base,'compare-regressions/run-'+new Date().toISOString().replaceAll(':','-')+'-'+process.pid);mkdirSync(out,{recursive:true});
 const env={...process.env,CARGO_BUILD_JOBS:'1',CARGO_PROFILE_DEV_DEBUG:'0',CARGO_PROFILE_TEST_DEBUG:'0',CARGO_INCREMENTAL:'0',CARGO_TARGET_DIR:target,UNUSED_ORACLE_BINARY:cli,TEXTFALSE_ORACLE_BINARY:cli,UNUSED_PRODUCT_BINARY:cli};
 for(const[prefix,name]of[['AXIS','axis'],['TARGETING','targeting'],['BATCH','batch'],['GROUP_GRID','group-grid'],['MOVED','moved'],['PARAGRAPH','paragraph'],['UNUSED','unused'],['TEXTFALSE','textfalse']]){
  env[prefix+'_TARGET']=target;env[prefix+'_OUT']=resolve(base,'compare-regression-'+name+'-main');env[prefix+'_SKIP_BUILD']='1';for(const suffix of['TRACE_REUSE','TS_ONLY','LIMIT','GROUP','FILTER','NAMES'])env[prefix+'_'+suffix]='';
 }
 const results=[];let failure=null;
 for(const[name,path]of stages){
  const run=spawnSync(process.execPath,['--max-old-space-size=6144',path],{cwd:root,env,encoding:'utf8',maxBuffer:8*1024*1024});
  writeFileSync(resolve(out,name+'.stdout.log'),run.stdout??'');writeFileSync(resolve(out,name+'.stderr.log'),run.stderr??'');
  let artifact=null;try{const last=(run.stdout??'').trim().split('\n').at(-1);artifact=JSON.parse(last);}catch{}
  results.push({name,path,status:run.status===0?'PASS':'FAIL',exit:run.status,error:run.error?.message,artifact});
  try{assert.equal(run.status,0,name+': '+run.stderr);assert.deepEqual(hashes(),before,name+' source/binaries/protected evidence unchanged');}catch(e){failure=e.stack;break;}
 }
 const after=hashes();try{assert.deepEqual(after,before);}catch(e){failure??=e.stack;}
 const receipt={status:failure?'FAIL':'PASS',results,exclusions,sourceMap,protectedReportSeals:seals.length,oldBeforeBinaries:pins,mainComparisonSourceMap:mainMap,mainFrozenExistingPathsUnchanged:Object.entries(main).every(([p,h])=>before[p]===h),hashesBefore:before,hashesAfter:after,failure,scope:'Unmodified inherited Q1.3.2 axis435 plus separateemptycell12,Q1.3.1 targeting390,Q1.2 batch351,group/grid481,moved1062,paragraph466,unused84,textfalse90 full main corpora; exact original schema export;19 independent schema/model tests; output-only admission/product oracle adapters. All binaries built only in new batch target. unused/textfalse harnesses retain their original unconditional serial builds after root Cargo release. Old namespaces/targets/seals remain unchanged.'};
 writeFileSync(resolve(out,'receipt.json'),JSON.stringify(receipt,null,2)+'\n');console.log(JSON.stringify({status:receipt.status,out,results:results.map(r=>({name:r.name,status:r.status}))}));if(failure)process.exitCode=1;
}
