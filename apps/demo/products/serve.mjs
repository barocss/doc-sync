import {spawn} from 'node:child_process';
import {createServer,request} from 'node:http';
import {readFileSync,mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {PRODUCT_SCHEMAS} from '../../../fixtures/product-schemas.ts';
import {productDocument} from './documents.ts';
import {remoteEdit} from '../compat/remote-edit.mjs';
const root=fileURLToPath(new URL('../../../',import.meta.url)),backends={},children=[],seeding=new Map();
const bundle=resolve(root,process.env.PRODUCT_BUNDLE??'output/playwright/product-native/bundle.js');
const stop=()=>{for(const child of children)child.kill('SIGTERM');server.closeAllConnections();server.close(()=>process.exit());};
let stopping=false;
const server=createServer(async(req,res)=>{
 const url=new URL(req.url,'http://localhost');
 const json=(code,data)=>{res.writeHead(code,{'content-type':'application/json'});res.end(JSON.stringify(data));};
 try{
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
  const dataDir=mkdtempSync(join(tmpdir(),`doc-sync-product-${profile}-`));
  const child=spawn(process.execPath,[join(root,'apps/demo/server.ts')],{env:{...process.env,PORT:'0',DATA_DIR:dataDir,DOC_PROFILE:profile,NO_SCHEMA:''},stdio:['ignore','pipe','inherit']});children.push(child);
  const url=await new Promise((resolve,reject)=>{let output='';child.once('error',reject);child.once('exit',code=>reject(new Error(`Backend ${profile} exited: ${code}`)));child.stdout.on('data',chunk=>{output+=chunk;const found=output.match(/http:\/\/localhost:\d+/);if(found)resolve(found[0]);});});
  backends[profile]={url,dataDir};
  child.on('exit',()=>{if(!stopping){stopping=true;stop();}});
 }
 server.listen(Number(process.env.PRODUCT_PORT??5413),'127.0.0.1',()=>console.log(JSON.stringify({url:`http://127.0.0.1:${server.address().port}`,backends})));
}catch(error){for(const child of children)child.kill();throw error;}
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{if(!stopping){stopping=true;stop();}});
