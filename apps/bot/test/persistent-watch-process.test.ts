import assert from 'node:assert/strict';
import {test} from 'node:test';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {mkdtemp,chmod,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {PersistentReviewWatch} from '../src/persistent-watch.ts';
const supported=process.platform==='darwin'||process.platform==='linux';
test('fresh process crash after durable in-flight mark blocks callback replay',{skip:!supported,timeout:15000},async()=>{
 const dir=await mkdtemp(join(tmpdir(),'watch-process-'));await chmod(dir,0o700);const file=join(dir,'watch.json');
 const options={file,binding:'a'.repeat(64),maxRuns:3};
 const source=`import {PersistentReviewWatch} from ${JSON.stringify(new URL('../src/persistent-watch.ts',import.meta.url).href)};
 let seq=1;const w=await PersistentReviewWatch.open(${JSON.stringify(options)},async()=>({generation:'g',epoch:'e',schemaVersion:'s',serverSeq:seq}),async()=>{console.log('ENTERED');await new Promise(()=>{});return {status:'completed'};});await w.poll();seq=2;setInterval(()=>{},1000);await w.poll();`;
 const child=spawn(process.execPath,['--input-type=module','-e',source],{stdio:['ignore','pipe','pipe'],env:{}});let errors='';child.stderr.on('data',b=>errors+=String(b));
 try{
 await new Promise<void>((resolve,reject)=>{let output='';const timer=setTimeout(()=>reject(Error(errors||'child timeout')),10000);child.once('exit',()=>{clearTimeout(timer);reject(Error(errors||'early child exit'));});child.stdout.on('data',b=>{output+=String(b);if(output.includes('ENTERED')){clearTimeout(timer);resolve();}});});
 const before=await readFile(file,'utf8');assert(before.includes('in_flight'));
 await assert.rejects(PersistentReviewWatch.open(options,async()=>({generation:'g',epoch:'e',schemaVersion:'s',serverSeq:2}),async()=>({status:'completed'})),/writer|lock/i);
 const exited=once(child,'exit');child.kill('SIGKILL');await exited;
 let reads=0,reviews=0;
 await assert.rejects(PersistentReviewWatch.open(options,async()=>{reads++;return {generation:'g',epoch:'e',schemaVersion:'s',serverSeq:2};},async()=>{reviews++;return {status:'completed'};}),/inspect|flight|blocked|unfinished/i);
 assert.equal(reads,0);assert.equal(reviews,0);assert.equal(await readFile(file,'utf8'),before);
 }finally{if(child.exitCode===null&&child.signalCode===null){const exit=once(child,'exit');child.kill('SIGKILL');await exit;}await rm(dir,{recursive:true,force:true});}
});
