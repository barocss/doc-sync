// Synthetic private fixture. IPC only: no bearer or access URL is logged.
import {fixture,call,until} from '../../mcp/test/hosted-fixtures.ts';
import {startReviewServer} from './bridge.mjs';
import {writeFile,readFile,readdir} from 'node:fs/promises';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {createHostedService} from '../../mcp/src/hosted.ts';
import {DocumentSession} from '../../mcp/src/session.ts';
import {NodeHttpTransport} from '@barocss/doc-sync/node';
import {once} from 'node:events';
let human:DocumentSession|undefined,armed=false;
const f=await fixture({intercept:async req=>{if(armed&&req.url?.includes('/conditional')){armed=false;await human!.edit((await human!.read()).revision!,[{op:'insert',at:[0,0],content:'Race peer '}]);}return false;}});f.service.config.proposals.enabled=true;f.service.config.proposals.acceptanceEnabled=true;
f.service.config.grants[0]!.permissions.push('proposal_read','proposal_decide','proposal_accept');f.service.config.grants[1]!.permissions.push('proposal_create');
const editorUrl=f.upstream.url.replace('localhost','127.0.0.1')+'/pm?doc=doc';
const configPath=join(f.dir,'review.json');await writeFile(configPath,JSON.stringify({enabled:true,endpoint:f.endpoint.href,token:f.token,editorUrl,document:'doc'}),{mode:0o600});
const bridge=await startReviewServer({configPath});
const request=async(suffix='',method='GET',data?:unknown,token=f.readToken)=>{const r=await fetch(`${f.endpoint}/proposals${suffix}`,{method,headers:{authorization:`Bearer ${token}`,...(data?{'content-type':'application/json'}:{})},...(data?{body:JSON.stringify(data)}:{})});if(!r.ok)throw Error(`Fixture proposal HTTP ${r.status}`);return r.json();};
async function create(replacement='Proposed ',supersedes?:string){const base=await request('/base');return request('','POST',{requestId:randomUUID(),base,...(supersedes?{supersedes}:{}),change:{kind:'replace_text',path:[0],blockId:'0@~root',start:0,end:0,replacement},explanation:'<img src=x onerror="window.proposalInjected=true"> is untrusted text.',assumptions:['Root plain text only'],questions:[],checks:[{reference:'owner-review',status:'unchecked'}]});}
let service=f.service;
let damaged:{path:string;bytes:Buffer}|undefined;
let closing=false;
const close=async()=>{if(closing)return;closing=true;await bridge.close();await human?.close();if(service!==f.service)await service.shutdown();await f.cleanup();process.exit(0);};
process.on('message',async(message:any)=>{try{let result;switch(message.command){case 'create':result=await create(message.replacement,message.supersedes);break;case 'damage-proof':{const record=await request('/'+message.id,'GET',undefined,f.token);if(record.status!=='not_applied'||damaged)throw Error('Expected terminal negative proof');const files=await readdir(service.config.dataDir,{recursive:true});const file=files.find(p=>p.endsWith('/'+record.attempt.id+'.not-applied.json'));if(!file)throw Error('Missing negative proof');const path=join(service.config.dataDir,file);damaged={path,bytes:await readFile(path)};await writeFile(path,'corrupt fixture proof');result=true;break;}case 'restore-proof':{if(!damaged)throw Error('No retained proof');await writeFile(damaged.path,damaged.bytes);damaged=undefined;result=true;break;}case 'restart':{const config=structuredClone(service.config);await service.shutdown();service=createHostedService(config);service.server.listen(Number(f.endpoint.port),'127.0.0.1');await once(service.server,'listening');result=true;break;}case 'arm-race':{const transport=new NodeHttpTransport('doc','recovery-peer',f.service.config.routes[0]!.upstream);const schema=await transport.getSchema();human=new DocumentSession('recovery-peer',transport,schema.schema!);await human.start();await until(()=>human!.client.synchronized);armed=true;result=true;break;}case 'close-race':await human?.close();human=undefined;result=true;break;case 'state':result=await (await fetch(f.upstream.url+'/api/docs/doc/state')).json();break;case 'sent':result=f.requests.filter(r=>r.url.includes('/conditional')).length;break;case 'undo':{const c=await f.connect();try{result=await call(c.client,'undo');}finally{await c.transport.terminateSession();await c.client.close();}break;}case 'stop':await close();return;default:throw Error('Unknown fixture command');}process.send?.({request:message.request,result});}catch(error){process.send?.({request:message.request,error:String(error)});}});
process.once('SIGTERM',close);process.once('SIGINT',close);
process.send?.({ready:true,bootstrapUrl:bridge.bootstrapUrl,origin:bridge.origin,editorUrl,proposal:await create()});
