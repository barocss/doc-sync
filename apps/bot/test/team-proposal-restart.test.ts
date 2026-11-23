import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {once} from 'node:events';
import {mkdtemp, readdir, readFile, rm} from 'node:fs/promises';
import {createServer,request} from 'node:http';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {test} from 'node:test';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
import {NodeHttpTransport} from '@barocss/doc-sync/node';
import {SyncClient} from '@barocss/doc-sync/sync';
import {WORD_SCHEMA} from '../../../fixtures/product-schemas.ts';
import {createProfile,profileActor} from '../src/profiles.ts';
import {loadMission,runMission} from '../src/runner.ts';
import type {Plan} from '../src/runner.ts';

const wait=async(check:()=>boolean)=>{const deadline=Date.now()+15000;while(!check()){if(Date.now()>deadline)throw Error('Timed out waiting for collaboration');await new Promise(r=>setTimeout(r,25));}};
const finish=(message:string):Plan=>({action:'finish',at:[],text:'',count:0,message});
const paragraph=(text:string)=>({type:'paragraph',runs:[{text,marks:{}}]});
const grid={type:'table',children:[{type:'row',children:['Phase','Owner'].map(text=>({type:'cell',children:[{type:'cell-body',children:[paragraph(text)]}]}))},{type:'row',children:['Pilot','Team'].map(text=>({type:'cell',children:[{type:'cell-body',children:[paragraph(text)]}]}))}]};

test('three profile bots and a user preserve a proposal across bot and server crashes', {timeout:90000,skip:(process.platform!=='darwin'&&process.platform!=='linux')},async t=>{
 const dir=await mkdtemp(join(tmpdir(),'doc-sync-team-proposal-')),stateDir=join(dir,'state'),doc='proposal-team';
 const serverPath=fileURLToPath(new URL('../../demo/server.ts',import.meta.url)),workerPath=fileURLToPath(new URL('./proposal-worker.ts',import.meta.url));
 let server:ReturnType<typeof spawn>|undefined,worker:ReturnType<typeof spawn>|undefined,proxy:ReturnType<typeof createServer>|undefined,human:SyncClient|undefined,transport:NodeHttpTransport|undefined,mcp:Client|undefined;
 const stop=async(p:ReturnType<typeof spawn>|undefined,signal:NodeJS.Signals='SIGTERM')=>{if(p&&p.exitCode===null&&p.signalCode===null){const done=once(p,'exit');p.kill(signal);await done;}};
 const start=async()=>{const p=spawn(process.execPath,[serverPath],{env:{...process.env,PORT:'0',DATA_DIR:join(dir,'server'),DOC_PROFILE:'word',NO_SCHEMA:''},stdio:['ignore','pipe','pipe']});let errors='';p.stderr!.on('data',b=>errors+=b);const origin=await new Promise<string>((resolve,reject)=>{let out='';const timer=setTimeout(()=>reject(Error(`server timeout ${errors}`)),12000);p.once('exit',code=>reject(Error(`server exited ${code} ${errors}`)));p.stdout!.on('data',b=>{out+=b;const match=out.match(/http:\/\/localhost:(\d+)/);if(match){clearTimeout(timer);resolve(`http://127.0.0.1:${match[1]}`);}});});return {p,origin};};
 let upstream='',writerActor='',intercept=true,signalAccepted!:()=>void;const accepted=new Promise<void>(resolve=>signalAccepted=resolve);
 const startProxy=async(port:number)=>{const p=createServer((req,res)=>{
  const path=req.url??'/',forward=(body?:Buffer)=>{const target=new URL(upstream+path);const next=request(target,{method:req.method,headers:{...req.headers,host:target.host}},reply=>{
   if(intercept&&req.method==='POST'&&path.endsWith('/conditional')&&body){let response='';reply.on('data',b=>response+=b);reply.on('end',()=>{const payload=JSON.parse(body.toString()) as {change?:{actor?:string}};const result=JSON.parse(response) as {status?:string};if(payload.change?.actor===writerActor&&result.status==='accepted'){intercept=false;signalAccepted();return;}res.writeHead(reply.statusCode??500,reply.headers);res.end(response);});return;}
   res.writeHead(reply.statusCode??502,reply.headers);reply.pipe(res);
  });next.on('error',()=>{if(!res.headersSent)res.writeHead(502);res.end();});res.on('close',()=>next.destroy());if(body)next.end(body);else req.pipe(next);};
  if(req.method==='POST'&&path.endsWith('/conditional')){const parts:Buffer[]=[];req.on('data',b=>parts.push(Buffer.from(b)));req.on('end',()=>forward(Buffer.concat(parts)));}else forward();
 });p.listen(port,'127.0.0.1');await once(p,'listening');return p;};
 const closeProxy=async()=>{if(proxy){proxy.closeAllConnections();await new Promise<void>(resolve=>proxy!.close(()=>resolve()));proxy=undefined;}};
 try{
  let started=await start();server=started.p;upstream=started.origin;proxy=await startProxy(0);const address=proxy.address();assert.ok(address&&typeof address!=='string');const url=`http://127.0.0.1:${address.port}`;
  const writer=await createProfile(stateDir,{id:'writer',name:'Writer',character:'fox',personality:'curious',role:'writer',color:'#a14418'});
  const organizer=await createProfile(stateDir,{id:'organizer',name:'Organizer',character:'robot',personality:'concise',role:'organizer',color:'#175bb5'});
  const reviewer=await createProfile(stateDir,{id:'reviewer',name:'Reviewer',character:'owl',personality:'careful',role:'reviewer',color:'#7051bd'});
  writerActor=profileActor(writer,url,doc);const organizerActor=profileActor(organizer,url,doc),reviewerActor=profileActor(reviewer,url,doc);
  transport=new NodeHttpTransport(doc,'human',url);human=new SyncClient('human',transport,{schema:WORD_SCHEMA});human.connect();await wait(()=>human!.synchronized);
  human.commit(human.doc.edit([{op:'insert',at:[0,0],content:'Project proposal'},{op:'insert',at:[1],content:[{type:'section',children:[paragraph('Executive summary'),{type:'header',children:[paragraph('Proposal header')]},{type:'footer',children:[paragraph('Proposal footer')]}]}]}]).ops);await wait(()=>human!.pending.length===0);
  worker=spawn(process.execPath,[workerPath,url,stateDir],{stdio:['ignore','ignore','pipe']});let workerError='';worker.stderr!.on('data',b=>workerError+=b);
  let timer:ReturnType<typeof setTimeout>|undefined;try{await Promise.race([accepted,new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(Error(`writer acceptance timeout ${workerError}`)),18000);})]);}finally{if(timer)clearTimeout(timer);}
  await wait(()=>JSON.stringify(human!.doc.toJSON()).includes('Deliver a shared workspace.'));
  let ready=0,release!:()=>void,entered!:()=>void;const gates=new Promise<void>(r=>release=r),both=new Promise<void>(r=>entered=r);
  const gate=async()=>{if(++ready===2)entered();await gates;};
  let organizerCalls=0,reviewerCalls=0;
  const organizerJob=runMission({url,document:doc,actor:organizerActor,stateDir,profileId:organizer.id,mission:'Add a milestone table',name:organizer.name,color:organizer.color,character:organizer.character,personality:organizer.personality,role:organizer.role,maxSteps:5},async input=>{
   if(++organizerCalls===1)await gate();if(JSON.stringify(input.document).includes('"Pilot"'))return finish('Table prepared');
   const section=(input.document as {children:Array<{children?:unknown[]}>}).children[1];return {action:'edit',at:[],text:'',count:0,message:'Add milestone table',editsJson:JSON.stringify([{op:'insert',at:[1,section.children!.length-2],content:[grid]}])};
  });
  const reviewerJob=runMission({url,document:doc,actor:reviewerActor,stateDir,profileId:reviewer.id,mission:'Review the proposal',name:reviewer.name,color:reviewer.color,character:reviewer.character,personality:reviewer.personality,role:reviewer.role,maxSteps:5},async input=>{if(++reviewerCalls===1)await gate();assert.equal(input.role,'reviewer');return finish('Reviewed proposal');});
  await both;human.commit(human.doc.edit([{op:'insert',at:[0,16],content:' [USER]'}]).ops);await wait(()=>human!.pending.length===0);release();
  const [organized,reviewed]=await Promise.all([organizerJob,reviewerJob]);assert.equal(organized.status,'completed',JSON.stringify(organized));assert.equal(reviewed.status,'completed',JSON.stringify(reviewed));assert.equal(reviewed.history.length,0);
  await wait(()=>JSON.stringify(human!.doc.toJSON()).includes('"Pilot"'));
  const names=await readdir(join(stateDir,'missions'));const records=await Promise.all(names.map(n=>readFile(join(stateDir,'missions',n),'utf8').then(JSON.parse)));const interrupted=records.find(m=>m.profileId==='writer');assert.ok(interrupted?.pending);
  await stop(worker,'SIGKILL');human.disconnect();await transport.leave().catch(()=>{});human=undefined;transport=undefined;await closeProxy();await stop(server,'SIGKILL');
  started=await start();server=started.p;upstream=started.origin;proxy=await startProxy(address.port);
  transport=new NodeHttpTransport(doc,'human-after',url);human=new SyncClient('human-after',transport,{schema:WORD_SCHEMA});human.connect();await wait(()=>human!.synchronized);
  worker=spawn(process.execPath,[workerPath,url,stateDir,interrupted.id],{stdio:['ignore','pipe','pipe']});let resumedOutput='',resumedError='';worker.stdout!.on('data',b=>resumedOutput+=b);worker.stderr!.on('data',b=>resumedError+=b);
  const [code]=await once(worker,'exit');assert.equal(code,0,resumedError);const resumed=JSON.parse(resumedOutput) as Awaited<ReturnType<typeof loadMission>>;
  assert.equal(resumed.status,'completed',JSON.stringify(resumed));assert.equal(resumed.id,interrupted.id);assert.equal(resumed.history.filter(h=>h.kind==='confirmed').length,2);
  await wait(()=>JSON.stringify(human!.doc.toJSON()).includes('Pilot in four weeks.'));
  const model=human.doc.toJSON() as {type:string;children:Array<{type:string;children?:Array<{type:string}>}>};const json=JSON.stringify(model);
  assert.equal(model.type,'word-document');assert.equal((json.match(/Deliver a shared workspace\./g)??[]).length,1);assert.equal((json.match(/Pilot in four weeks\./g)??[]).length,1);assert.equal((json.match(/\[USER\]/g)??[]).length,1);
  const section=model.children.find(node=>node.type==='section')!;assert.ok(section.children?.some(n=>n.type==='header'));assert.ok(section.children?.some(n=>n.type==='footer'));assert.equal(section.children?.filter(n=>n.type==='table').length,1);assert.equal(section.children?.filter(n=>n.type==='heading2').length,2);
  const serverState=await (await fetch(`${url}/api/docs/${doc}/state`)).json() as {model:unknown};assert.deepEqual(serverState.model,model);
  const mcpFile=fileURLToPath(new URL('../../mcp/src/main.ts',import.meta.url)),env=Object.fromEntries(Object.entries(process.env).filter((entry):entry is [string,string]=>entry[1]!==undefined));
  const undo=async(actor:string,count:number)=>{const key=createHash('sha256').update(JSON.stringify([url,doc,actor])).digest('hex');mcp=new Client({name:'proposal-undo',version:'1'});await mcp.connect(new StdioClientTransport({command:process.execPath,args:[mcpFile],stderr:'pipe',env:{...env,DOC_SYNC_URL:url,DOC_SYNC_DOCUMENT:doc,DOC_SYNC_ACTOR:actor,DOC_SYNC_DISCOVER_SCHEMA:'on',DOC_SYNC_SCHEMA:'',DOC_SYNC_JOURNAL:'on',DOC_SYNC_JOURNAL_DIR:join(stateDir,'journals',key),DOC_SYNC_MISSION_BRIDGE:''}}));const results:Array<{status?:string}>=[];for(let i=0;i<count;i++){const result=await mcp.callTool({name:'undo',arguments:{}}) as {isError?:boolean;structuredContent?:unknown};assert.equal(result.isError,undefined,JSON.stringify(result));results.push(result.structuredContent as {status?:string});}await mcp.close();mcp=undefined;return results;};
  assert.equal((await undo(reviewerActor,1))[0].status,'no_change');assert.equal(JSON.stringify(human.doc.toJSON()),json);
  await undo(writerActor,2);await wait(()=>{const value=JSON.stringify(human!.doc.toJSON());return !value.includes('Deliver a shared workspace.')&&!value.includes('Pilot in four weeks.');});
  const afterWriterUndo=JSON.stringify(human.doc.toJSON());assert.match(afterWriterUndo,/\[USER\]/);assert.match(afterWriterUndo,/"Pilot"/);
  await undo(organizerActor,1);await wait(()=>!JSON.stringify(human!.doc.toJSON()).includes('"Pilot"'));
  const final=JSON.stringify(human.doc.toJSON());assert.match(final,/\[USER\]/);assert.match(final,/Proposal header/);assert.match(final,/Proposal footer/);assert.doesNotMatch(final,/Pilot in four weeks\.|"Pilot"|Deliver a shared workspace\./);
  const finalServer=await (await fetch(`${url}/api/docs/${doc}/state`)).json() as {model:unknown};assert.deepEqual(finalServer.model,human.doc.toJSON());
  assert.equal((await loadMission(stateDir,reviewed.id)).status,'completed');
  t.diagnostic(`Writer and organizer edited; reviewer remained read-only. Planner calls: organizer ${organizerCalls}, reviewer ${reviewerCalls}. Writer resumed the same mission and two writer undos plus one organizer undo retained the user change.`);
 }finally{await mcp?.close().catch(()=>{});human?.disconnect();await transport?.leave().catch(()=>{});await stop(worker,'SIGKILL');await closeProxy();await stop(server,'SIGKILL');await rm(dir,{recursive:true,force:true});}
});
