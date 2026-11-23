import assert from 'node:assert/strict';
import {test} from 'node:test';
import {spawn,type ChildProcess} from 'node:child_process';
import {mkdtemp,chmod,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {NodeHttpTransport} from '@barocss/doc-sync/node';
import {SyncClient} from '@barocss/doc-sync/sync';
import {DEMO_SCHEMA} from '../../../fixtures/demo-schema.ts';
import {demo,stop,until} from '../../mcp/test/hosted-fixtures.ts';
for(const signal of ['SIGINT','SIGTERM'] as const)test(`actual watch CLI ${signal} cancels only the local fake planner and preserves peer text`,{timeout:30000},async()=>{
 const dir=await mkdtemp(join(tmpdir(),'watch-cli-cancel-'));await chmod(dir,0o700);const marker=join(dir,'planner-started'),checkpoint=join(dir,'watch.json');
 await writeFile(join(dir,'codex'),`#!${process.execPath}\nconst fs=require('node:fs');fs.writeFileSync(${JSON.stringify(marker)},String(process.pid));process.stdin.resume();setInterval(()=>{},1000);\n`,{mode:0o700});
 const server=await demo(join(dir,'server'));const human=new SyncClient('human',new NodeHttpTransport('cancel-doc','human',server.url),{schema:DEMO_SCHEMA});human.connect();let child:ChildProcess|undefined,pid:number|undefined;
 try{
  await until(()=>human.synchronized);let output='',errors='',exited=false,code:number|null=null;
  child=spawn(process.execPath,['src/main.ts','watch','--url',server.url,'--doc','cancel-doc','--mission','Review synthetic text','--interval','5','--max-runs','3','--checkpoint',checkpoint,'--state-dir',join(dir,'missions')],{cwd:new URL('..',import.meta.url).pathname.replace(/test\/$/,''),env:{PATH:dir,HOME:dir},stdio:['ignore','pipe','pipe']});
  child.stdout!.on('data',b=>output+=String(b));child.stderr!.on('data',b=>errors+=String(b));child.on('exit',c=>{code=c;exited=true;});
  await until(()=>output.includes('"event":"watching"')||exited);assert(!exited,errors);
  human.commit(human.doc.edit([{op:'insert',at:[0,0],content:'Human edit'}]).ops);await until(()=>human.pending.length===0);
  let started=false;const deadline=Date.now()+12000;while(!started){try{pid=Number(await readFile(marker,'utf8'));started=true;}catch{if(exited||Date.now()>deadline)throw Error(`planner did not start: ${errors} ${output}`);await new Promise(r=>setTimeout(r,20));}}
  child.kill(signal);await until(()=>exited);assert.equal(code,0,errors);assert.throws(()=>process.kill(pid!,0),(e:any)=>e.code==='ESRCH');assert.equal(Number(await readFile(marker,'utf8')),pid);
  const saved=JSON.parse(await readFile(checkpoint,'utf8'));assert.equal(saved.phase,'stopped');assert.equal(saved.used,1);assert(saved.attempt.captured.serverSeq>saved.baseline.serverSeq);
  assert.match(output,/"status":"cancelled"/);assert.match(output,/"missionStatus":"needs_attention"/);assert.match(JSON.stringify(human.doc.toJSON()),/Human edit/);
 }finally{human.disconnect();if(child)await stop(child,'SIGKILL');if(pid)try{process.kill(pid,'SIGKILL');}catch{}await stop(server.child);await rm(dir,{recursive:true,force:true});}
});
