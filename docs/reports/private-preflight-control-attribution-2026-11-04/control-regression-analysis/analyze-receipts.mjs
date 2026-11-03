// Analyze preserved observations only. No benchmark subprocesses or new timing.
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const source=resolve(import.meta.dirname,'../fallback-controls/abba-final-01'),summaryPath=join(source,'summary.json');
const hash=x=>createHash('sha256').update(x).digest('hex'),read=p=>JSON.parse(readFileSync(p));
const summary=read(summaryPath),rows=[];
const median=xs=>{xs=[...xs].sort((a,b)=>a-b);const n=xs.length;return n%2?xs[(n-1)/2]:(xs[n/2-1]+xs[n/2])/2;};
for(const g of summary.groups)for(const p of g.processes??[]){
 const x=read(p.localOutput),sha=hash(readFileSync(p.localOutput));assert.equal(sha,p.outputSHA);assert.equal(p.status,'PASS');assert.equal(p.returncode,0);
 assert.equal(p.sourceBefore.sha256,p.sourceAfter.sha256);
 const row={group:g.name,kind:g.kind,name:p.name,lane:p.lane,receiptSHA:sha,startedUTC:p.startedUTC,endedUTC:p.endedUTC,elapsedSeconds:p.elapsedSeconds,status:p.status,sourceSHA:p.sourceBefore.sha256,hostBefore:p.hostBefore,hostAfter:p.hostAfter,rawProcess:x.process,oracle:x.oracle,sourceUnchanged:x.sourceUnchangedAtEnd??x.sourceUnchanged,scenarios:x.scenarios?.map(s=>({name:s.name,oracle:s.oracle,timing:s.timing??s.timingMs,rawEditReadControlTiming:s.rawEditReadControlTiming})),runs:x.runs,mediansMs:x.mediansMs};
 if(g.kind==='doc'){assert.equal(x.runs.length,5);assert.equal(x.samples,5);assert.equal(x.warmup,2);row.remoteRawMs=x.runs.map(r=>r.remoteApplyMs);row.remoteMedianMs=median(row.remoteRawMs);row.remoteRangeMs=[Math.min(...row.remoteRawMs),Math.max(...row.remoteRawMs)];row.remoteFirstToLastPercent=(row.remoteRawMs.at(-1)/row.remoteRawMs[0]-1)*100;}
 rows.push(row);
}
assert.equal(rows.length,24);
const docs=rows.filter(r=>r.kind==='doc'),a=docs.filter(r=>r.lane==='A').flatMap(r=>r.remoteRawMs),b=docs.filter(r=>r.lane==='B').flatMap(r=>r.remoteRawMs);
assert.equal(median(a),summary.firstFailure.baselineMedianMs);assert.equal(median(b),summary.firstFailure.candidateMedianMs);
const docDiagnosis={failureUnchanged:summary.firstFailure,processes:docs.map(r=>({name:r.name,lane:r.lane,raw:r.remoteRawMs,median:r.remoteMedianMs,range:r.remoteRangeMs,firstToLastPercent:r.remoteFirstToLastPercent,loadBefore:r.hostBefore.loadavg,loadAfter:r.hostAfter.loadavg,localEditMedianMs:r.mediansMs.localEditMs,cpuMicroseconds:{user:r.rawProcess.end.cpuUsage.user-r.rawProcess.start.cpuUsage.user,system:r.rawProcess.end.cpuUsage.system-r.rawProcess.start.cpuUsage.system},contextSwitches:{voluntary:r.rawProcess.end.resourceUsage.voluntaryContextSwitches-r.rawProcess.start.resourceUsage.voluntaryContextSwitches,involuntary:r.rawProcess.end.resourceUsage.involuntaryContextSwitches-r.rawProcess.start.resourceUsage.involuntaryContextSwitches},minorPageFaults:r.rawProcess.end.resourceUsage.minorPageFault-r.rawProcess.start.resourceUsage.minorPageFault})),baselineAcrossProcessMedianChangePercent:(docs[3].remoteMedianMs/docs[0].remoteMedianMs-1)*100,candidateAcrossProcessMedianChangePercent:(docs[2].remoteMedianMs/docs[1].remoteMedianMs-1)*100,baselineLocalAcrossProcessChangePercent:(docs[3].mediansMs.localEditMs/docs[0].mediansMs.localEditMs-1)*100,overlapRawRange:[Math.max(Math.min(...a),Math.min(...b)),Math.min(Math.max(...a),Math.max(...b))],jitAndGCTelemetry:'NOT_RECORDED; no causal inference from process totals',acceptance:'FAIL remains; no sample excluded or alternate acceptance statistic used'};
const report={status:'ANALYSIS_ONLY',summarySHA:hash(readFileSync(summaryPath)),processes:rows.length,processPASS:rows.filter(r=>r.status==='PASS').length,groupStatuses:summary.groups.map(g=>({name:g.name,status:g.status})),docDiagnosis,rows};
writeFileSync(join(import.meta.dirname,'existing-observations.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({summarySHA:report.summarySHA,processes:report.processes,processPASS:report.processPASS,docDiagnosis},null,2));
