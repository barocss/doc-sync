import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createServer,request} from 'node:http';
import {mkdtemp,writeFile,readFile,stat,chmod,symlink,rm} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {fileURLToPath} from 'node:url';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {startReviewServer,readReviewConfig} from './bridge.mjs';
const token='a'.repeat(64),id='b'.repeat(64),digest='c'.repeat(64);
const rawStatus=(url,headers)=>new Promise((resolve,reject)=>{const req=request(url,{headers},res=>{res.resume();res.on('end',()=>resolve(res.statusCode));});req.on('error',reject);req.end();});
async function setup(t){
 const dir=await mkdtemp(join(tmpdir(),'review-bridge-'));let handler=(req,res)=>res.end(JSON.stringify({status:'pending'}));const requests=[];
 const upstream=createServer(async(req,res)=>{let body='';for await(const b of req)body+=b;requests.push({path:req.url,authorization:req.headers.authorization,body});handler(req,res);});await new Promise(r=>upstream.listen(0,'127.0.0.1',r));
 const endpoint=`http://127.0.0.1:${upstream.address().port}/mcp/t/d/owner`,path=join(dir,'config.json');const config={enabled:true,endpoint,token,editorUrl:'http://127.0.0.1:9999/pm?doc=doc',document:'doc'};
 await writeFile(path,JSON.stringify(config),{mode:0o600});for(const name of ['review.html','review.js','review-list.js','review.css'])await writeFile(join(dir,name),'safe asset');
 const bridge=await startReviewServer({configPath:path,assetsDir:dir});
 t.after(async()=>{await bridge.close();await new Promise(r=>{upstream.closeAllConnections();upstream.close(r);});await rm(dir,{recursive:true,force:true});});
 const post=(url,body,headers={})=>fetch(bridge.origin+url,{method:'POST',headers:{origin:bridge.origin,'content-type':'application/json',...headers},body:JSON.stringify(body)});
 const login=async()=>{const r=await post('/session',{secret:new URL(bridge.bootstrapUrl).hash.slice(1)});assert.equal(r.status,200);return r.json();};
 return {dir,path,config,bridge,requests,post,login,setHandler:fn=>handler=fn};
}
test('config: explicit enable, private owner permissions, no symlink or unsafe URL',async t=>{
 const s=await setup(t);await chmod(s.path,0o644);await assert.rejects(readReviewConfig(s.path));await chmod(s.path,0o600);const link=join(s.dir,'link');await symlink(s.path,link);await assert.rejects(readReviewConfig(link));
 for(const patch of [{enabled:false},{endpoint:'http://example.com/mcp/t/d/a'},{endpoint:s.config.endpoint+'?x=1'},{endpoint:'https://u:p@example.com/mcp/t/d/a'},{editorUrl:'http://example.com/pm?doc=doc'},{editorUrl:'http://127.0.0.1:9999/pm?doc=other'},{editorUrl:'http://127.0.0.1:9999/pm?doc=doc&x=1'}]){await writeFile(s.path,JSON.stringify({...s.config,...patch}),{mode:0o600});await assert.rejects(readReviewConfig(s.path));}
 await assert.rejects(startReviewServer({}),/disabled/);
});
test('single-use bootstrap, session authorization, foreign Origin and Host rejection',async t=>{
 const s=await setup(t);assert.equal((await fetch(s.bridge.origin+'/api/proposals')).status,401);
 assert.equal((await s.post('/session',{secret:new URL(s.bridge.bootstrapUrl).hash.slice(1)},{origin:'http://evil.example'})).status,403);
 assert.equal((await s.post('/session',{secret:'wrong'})).status,401);
 const auth=await s.login();assert.equal(auth.document,'doc');assert(!JSON.stringify(auth).includes(token));
 assert.equal((await s.post('/session',{secret:new URL(s.bridge.bootstrapUrl).hash.slice(1)})).status,401);
 const restored=await fetch(s.bridge.origin+'/session',{headers:{'x-review-session':auth.session}});assert.equal(restored.status,200);assert.equal(restored.headers.get('set-cookie'),null);assert.equal((await restored.json()).csrf,auth.csrf);
 for(const headers of [{origin:'http://127.0.0.1:9998'},{host:'evil.example'},{'sec-fetch-site':'cross-site'}])assert.equal(await rawStatus(s.bridge.origin+'/api/proposals',{'x-review-session':auth.session,...headers}),403,JSON.stringify(headers));
 assert.equal(s.requests.length,0);
});
test('fixed proxy allowlist and CSRF guarded exact decision bodies',async t=>{
 const s=await setup(t),auth=await s.login(),headers={'x-review-session':auth.session,'x-csrf-token':auth.csrf},body={requestId:randomUUID(),proposalDigest:digest};
 assert.equal((await fetch(s.bridge.origin+'/api/proposals',{headers})).status,200);assert.equal(s.requests[0].path,'/mcp/t/d/owner/proposals');assert.equal(s.requests[0].authorization,`Bearer ${token}`);
 for(const action of ['accept','reject','reconcile'])assert.equal((await s.post(`/api/proposals/${id}/${action}`,body,headers)).status,200);
 const count=s.requests.length;
 for(const [url,b,h] of [[`/api/proposals/${id}/accept`,body,{'x-review-session':auth.session}],[`/api/proposals/${id}/accept`,{...body,edits:[]},headers],['/api/proposals',body,headers],[`/api/proposals/${id}/delete`,body,headers],[`/api/proposals/${id}/accept?endpoint=http://evil`,body,headers]])assert.notEqual((await s.post(url,b,h)).status,200);
 assert.equal(s.requests.length,count);
});
test('redirect, credential reflection, upstream errors and oversized data fail closed',async t=>{
 const s=await setup(t),auth=await s.login(),headers={'x-review-session':auth.session};let redirected=0;const foreign=createServer((req,res)=>{redirected++;res.end('bad');});await new Promise(r=>foreign.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>{foreign.closeAllConnections();foreign.close(r);}));
 s.setHandler((req,res)=>{res.writeHead(302,{location:`http://127.0.0.1:${foreign.address().port}/steal`});res.end();});assert.equal((await fetch(s.bridge.origin+'/api/proposals',{headers})).status,502);assert.equal(redirected,0);
 for(const [status,value] of [[200,{token}],[500,{error:token}],[200,{data:'x'.repeat(262145)}]]){s.setHandler((req,res)=>{res.writeHead(status);res.end(JSON.stringify(value));});const r=await fetch(s.bridge.origin+'/api/proposals',{headers});assert.notEqual(r.status,200);assert(!(await r.text()).includes(token));}
 const r=await s.post(`/api/proposals/${id}/accept`,{requestId:randomUUID(),proposalDigest:digest,extra:'x'.repeat(262145)},{...headers,'x-csrf-token':auth.csrf});assert.notEqual(r.status,200);
});
test('assets have allowlist, no-store, no-referrer and fixed frame origin',async t=>{
 const s=await setup(t);const r=await fetch(s.bridge.origin+'/');assert.equal(r.status,200);assert.equal(r.headers.get('cache-control'),'no-store');assert.match(r.headers.get('content-security-policy'),/frame-ancestors 'none'/);assert.match(r.headers.get('content-security-policy'),/frame-src http:\/\/127.0.0.1:9999/);assert.equal(r.headers.get('referrer-policy'),'no-referrer');assert(!s.bridge.bootstrapUrl.includes(token));assert.equal((await fetch(s.bridge.origin+'/bridge.mjs')).status,401);
});

test('CLI emits no bootstrap or upstream credential; access file is exclusive0600',async t=>{
 const s=await setup(t),file=join(s.dir,'access.txt');
 const launch=()=>spawn(process.execPath,[fileURLToPath(new URL('./bridge.mjs',import.meta.url)),'--config',s.path,'--access-file',file],{stdio:['ignore','pipe','pipe']});
 const child=launch();let output='';child.stdout.on('data',b=>output+=b);child.stderr.on('data',b=>output+=b);
 t.after(async()=>{if(child.exitCode===null&&child.signalCode===null){const end=once(child,'exit');child.kill('SIGTERM');await end;}});
 for(let n=0;n<100&&!output.includes('listening');n++)await new Promise(r=>setTimeout(r,25));
 assert.match(output,/listening/);const url=(await readFile(file,'utf8')).trim();assert.match(url,/^http:\/\/127.0.0.1:\d+\/#/);assert.equal((await stat(file)).mode&0o777,0o600);assert(!output.includes(new URL(url).hash.slice(1)));assert(!output.includes(token));
 const again=launch();let second='';again.stdout.on('data',b=>second+=b);again.stderr.on('data',b=>second+=b);const [code]=await once(again,'exit');assert.equal(code,1);assert(!second.includes(token));assert.equal((await readFile(file,'utf8')).trim(),url);
});

test('queue module is served as an allowlisted local JavaScript asset',async t=>{
 const s=await setup(t);const response=await fetch(s.bridge.origin+'/review-list.js');assert.equal(response.status,200);assert.match(response.headers.get('content-type'),/javascript/);assert.equal(await response.text(),'safe asset');assert.equal(s.requests.length,0);
});
