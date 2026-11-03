import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {mkdtemp,mkdir,rm,writeFile} from 'node:fs/promises';
import {createServer} from 'node:net';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {test} from 'node:test';
import {createProfile,profileActor} from '../../bot/src/profiles.ts';
import {loadMission} from '../../bot/src/runner.ts';

test('product server automatically reconciles a pre-submission interruption after restart', {timeout:45000,skip:(process.platform!=='darwin'&&process.platform!=='linux')},async()=>{
 const dir=await mkdtemp(join(tmpdir(),'doc-sync-product-auto-recovery-'));
 const listener=createServer();listener.listen(0,'127.0.0.1');await once(listener,'listening');const address=listener.address();assert.ok(address&&typeof address!=='string');await new Promise<void>(resolve=>listener.close(()=>resolve()));
 const origin=`http://127.0.0.1:${address.port}`,url=`${origin}/profiles/word`,doc='auto-recover';
 const profile=await createProfile(dir,{id:'mori',name:'Mori',character:'fox',personality:'careful',role:'writer',color:'#a14418'});
 const actor=profileActor(profile,url,doc),id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
 await mkdir(join(dir,'missions'));
 await writeFile(join(dir,'missions',`${id}.json`),JSON.stringify({id,profileId:'mori',recoveryProtocol:1,url,document:doc,actor,mission:'Test',name:'Mori',color:'#a14418',character:'fox',personality:'careful',role:'writer',expression:'thinking',status:'running',createdAt:'2026-01-01T00:00:00Z',updatedAt:'2026-01-01T00:00:00Z',steps:[],history:[],pending:null}));
 const serverPath=fileURLToPath(new URL('../products/serve.mjs',import.meta.url));let child:ReturnType<typeof spawn>|undefined;
 const start=async()=>{const p=spawn(process.execPath,[serverPath],{env:{...process.env,PRODUCT_ENABLE_BOTS:'1',PRODUCT_PORT:String(address.port),PRODUCT_DATA_DIR:join(dir,'data'),PRODUCT_BOT_STATE_DIR:dir},stdio:['ignore','pipe','pipe']});let out='',err='';p.stderr!.on('data',b=>err+=b);await new Promise<void>((resolve,reject)=>{const timer=setTimeout(()=>reject(Error(`server timeout: ${err}`)),15000);p.once('exit',c=>reject(Error(`server exit ${c}: ${err}`)));p.stdout!.on('data',b=>{out+=b;if(out.includes('"backends"')){clearTimeout(timer);resolve();}});});return p;};
 const stop=async()=>{if(child&&child.exitCode===null&&child.signalCode===null){const done=once(child,'exit');child.kill('SIGTERM');await done;}};
 try{
  child=await start();let mission=await loadMission(dir,id);const deadline=Date.now()+15000;
  while(mission.status==='running'&&Date.now()<deadline){await new Promise(r=>setTimeout(r,50));mission=await loadMission(dir,id);}
  assert.equal(mission.status,'needs_attention');assert.equal(mission.pending,null);
  // The mission is saved before recovery closes its session and releases its claim.
  // Wait for the controller to report that cleanup has also completed.
  const readView=async()=>{const response=await fetch(`${origin}/test/bot?profile=word&doc=${doc}`);assert.equal(response.status,200);return await response.json() as {jobs:Array<{status:string;blocked:boolean}>};};
  let view=await readView();
  while((view.jobs[0]?.status!=='needs_attention'||view.jobs[0]?.blocked!==false)&&Date.now()<deadline){await new Promise(r=>setTimeout(r,50));view=await readView();}
  assert.equal(view.jobs[0]?.status,'needs_attention');assert.equal(view.jobs[0]?.blocked,false);
  await stop();child=await start();const again=await loadMission(dir,id);assert.deepEqual(again,mission);
 }finally{await stop();await rm(dir,{recursive:true,force:true});}
});
