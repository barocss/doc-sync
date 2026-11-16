import {createServer} from 'node:http';
import {constants} from 'node:fs';
import {open,readFile,writeFile} from 'node:fs/promises';
import {randomBytes,timingSafeEqual} from 'node:crypto';
import {dirname,join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';

const MAX=262144, TTL=2*60*60*1000;
const secret=()=>randomBytes(32).toString('base64url');
const equal=(a,b)=>typeof a==='string'&&typeof b==='string'&&Buffer.byteLength(a)===Buffer.byteLength(b)&&timingSafeEqual(Buffer.from(a),Buffer.from(b));
const loopback=u=>u.protocol==='http:'&&['127.0.0.1','[::1]'].includes(u.hostname);
const keys=(o,allowed)=>o&&typeof o==='object'&&!Array.isArray(o)&&Object.keys(o).every(k=>allowed.includes(k));
class Rejected extends Error{constructor(status=400){super('Request rejected');this.status=status;}}
async function bounded(stream){let n=0;const chunks=[];for await(const chunk of stream){n+=chunk.length;if(n>MAX)throw new Rejected(413);chunks.push(chunk);}return Buffer.concat(chunks).toString('utf8');}
export async function readReviewConfig(path){
 const file=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
 try{
  const s=await file.stat();if(!s.isFile()||s.nlink!==1||(s.mode&0o777)!==0o600||s.size>MAX||!process.getuid||s.uid!==process.getuid())throw new Error('Invalid private review configuration');
  const buffer=Buffer.alloc(MAX+1);let n=0;while(n<buffer.length){const r=await file.read(buffer,n,buffer.length-n,null);if(!r.bytesRead)break;n+=r.bytesRead;}if(n>MAX)throw new Error('Invalid private review configuration');
  const c=JSON.parse(buffer.subarray(0,n).toString('utf8'));
  if(!keys(c,['enabled','endpoint','token','editorUrl','document'])||c.enabled!==true||typeof c.token!=='string'||!/^[A-Za-z0-9_-]{43,256}$/.test(c.token)||typeof c.document!=='string'||!/^[A-Za-z0-9_-]{1,128}$/.test(c.document))throw new Error('Invalid private review configuration');
  const endpoint=new URL(c.endpoint),editor=new URL(c.editorUrl);
  if(endpoint.username||endpoint.password||endpoint.search||endpoint.hash||!/^\/mcp\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+$/.test(endpoint.pathname)||!(endpoint.protocol==='https:'||loopback(endpoint)))throw new Error('Invalid private review configuration');
  if(!loopback(editor)||editor.username||editor.password||editor.hash||editor.pathname!=='/pm'||[...editor.searchParams].length!==1||editor.searchParams.get('doc')!==c.document)throw new Error('Invalid private review configuration');
  if(JSON.stringify({editorUrl:editor.href,document:c.document}).includes(c.token))throw new Error('Invalid private review configuration');
  return {endpoint:endpoint.href,token:c.token,editorUrl:editor.href,document:c.document};
 }finally{await file.close();}
}
/** Explicit owner-only local launch. No child process receives credentials. */
export async function startReviewServer({configPath,port=0,assetsDir=dirname(fileURLToPath(import.meta.url))}={}){
 let config;try{config=await readReviewConfig(configPath);}catch{throw new Error('Review disabled or private configuration invalid');}
 if(!Number.isInteger(port)||port<0||port>65535)throw new Error('Invalid local port');
 let bootstrap=secret();const session=secret(),csrf=secret(),expiresAt=Date.now()+TTL;let activated=false,origin='';
 const metadata=()=>({csrf,expiresAt,editorUrl:config.editorUrl,document:config.document});
 const server=createServer(async(req,res)=>{
  const headers={'cache-control':'no-store','x-content-type-options':'nosniff','referrer-policy':'no-referrer','cross-origin-resource-policy':'same-origin',
   'content-security-policy':`default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; frame-src ${new URL(config.editorUrl).origin}; frame-ancestors 'none'; base-uri 'none'; form-action 'none'`};
  const send=(status,value)=>{const raw=JSON.stringify(value);res.writeHead(status,{...headers,'content-type':'application/json'});res.end(raw);};
  try{
   if(req.headers.host!==new URL(origin).host)throw new Rejected(403);
   if(req.headers.origin!==undefined&&req.headers.origin!==origin)throw new Rejected(403);
   if(req.headers['sec-fetch-site']&&!['same-origin','none'].includes(req.headers['sec-fetch-site']))throw new Rejected(403);
   const u=new URL(req.url,origin);if(u.origin!==origin||u.search||u.hash)throw new Rejected(400);
   if(req.method==='GET'&&['/','/review.html','/review.js','/review.css'].includes(u.pathname)){
    const name=u.pathname==='/'?'review.html':u.pathname.slice(1);const content=await readFile(join(assetsDir,name));
    res.writeHead(200,{...headers,'content-type':name.endsWith('.js')?'text/javascript':name.endsWith('.css')?'text/css':'text/html'});res.end(content);return;
   }
   if(Date.now()>=expiresAt)throw new Rejected(401);
   if(req.method==='POST'){
    if(req.headers.origin!==origin||req.headers['content-type']!=='application/json')throw new Rejected(403);
   }
   if(u.pathname==='/session'&&req.method==='POST'){
    const input=JSON.parse(await bounded(req));
    if(activated||!keys(input,['secret'])||!equal(input.secret,bootstrap))throw new Rejected(401);
    activated=true;bootstrap=null;send(200,{session,...metadata()});return;
   }
   if(!activated||!equal(req.headers['x-review-session'],session))throw new Rejected(401);
   if(u.pathname==='/session'&&req.method==='GET'){send(200,metadata());return;}
   const match=/^\/api\/proposals(?:\/([a-f0-9]{64})(?:\/(accept|reject|reconcile))?)?$/.exec(u.pathname);
   if(!match||!((req.method==='GET'&&!match[2])||(req.method==='POST'&&match[1]&&match[2])))throw new Rejected(405);
   let body;
   if(req.method==='POST'){
    if(!equal(req.headers['x-csrf-token'],csrf))throw new Rejected(403);
    const input=JSON.parse(await bounded(req));
    if(!keys(input,['requestId','proposalDigest'])||typeof input.requestId!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.requestId)||typeof input.proposalDigest!=='string'||!/^[a-f0-9]{64}$/.test(input.proposalDigest))throw new Rejected(400);
    body=JSON.stringify(input);
   }
   const suffix=(match[1]?`/${match[1]}`:'')+(match[2]?`/${match[2]}`:'');
   const response=await fetch(`${config.endpoint}/proposals${suffix}`,{method:req.method,redirect:'error',headers:{authorization:`Bearer ${config.token}`,...(body?{'content-type':'application/json'}:{})},body,signal:AbortSignal.timeout(30000)});
   if(!response.ok){await response.body?.cancel();throw new Rejected([400,401,403,404,405,409,413,429,503].includes(response.status)?response.status:502);}
   if(!response.body)throw new Rejected(502);
   const raw=await bounded(response.body),value=JSON.parse(raw);
   // A faulty upstream must not reflect a credential into the browser.
   if(raw.includes(config.token)||JSON.stringify(value).includes(config.token))throw new Rejected(502);
   send(200,value);
  }catch(error){if(!res.headersSent)send(error instanceof Rejected?error.status:502,{error:'Review request not confirmed; inspect server state before retrying.'});else res.destroy();}
 });
 server.requestTimeout=15000;server.headersTimeout=10000;server.maxRequestsPerSocket=100;
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});
 origin=`http://127.0.0.1:${server.address().port}`;
 if(new URL(config.editorUrl).origin===origin){await new Promise(r=>server.close(r));throw new Error('Editor must use a separate origin');}
 return {origin,bootstrapUrl:`${origin}/#${bootstrap}`,close:()=>new Promise(resolve=>{server.closeAllConnections();server.close(resolve);})};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 let instance;try{
  const args=process.argv.slice(2);if(args.length!==4||args[0]!=='--config'||args[2]!=='--access-file')throw new Error('Invalid launch options');
  instance=await startReviewServer({configPath:args[1]});
  await writeFile(args[3],instance.bootstrapUrl+'\n',{flag:'wx',mode:0o600});
  process.stdout.write(`Owner review bridge listening at ${instance.origin}. Open the private access file locally.\n`);
  for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>{void instance.close().then(()=>process.exit(0));});
 }catch{if(instance)await instance.close();process.stderr.write('Review bridge not started: check explicit private configuration and new access-file path.\n');process.exitCode=1;}
}
