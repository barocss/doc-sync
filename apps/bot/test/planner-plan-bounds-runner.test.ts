import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {test} from 'node:test';
import {runMission,type Plan} from '../src/runner.ts';
test('oversized unused planner fields never enter durable pending/history or document edits',{timeout:30000},async()=>{
 const dir=await mkdtemp(join(tmpdir(),'plan-bounds-'));
 const child=spawn(process.execPath,[fileURLToPath(new URL('../../demo/server.ts',import.meta.url))],{env:{...process.env,PORT:'0',DATA_DIR:join(dir,'server'),NO_SCHEMA:''},stdio:['ignore','pipe','pipe']});
 let errors='';child.stderr.on('data',b=>errors+=String(b));
 try{
 const origin=await new Promise<string>((resolve,reject)=>{let out='';const timer=setTimeout(()=>reject(Error(errors||'server timeout')),10000);child.once('exit',()=>{clearTimeout(timer);reject(Error(errors));});child.stdout.on('data',b=>{out+=String(b);const m=out.match(/http:\/\/localhost:(\d+)(?=\r?\n)/);if(m){clearTimeout(timer);resolve(`http://127.0.0.1:${m[1]}`);}});});
 const base:Plan={action:'insert',at:[0,0],text:'MUST NOT INSERT',count:0,message:'synthetic'};
 for(const [id,extra] of Object.entries({unused:{editsJson:'x'.repeat(2*1024*1024)},focus:{focus:Array(65).fill(0)},unknown:{extra:'untrusted'}})){
 const stateDir=join(dir,id);const result=await runMission({url:origin,document:id,actor:`bot-${id}`,mission:'Bound synthetic output',stateDir,ephemeral:true},async()=>({...base,...extra}));
 assert.equal(result.status,'needs_attention');assert.equal(result.pending,null);assert.deepEqual(result.history,[]);assert.match(result.error??'',/plan|field|focus/i);
 const bytes=await readFile(join(stateDir,'missions',`${result.id}.json`),'utf8');assert(bytes.length<16384);assert(!bytes.includes('MUST NOT INSERT'));assert(!bytes.includes('untrusted'));
 const state=await(await fetch(`${origin}/api/docs/${id}/state`)).json();assert(!JSON.stringify(state.model).includes('MUST NOT INSERT'));
 }
 }finally{if(child.exitCode===null&&child.signalCode===null){const done=once(child,'exit');child.kill('SIGTERM');await done;}await rm(dir,{recursive:true,force:true});}
});
