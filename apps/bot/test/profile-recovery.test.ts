import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {once} from 'node:events';
import {mkdtemp,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {test} from 'node:test';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
import {NodeHttpTransport} from '@barocss/doc-sync/node';
import {SyncClient} from '@barocss/doc-sync/sync';
import {DEMO_SCHEMA} from '../../../fixtures/demo-schema.ts';
import {claimProfile,createProfile,profileActor,profileUrl} from '../src/profiles.ts';
import {recoverMission,runMission} from '../src/runner.ts';
const wait=async(check:()=>boolean)=>{const deadline=Date.now()+12000;while(!check()){if(Date.now()>deadline)throw Error('timeout');await new Promise(r=>setTimeout(r,25));}};
test('profile identity and history survive bot and server restarts without undoing a user', {timeout:90000,skip:(process.platform!=='darwin'&&process.platform!=='linux')},async()=>{
 const dir=await mkdtemp(join(tmpdir(),'doc-sync-profile-recovery-'));
 const serverPath=fileURLToPath(new URL('../../demo/server.ts',import.meta.url));
 let server:ReturnType<typeof spawn>|undefined, human:SyncClient|undefined, humanTransport:NodeHttpTransport|undefined, mcp:Client|undefined;
 const stop=async()=>{if(server&&server.exitCode===null&&server.signalCode===null){const done=once(server,'exit');server.kill('SIGTERM');await done;}};
 const start=async(port:string)=>{
  const child=spawn(processExec,[serverPath],{env:{...process.env,PORT:port,DATA_DIR:join(dir,'server'),NO_SCHEMA:''},stdio:['ignore','pipe','pipe']});
  let errors='';child.stderr!.on('data',b=>errors+=String(b));
  const origin=await new Promise<string>((resolve,reject)=>{let out='';const timer=setTimeout(()=>reject(Error(`server timeout ${errors}`)),10000);child.once('exit',code=>reject(Error(`server exited ${code} ${errors}`)));child.stdout!.on('data',b=>{out+=String(b);const m=out.match(/http:\/\/localhost:(\d+)/);if(m){clearTimeout(timer);resolve(`http://127.0.0.1:${m[1]}`)}})});
  return {process:child,origin};
 };
 const processExec=process.execPath;
 try{
  let started=await start('0');server=started.process;const origin=profileUrl(started.origin),port=new URL(origin).port;
  const profile=await createProfile(dir,{id:'mori',name:'Mori',character:'fox',personality:'curious',role:'writer',color:'#a14418'});
  const doc='profile-doc',actor=profileActor(profile,origin,doc);
  const onceMission=async(text:string,at:number)=>runMission({url:origin,document:doc,actor,mission:`Add ${text}`,stateDir:dir,profileId:profile.id,name:profile.name,character:profile.character,personality:profile.personality,role:profile.role,color:profile.color,maxSteps:2},async input=>input.previous.length?{action:'finish',at:[],text:'',count:0,message:'done'}:{action:'insert',at:[0,at],text,count:0,message:'inserted'});
  let entered!:()=>void,release!:()=>void;const ready=new Promise<void>(r=>entered=r),barrier=new Promise<void>(r=>release=r);
  const active=runMission({url:origin,document:doc,actor,mission:'Hold profile',stateDir:dir,maxSteps:1},async()=>{entered();await barrier;return {action:'finish',at:[],text:'',count:0,message:'held'};});
  await ready;let duplicatePlanned=false;
  const duplicate=await runMission({url:origin,document:doc,actor,mission:'Duplicate',stateDir:dir,maxSteps:1},async()=>{duplicatePlanned=true;return {action:'insert',at:[0,0],text:'X',count:0,message:'bad'};});
  assert.equal(duplicate.status,'needs_attention',JSON.stringify(duplicate));assert.equal(duplicatePlanned,false);assert.equal(duplicate.pending,null);
  release();assert.equal((await active).status,'completed');
  const first=await onceMission('A',0);assert.equal(first.status,'completed',JSON.stringify(first));assert.equal(first.profileId,'mori');
  await stop();started=await start(port);server=started.process;assert.equal(started.origin,origin);
  const second=await onceMission('B',1);assert.equal(second.status,'completed',JSON.stringify(second));assert.equal(second.actor,first.actor);
  humanTransport=new NodeHttpTransport(doc,'human',origin);human=new SyncClient('human',humanTransport,{schema:DEMO_SCHEMA});human.connect();await wait(()=>human!.synchronized);
  human.commit(human.doc.edit([{op:'insert',at:[0,2],content:'H'}]).ops);await wait(()=>human!.pending.length===0);
  const interrupted={...second,id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',status:'running',pending:{revision:{epoch:'before-send',serverSeq:0,schemaVersion:null},plan:{action:'insert',at:[0,0],text:'Z',count:0,message:'insert Z'},stepId:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'}};
  await writeFile(join(dir,'missions',`${interrupted.id}.json`),JSON.stringify(interrupted));
  const held=await claimProfile(dir,actor);
  try{await assert.rejects(recoverMission(dir,interrupted.id));}finally{await held();}
  const recovered=await recoverMission(dir,interrupted.id);assert.equal(recovered.pending,null);assert.equal(recovered.status,'needs_attention');assert.match(recovered.steps.at(-1)??'',/not submitted/);assert.match(JSON.stringify(human.doc.toJSON()),/ABH/);
  const key=createHash('sha256').update(JSON.stringify([origin,doc,actor])).digest('hex');
  const env=Object.fromEntries(Object.entries(process.env).filter((entry):entry is [string,string]=>entry[1]!==undefined));
  mcp=new Client({name:'profile-undo',version:'1'});
  await mcp.connect(new StdioClientTransport({command:process.execPath,args:[fileURLToPath(new URL('../../mcp/src/main.ts',import.meta.url))],stderr:'pipe',env:{...env,DOC_SYNC_URL:origin,DOC_SYNC_DOCUMENT:doc,DOC_SYNC_ACTOR:actor,DOC_SYNC_DISCOVER_SCHEMA:'on',DOC_SYNC_SCHEMA:'',DOC_SYNC_JOURNAL:'on',DOC_SYNC_JOURNAL_DIR:join(dir,'journals',key)}}));
  const reply=await mcp.callTool({name:'undo',arguments:{}});assert.equal(reply.isError,undefined,JSON.stringify(reply));
  await wait(()=>JSON.stringify(human!.doc.toJSON()).includes('AH'));
  const model=JSON.stringify(human.doc.toJSON());assert.ok(model.includes('AH'));assert.ok(!model.includes('ABH'));
 }finally{await mcp?.close().catch(()=>{});human?.disconnect();await humanTransport?.leave().catch(()=>{});await stop();await rm(dir,{recursive:true,force:true});}
});
