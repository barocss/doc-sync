import {spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {createServer,request} from 'node:http';
import {readFileSync,mkdtempSync,mkdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {PRODUCT_SCHEMAS} from '../../../fixtures/product-schemas.ts';
import {productDocument} from './documents.ts';
import {remoteEdit} from '../compat/remote-edit.mjs';
import {durableBots} from './durable-bots.mjs';
const botProfiles={mori:{name:'Mori',character:'fox',personality:'curious',role:'writer'},nuri:{name:'Nuri',character:'owl',personality:'careful',role:'reviewer'},bori:{name:'Bori',character:'cat',personality:'creative',role:'writer'},tobi:{name:'Tobi',character:'robot',personality:'concise',role:'organizer'}};
const botJobs=new Map(),botEnabled=process.env.PRODUCT_ENABLE_BOTS==='1',botState=process.env.PRODUCT_BOT_STATE_DIR?resolve(process.env.PRODUCT_BOT_STATE_DIR):null,dataRoot=process.env.PRODUCT_DATA_DIR?resolve(process.env.PRODUCT_DATA_DIR):null;
if(botState&&(!botEnabled||!dataRoot||!process.env.PRODUCT_PORT||Number(process.env.PRODUCT_PORT)===0||(process.platform!=='darwin'&&process.platform!=='linux')))throw Error('Durable bot demo requires macOS or Linux, PRODUCT_ENABLE_BOTS=1, PRODUCT_DATA_DIR and a fixed PRODUCT_PORT');
const root=fileURLToPath(new URL('../../../',import.meta.url)),backends={},children=[],seeding=new Map();
const bundle=resolve(root,process.env.PRODUCT_BUNDLE??'output/playwright/product-native/bundle.js');
const durable=botState?durableBots({root,stateDir:botState,model:process.env.PRODUCT_BOT_MODEL,children}):null;
const stop=()=>{for(const child of children)child.kill('SIGTERM');server.closeAllConnections();server.close(()=>process.exit());};
let stopping=false;
const server=createServer(async(req,res)=>{
 const url=new URL(req.url,'http://localhost');
 const json=(code,data)=>{res.writeHead(code,{'content-type':'application/json'});res.end(JSON.stringify(data));};
 try{
  if(url.pathname==='/test/bot'){
   if(!botEnabled)return json(404,{error:'Bot demo is disabled'});
   // This is a loopback-only development demo. A cross-origin page cannot launch a model.
   const expected=`http://127.0.0.1:${server.address().port}`;
   if(req.headers.host!==`127.0.0.1:${server.address().port}` || (req.method==='POST'&&req.headers.origin!==expected))return json(403,{error:'Invalid origin'});
   if(req.method==='GET'){
    const profile=url.searchParams.get('profile'),doc=url.searchParams.get('doc');
    if(durable){if(!Object.hasOwn(PRODUCT_SCHEMAS,profile)||typeof doc!=='string'||!/^[a-z0-9-]{1,40}$/.test(doc))return json(400,{error:'Invalid document'});return json(200,await durable.records(profile,doc,expected));}
    const jobs=Object.keys(botProfiles).map(bot=>botJobs.get(`${profile}/${doc}/${bot}`)).filter(Boolean);
    return json(200,{enabled:true,jobs,job:jobs.find(job=>job.bot==='mori')??null});
   }
   if(req.method!=='POST')return json(405,{error:'Method not allowed'});
   let text='';for await(const chunk of req){text+=chunk;if(text.length>10000)throw Error('Request too large');}
   const {profile,doc,mission,bot='mori',action}=JSON.parse(text);
   if(durable){if(!Object.hasOwn(PRODUCT_SCHEMAS,profile))return json(400,{error:'Invalid profile'});try{if(action==='recover'){await durable.recover({profile,doc,id:bot,origin:expected});return json(202,{status:'checking'});}if(action!==undefined)return json(400,{error:'Invalid action'});return json(202,{job:await durable.launch({profile,doc,id:bot,mission,origin:expected})});}catch(error){return json(error.status??500,{error:error.message});}}
   if(!Object.hasOwn(PRODUCT_SCHEMAS,profile)||typeof doc!=='string'||!/^[a-z0-9-]{1,40}$/.test(doc)||typeof mission!=='string'||!mission.trim()||mission.length>2000||typeof bot!=='string'||!Object.hasOwn(botProfiles,bot))return json(400,{error:'Invalid bot mission'});
   const key=`${profile}/${doc}/${bot}`;if(botJobs.get(key)?.status==='running')return json(409,{error:'This bot is already working on the document'});
   const spec=botProfiles[bot];
   const actor=`bot-${randomUUID()}`,stateDir=mkdtempSync(join(tmpdir(),'doc-sync-live-bot-'));
   const args=[join(root,'apps/bot/src/main.ts'),'run','--url',`${expected}/profiles/${profile}`,'--doc',doc,'--actor',actor,'--name',spec.name,'--character',spec.character,'--personality',spec.personality,'--role',spec.role,'--mission',mission,'--state-dir',stateDir,'--max-steps','8','--ephemeral','true'];
   if(process.env.PRODUCT_BOT_MODEL)args.push('--model',process.env.PRODUCT_BOT_MODEL);
   const job={bot,name:spec.name,role:spec.role,status:'running',actor,result:null,error:null};botJobs.set(key,job);
   const child=spawn(process.execPath,args,{cwd:root,env:process.env,stdio:['ignore','pipe','pipe']});children.push(child);
   let output='',error='';child.stdout.on('data',chunk=>{output=(output+chunk).slice(-1024*1024)});child.stderr.on('data',chunk=>{error=(error+chunk).slice(-4000)});
   const timer=setTimeout(()=>child.kill('SIGTERM'),300000);timer.unref();
   child.once('error',()=>{job.status='needs_attention';job.error='Could not start the bot.';});
   child.once('close',code=>{clearTimeout(timer);try{const result=JSON.parse(output);job.status=result.status==='completed'?'completed':'needs_attention';job.result=result.result??null;job.error=result.error??null;}catch{job.status='needs_attention';job.error=code===0?'Invalid bot result':`Bot process stopped (exit ${code}).`;}});
   return json(202,{job});
  }
  if(req.method==='POST'&&(url.pathname==='/test/seed'||url.pathname==='/test/remote')){
   let text='';for await(const chunk of req){text+=chunk;if(text.length>1_000_000)throw new Error('Request too large');}
   const body=JSON.parse(text),{profile,doc}=body;
   if(!Object.hasOwn(PRODUCT_SCHEMAS,profile)||typeof doc!=='string'||!/^[a-z0-9-]{1,40}$/.test(doc))return json(400,{error:'Invalid profile or document'});
   if(url.pathname==='/test/remote')return json(200,await remoteEdit(backends[profile].url,{doc,edits:body.edits},PRODUCT_SCHEMAS[profile]));
   if(body.size!==undefined&&!['sample','large'].includes(body.size))return json(400,{error:'Invalid document size'});
   const key=`${profile}/${doc}`;
   if(!seeding.has(key))seeding.set(key,(async()=>{
    const state=await(await fetch(`${backends[profile].url}/api/docs/${doc}/state`)).json();
    if(state.serverSeq)return {existing:true};
    const model=productDocument(profile,body.size==='large'?100000:0);
    const result=await remoteEdit(backends[profile].url,{doc,edits:[{op:'delete',at:[0],count:state.model.children.length},{op:'insert',at:[0],content:model.children}]},PRODUCT_SCHEMAS[profile]);
    return {existing:false,serverSeq:result.serverSeq};
   })().catch(error=>{seeding.delete(key);throw error;}));
   return json(200,await seeding.get(key));
  }
  const route=/^\/profiles\/(word|notion|presentation)(\/api\/docs\/.*)$/.exec(url.pathname);
  if(route){
   const target=backends[route[1]].url+route[2]+url.search;
   const proxy=request(target,{method:req.method,headers:{...req.headers,host:new URL(target).host}},upstream=>{res.writeHead(upstream.statusCode,upstream.headers);upstream.pipe(res);});
   proxy.on('error',error=>{if(!res.headersSent)json(502,{error:error.message});else res.destroy(error);});res.on('close',()=>proxy.destroy());req.pipe(proxy);return;
  }
  const files={'/':['apps/demo/products/index.html','text/html; charset=utf-8'],'/bundle.js':[bundle,'text/javascript'],'/bundle.js.map':[bundle+'.map','application/json']};
  if(url.pathname==='/favicon.ico'){res.writeHead(204);res.end();return;}
  const file=files[url.pathname];if(!file)return json(404,{error:'Not found'});
  res.writeHead(200,{'content-type':file[1],'cache-control':'no-store'});res.end(readFileSync(resolve(root,file[0])));
 }catch(error){if(!res.headersSent)json(500,{error:error.stack});else res.destroy(error);}
});
try{
 for(const profile of Object.keys(PRODUCT_SCHEMAS)){
  const dataDir=dataRoot?join(dataRoot,profile):mkdtempSync(join(tmpdir(),`doc-sync-product-${profile}-`));if(dataRoot)mkdirSync(dataDir,{recursive:true,mode:0o700});
  const child=spawn(process.execPath,[join(root,'apps/demo/server.ts')],{env:{...process.env,PORT:'0',DATA_DIR:dataDir,DOC_PROFILE:profile,NO_SCHEMA:''},stdio:['ignore','pipe','inherit']});children.push(child);
  const url=await new Promise((resolve,reject)=>{let output='';child.once('error',reject);child.once('exit',code=>reject(new Error(`Backend ${profile} exited: ${code}`)));child.stdout.on('data',chunk=>{output+=chunk;const found=output.match(/http:\/\/localhost:\d+/);if(found)resolve(found[0]);});});
  backends[profile]={url,dataDir};
  child.on('exit',()=>{if(!stopping){stopping=true;stop();}});
 }
 server.listen(Number(process.env.PRODUCT_PORT??5413),'127.0.0.1',()=>{
  const origin=`http://127.0.0.1:${server.address().port}`;
  console.log(JSON.stringify({url:origin,backends}));
  if(durable){const check=()=>void durable.recoverAll(origin,Object.keys(PRODUCT_SCHEMAS)).catch(()=>{});check();const timer=setInterval(check,5000);timer.unref();}
 });
}catch(error){for(const child of children)child.kill();throw error;}
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{if(!stopping){stopping=true;stop();}});
