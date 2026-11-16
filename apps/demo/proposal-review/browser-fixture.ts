// Synthetic private fixture. IPC only: no bearer or access URL is logged.
import {fixture,call} from '../../mcp/test/hosted-fixtures.ts';
import {startReviewServer} from './bridge.mjs';
import {writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
const f=await fixture();f.service.config.proposals.enabled=true;f.service.config.proposals.acceptanceEnabled=true;
f.service.config.grants[0]!.permissions.push('proposal_read','proposal_decide','proposal_accept');f.service.config.grants[1]!.permissions.push('proposal_create');
const editorUrl=f.upstream.url.replace('localhost','127.0.0.1')+'/pm?doc=doc';
const configPath=join(f.dir,'review.json');await writeFile(configPath,JSON.stringify({enabled:true,endpoint:f.endpoint.href,token:f.token,editorUrl,document:'doc'}),{mode:0o600});
const bridge=await startReviewServer({configPath});
const request=async(suffix='',method='GET',data?:unknown,token=f.readToken)=>{const r=await fetch(`${f.endpoint}/proposals${suffix}`,{method,headers:{authorization:`Bearer ${token}`,...(data?{'content-type':'application/json'}:{})},...(data?{body:JSON.stringify(data)}:{})});if(!r.ok)throw Error(`Fixture proposal HTTP ${r.status}`);return r.json();};
async function create(replacement='Proposed '){const base=await request('/base');return request('','POST',{requestId:randomUUID(),base,change:{kind:'replace_text',path:[0],blockId:'0@~root',start:0,end:0,replacement},explanation:'<img src=x onerror="window.proposalInjected=true"> is untrusted text.',assumptions:['Root plain text only'],questions:[],checks:[{reference:'owner-review',status:'unchecked'}]});}
let closing=false;
const close=async()=>{if(closing)return;closing=true;await bridge.close();await f.cleanup();process.exit(0);};
process.on('message',async(message:any)=>{try{let result;switch(message.command){case 'create':result=await create(message.replacement);break;case 'state':result=await (await fetch(f.upstream.url+'/api/docs/doc/state')).json();break;case 'sent':result=f.requests.filter(r=>r.url.includes('/conditional')).length;break;case 'undo':{const c=await f.connect();try{result=await call(c.client,'undo');}finally{await c.transport.terminateSession();await c.client.close();}break;}case 'stop':await close();return;default:throw Error('Unknown fixture command');}process.send?.({request:message.request,result});}catch(error){process.send?.({request:message.request,error:String(error)});}});
process.once('SIGTERM',close);process.once('SIGINT',close);
process.send?.({ready:true,bootstrapUrl:bridge.bootstrapUrl,origin:bridge.origin,editorUrl,proposal:await create()});
