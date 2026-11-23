import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mkdtemp,writeFile,readFile,rm,access} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {codexPlanner} from '../src/codex.ts';
async function wait(check:()=>Promise<boolean>){const end=Date.now()+8000;while(!await check()){if(Date.now()>end)throw Error('fixture timeout');await new Promise(r=>setTimeout(r,10));}}
async function fixture(ignore=false){const dir=await mkdtemp(join(tmpdir(),'fake-codex-cancel-')),marker=join(dir,'started'),command=join(dir,'codex');await writeFile(command,`#!${process.execPath}\nconst fs=require('node:fs');${ignore?"process.on('SIGTERM',()=>{});":""}fs.writeFileSync(${JSON.stringify(marker)},String(process.pid));process.stdin.resume();setInterval(()=>{},1000);\n`,{mode:0o700});return {dir,marker,command};}
const absent=(pid:number)=>{assert.throws(()=>process.kill(pid,0),(error:any)=>error.code==='ESRCH');};
test('pre-canceled planner starts no subprocess',async()=>{const f=await fixture(),controller=new AbortController();controller.abort();try{await assert.rejects(codexPlanner({command:f.command,signal:controller.signal})({personality:'careful'} as any),/cancelled/);await assert.rejects(access(f.marker));}finally{await rm(f.dir,{recursive:true,force:true});}});
for(const ignore of [false,true])test(`planner cancellation waits for child exit${ignore?' and escalates an ignored SIGTERM':''}`,{timeout:10000},async()=>{
 const f=await fixture(ignore),controller=new AbortController();let pid:number|undefined;
 try{const work=codexPlanner({command:f.command,signal:controller.signal,timeoutMs:8000})({personality:'careful'} as any);const rejected=assert.rejects(work,/Codex planning cancelled/);await wait(async()=>{try{pid=Number(await readFile(f.marker,'utf8'));return true;}catch{return false;}});controller.abort();await rejected;absent(pid!);await assert.rejects(codexPlanner({command:f.command,signal:controller.signal})({personality:'careful'} as any),/cancelled/);}finally{if(pid)try{process.kill(pid,'SIGKILL');}catch{}await rm(f.dir,{recursive:true,force:true});}
});
test('cancellation after child exit but before result file read completes cannot return a plan',{timeout:10000},async()=>{
 const f=await fixture(),controller=new AbortController();let resultPath='';
 const script=`#!${process.execPath}\nconst fs=require('node:fs'),{execFileSync}=require('node:child_process');const result=process.argv[process.argv.indexOf('--output-last-message')+1];execFileSync('/usr/bin/mkfifo',[result]);fs.writeFileSync(${JSON.stringify(f.marker)},JSON.stringify({pid:process.pid,result}));`;
 await writeFile(f.command,script,{mode:0o700});
 try{
  const work=codexPlanner({command:f.command,signal:controller.signal})({personality:'careful'} as any);const rejected=assert.rejects(work,/cancelled/);let pid=0;
  await wait(async()=>{try{const marker=JSON.parse(await readFile(f.marker,'utf8'));pid=marker.pid;resultPath=marker.result;return true;}catch{return false;}});
  await wait(async()=>{try{process.kill(pid,0);return false;}catch{return true;}});
  await new Promise(r=>setTimeout(r,30));controller.abort();
  // Release the local FIFO read only after cancellation. No model or provider is involved.
  await writeFile(resultPath,JSON.stringify({action:'finish',at:[],text:'',count:0,message:'synthetic'}));await rejected;
 }finally{controller.abort();await rm(f.dir,{recursive:true,force:true});}
});
test('a live child kill error does not cancel escalation or release the caller before close',{timeout:10000},async()=>{
 const {ChildProcess}=await import('node:child_process');const original=ChildProcess.prototype.kill;
 const f=await fixture(),controller=new AbortController();let pid:number|undefined,errors=0;
 ChildProcess.prototype.kill=function(signal?:NodeJS.Signals|number){if(signal==='SIGTERM'){errors++;queueMicrotask(()=>this.emit('error',Error('synthetic kill delivery failure')));return false;}return original.call(this,signal);};
 try{const work=codexPlanner({command:f.command,signal:controller.signal})({personality:'careful'} as any);const rejected=assert.rejects(work,/cancelled/);await wait(async()=>{try{pid=Number(await readFile(f.marker,'utf8'));return true;}catch{return false;}});controller.abort();await rejected;assert.equal(errors,1);absent(pid!);}finally{ChildProcess.prototype.kill=original;if(pid)try{process.kill(pid,'SIGKILL');}catch{}await rm(f.dir,{recursive:true,force:true});}
});
