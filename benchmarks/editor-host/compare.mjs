/** Interleave two compiled targets using the same measurement program. No builds. */
import {spawnSync,execFileSync} from 'node:child_process';
import {openSync,closeSync} from 'node:fs';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const args=Object.fromEntries(process.argv.slice(2).map(s=>{const[k,...v]=s.replace(/^--/,'').split('=');return[k,v.join('=')];}));
assert.ok(args.baseline&&args.candidate&&args.thresholds&&args.output,'Required: --baseline=ROOT --candidate=ROOT --thresholds=JSON --output=DIR');
const out=resolve(args.output),harness=args.harness?resolve(args.harness):fileURLToPath(new URL('../editor-host.mjs',import.meta.url));
const thresholds=JSON.parse(await readFile(resolve(args.thresholds),'utf8'));
const harnessHash=createHash('sha256').update(await readFile(harness)).digest('hex');
const schedule=['A','B','B','A','A','B','B','A','A','B','B','A'];
await mkdir(out,{recursive:true});const reports=[];
for(let turn=0;turn<schedule.length;turn++){
 const label=schedule[turn],target=resolve(label==='A'?args.baseline:args.candidate),file=join(out,`${String(turn).padStart(2,'0')}-${label}.json`);
 let logfd; if(args.profile){await writeFile(join(out,`${String(turn).padStart(2,'0')}-${label}-system.txt`),new Date().toISOString()+'\n'+execFileSync('ps',['-Ao','pid,pcpu,comm'],{encoding:'utf8'}));logfd=openSync(join(out,`${String(turn).padStart(2,'0')}-${label}-gc.log`),'w');}
 const result=spawnSync(process.execPath,[...(args.profile?['--trace-gc-nvp']:[]),harness,`--target=${target}`,'--mode=timing',`--schedule=${label}`,`--output=${file}`],{stdio:args.profile?['ignore',logfd,logfd]:'inherit'});
 if(logfd!==undefined)closeSync(logfd);
 assert.equal(result.status,0,`measurement turn ${turn} failed`);
 const report=JSON.parse(await readFile(file,'utf8'));assert.equal(report.harnessHash,harnessHash,'harness changed');
 assert.equal(report.before.aggregate,report.after.aggregate,'target changed');
 reports.push({...report,turn});
}
const differences=[],results=[],upperMedian=values=>[...values].sort((a,b)=>a-b)[Math.floor(values.length/2)];
for(const guard of thresholds.controls.filter(g=>!args.scenarios||args.scenarios.split(',').includes(g.scenario))){
 const a=reports.filter(r=>r.schedule[0]==='A').map(r=>r.rows.find(x=>x.size===guard.size&&x.scenario===guard.scenario));
 const b=reports.filter(r=>r.schedule[0]==='B').map(r=>r.rows.find(x=>x.size===guard.size&&x.scenario===guard.scenario));
 assert.ok([...a,...b].every(Boolean),'missing required scenario');
 for(let i=0;i<a.length;i++){
 for(const key of ['modelHash','generatedHash','pending','historyHash','stats','eventStats','remoteCoreCounts']){
 try{assert.deepEqual(b[i].invariant[key],a[i].invariant[key]);}catch{differences.push({scenario:guard.scenario,size:guard.size,pair:i,kind:'semantic',key,baseline:a[i].invariant[key],candidate:b[i].invariant[key]});}
 }
 for(let sample=0;sample<a[i].counts.length;sample++)for(const key of Object.keys(a[i].counts[sample]))if(b[i].counts[sample][key]>a[i].counts[sample][key])differences.push({scenario:guard.scenario,size:guard.size,pair:i,kind:'operation-count',sample,key,baseline:a[i].counts[sample][key],candidate:b[i].counts[sample][key]});
 }
 const baselineP95=upperMedian(a.map(r=>r.p95)),candidateP95=upperMedian(b.map(r=>r.p95)),deltaMs=candidateP95-baselineP95;
 results.push({scenario:guard.scenario,size:guard.size,baselineP95,candidateP95,deltaMs,fixedGuardMs:guard.fixedGuardMs,baselineControlNoiseMs:guard.noiseMs,baselineControlNoisy:guard.noiseMs>guard.fixedGuardMs,status:deltaMs>guard.fixedGuardMs?'INVESTIGATE_PERF':'WITHIN_FIXED_GUARD'});
}
for(const label of ['A','B'])assert.equal(new Set(reports.filter(r=>r.schedule[0]===label).map(r=>r.before.aggregate)).size,1,`${label} runtime changed between turns`);
const report={format:1,date:new Date().toISOString(),harnessHash,schedule,thresholds:resolve(args.thresholds),node:process.version,boundary:'Node headless PM; not Chrome or OS IME',countsStatus:differences.length?'FAIL':'PASS',timingStatus:results.some(r=>r.status==='INVESTIGATE_PERF')?'INVESTIGATE_PERF':thresholds.timingStatus==='CONTROL_NOISE_EXCEEDS_GUARD'?'WITHIN_GUARD_BASELINE_CONTROL_NOISY':'WITHIN_FIXED_GUARD',differences,results,targets:reports.map(r=>({turn:r.turn,label:r.schedule[0],target:r.target,sourceHash:r.before.aggregate,harnessHash:r.harnessHash})),rawReports:reports.map(r=>`${String(r.turn).padStart(2,'0')}-${r.schedule[0]}.json`)};
await writeFile(join(out,'comparison.json'),JSON.stringify(report,null,2)+'\n');console.log(join(out,'comparison.json'));
if(differences.length)process.exitCode=1;
