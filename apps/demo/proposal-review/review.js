import {reviewQueue} from './review-list.js';
const $=id=>document.getElementById(id),sessionKey='doc-sync-review-session-v1';
let auth,selected=null,record=null,busy=false,sequence=0,confirmation=null,items=[];
const terminal=new Set(['applied','rejected','stale','not_applied']),uncertain=new Set(['applying','unconfirmed','needs_attention']);
function text(tag,value,cls){const e=document.createElement(tag);e.textContent=String(value);if(cls)e.className=cls;return e;}
function notify(value){$('notice').textContent=value;}
const decisionKey=id=>`doc-sync-review-decision-v1:${id}`;
function savedDecision(id){const raw=localStorage.getItem(decisionKey(id));if(raw===null)return null;const d=JSON.parse(raw);if(!['accept','reject'].includes(d.kind)||!/^[-a-f0-9]{36}$/.test(d.requestId)||!/^[a-f0-9]{64}$/.test(d.proposalDigest))throw Error('Invalid local decision. Retain evidence and inspect outside this page.');return d;}
async function request(path,body){const response=await fetch(path,{method:body===undefined?'GET':'POST',headers:{'x-review-session':auth.session,...(body===undefined?{}:{'content-type':'application/json','x-csrf-token':auth.csrf})},...(body===undefined?{}:{body:JSON.stringify(body)}),redirect:'error',cache:'no-store'});if(!response.ok)throw Error(`Request not confirmed (HTTP ${response.status}). Refresh and inspect; do not assume the document is unchanged.`);return response.json();}
function action(label,fn,cls=''){const b=text('button',label,cls);b.type='button';b.disabled=busy;b.addEventListener('click',fn);return b;}
function section(title,value,cls){$('detail').append(text('h4',title),text('pre',value,cls));}
function checkedRecord(value){if(!value?.payload||value.payload.id!==selected||!/^[a-f0-9]{64}$/.test(value.proposalDigest)||!['pending',...terminal,...uncertain].includes(value.status)||value.payload.request?.change?.kind!=='replace_text')throw Error('Unsupported proposal record. Inspect outside this page.');return value;}
// Recovery guidance is derived from stored evidence, never from a failed HTTP request.
function recovery(prior){
 const status=record.status,original=record.decision??prior;
 const descriptions={
  applied:['Applied · receipt confirmed','The server recorded acceptance of this exact attempt. Do not replay it. Later peer edits or actor Undo may have changed the live document; this receipt is not a claim about its current text.'],
  not_applied:['Not applied · proof confirmed','The server proved this exact attempt was not applied. This version is terminal. A creator may prepare a separate proposal against a fresh base; inspect that new version and make a new decision.'],
  stale:['Stale · approval not submitted','The reviewed target or base changed before submission. Keep peer changes. This version cannot be approved again; a creator must prepare a separate fresh proposal for renewed review.'],
  rejected:['Rejected · version closed','This stored version was rejected. No approval transfers to a later proposal.'],
  pending:prior?['Unresolved · local decision retained','A decision was saved in this browser, but no durable server outcome is shown. Refresh stored evidence first. Because this record is still pending, you may explicitly retry the identical saved approval, or reconcile it without approving again. A retry keeps the original ID, digest and base; stale guards still apply. Never replay text manually or create another decision to escape uncertainty.']:['Pending · not yet approved','Inspect the exact change and base before making a decision. Closing the preview or cancelling confirmation does not submit anything.'],
  applying:['Unresolved · application in progress','An original approval exists, but application is not yet proven. Refresh evidence or reconcile the original attempt. No replacement approval or fresh proposal is authorized here.'],
  unconfirmed:['Unresolved · outcome unconfirmed','The original attempt may have reached the server. Reconcile its evidence; never manually replay the replacement.'],
  needs_attention:['Unresolved · owner evidence required','Available evidence cannot prove the outcome. Original-attempt reconciliation may remain blocked. Preserve the decision and evidence identifiers for owner recovery; do not infer that nothing changed.']
 };
 if(status==='pending'&&prior?.kind==='reject')descriptions.pending=['Unresolved · local rejection retained','This browser saved a rejection without a confirmed server result. Refresh evidence or retry the identical original rejection. This does not approve or apply text.'];
 const [heading,description]=descriptions[status];const box=text('section','','recovery');box.id='recovery';box.dataset.state=status==='pending'&&prior?'unresolved':status;box.append(text('h4',heading),text('p',description));
 const evidence={proposalId:record.payload.id,proposalDigest:record.proposalDigest,creationRequestId:record.payload.request.requestId,originalDecision:original?{kind:original.kind,requestId:original.requestId}:null,localDecision:prior?{kind:prior.kind,requestId:prior.requestId}:null,attemptId:record.attempt?.id,evidenceDigest:record.attempt?.evidenceDigest,notAppliedPlanDigest:record.attempt?.notAppliedPlanDigest,receipt:record.attempt?.receipt,stateVersion:record.stateVersion};
 box.append(text('pre',JSON.stringify(evidence,null,2),'metadata'),action('Refresh stored evidence',()=>inspect(selected)));
 const previous=record.payload.request.supersedes;
 if(previous&&/^[a-f0-9]{64}$/.test(previous)&&previous!==selected){box.append(text('p','Stored successor link: this proposal supersedes '+previous+'. Its base, change and decision are separate; prior approval never transfers.'),action('Inspect prior proposal',()=>inspect(previous)));}
 $('detail').append(box);
}
function renderList(){
 const queue=reviewQueue(items,$('filter').value,id=>{try{return localStorage.getItem(decisionKey(id))!==null;}catch{return true;}});
 $('list').replaceChildren();
 for(const item of queue.rows){const b=action(item.id.slice(0,10),()=>inspect(item.id));b.append(text('span',item.localDecisionPending?'unresolved · local decision':item.status));$('list').append(b);}
 const c=queue.counts;$('queue-counts').textContent=`Stored proposals: ${c.all} total · ${c.pending} pending · ${c.unresolved} unresolved · ${c.closed} closed. ${queue.rows.length} shown.`;
 if(!queue.rows.length)$('list').append(text('p','No stored proposals in this view.'));
 $('filter').disabled=busy;
}
function changeFilter(){if(busy)return;selected=null;record=null;confirmation=null;sequence++;renderList();render();notify('View changed. Choose a proposal and inspect its exact stored evidence before deciding.');}
function render(){
 const detail=$('detail');detail.replaceChildren();detail.hidden=!record;$('refresh').disabled=busy;$('filter').disabled=busy;for(const b of $('list').querySelectorAll('button'))b.disabled=busy;if(!record)return;
 const p=record.payload,r=p.request,c=r.change;detail.append(text('h3',`Review · ${record.status}`));
 section('Selected text',p.preview.removed,'removed');section('Replacement',p.preview.inserted,'inserted');section('Surrounding context',p.preview.prefix+'⟦'+p.preview.removed+'⟧'+p.preview.suffix);section('Explanation',r.explanation);section('Assumptions',(r.assumptions??[]).join('\n')||'None');section('Questions',(r.questions??[]).join('\n')||'None');section('Checks',(r.checks??[]).map(v=>`${v.reference}: unchecked`).join('\n')||'None');section('Exact target and base',JSON.stringify({path:c.path,blockId:c.blockId,start:c.start,end:c.end,base:r.base,proposalDigest:record.proposalDigest},null,2),'metadata');
 const actions=text('div','','actions');actions.append(action('Close preview',()=>{selected=null;record=null;confirmation=null;sequence++;render();}));let prior;
 try{prior=savedDecision(selected);}catch(error){notify(error.message);detail.append(actions);return;}
 recovery(prior);
 if(prior&&prior.proposalDigest!==record.proposalDigest){notify('Stored decision digest mismatch. Review outside this page.');detail.append(actions);return;}
 if(record.status==='pending'&&prior?.kind==='accept'&&!record.decision)actions.append(action('Retry same saved approval…',()=>{confirmation='retry';render();}));
 if(record.status==='pending'&&!prior){const approve=action('Approve…',()=>{confirmation='accept';render();},'primary');approve.disabled=busy||r.questions.length>0||p.before===p.after;actions.append(approve,action('Reject…',()=>{confirmation='reject';render();},'danger'));}
 else if(!terminal.has(record.status)){const original=record.decision?{kind:record.decision.kind,requestId:record.decision.requestId,proposalDigest:record.proposalDigest}:prior;if(original&&(!['accept','reject'].includes(original.kind)||!/^[-a-f0-9]{36}$/.test(original.requestId)))throw Error('Invalid original decision');if(original&&prior&&original.requestId!==prior.requestId)detail.append(text('p','The server recorded a different original decision. Reconciliation uses that server decision, not the local competing ID.'));if(original?.kind==='accept')actions.append(action('Reconcile original approval',()=>submit('reconcile',original)));else if(original?.kind==='reject')actions.append(action('Retry original rejection',()=>submit('reject',original)));else detail.append(text('p','Outcome requires inspection. No original decision is available; use the owner recovery workflow.'));}
 detail.append(actions);if(record.status==='pending'&&prior?.kind==='accept')detail.append(text('p','No durable server approval is recorded yet. Reconciliation may remain blocked. Retain the original decision and inspect through the owner workflow; do not create a new approval ID.'));if(['stale','not_applied'].includes(record.status))detail.append(text('p','No create or rebase action is available here. A separately stored successor must be selected from the proposal list and reviewed from the beginning.'));
 if(confirmation&&!busy){const kind=confirmation;const retry=kind==='retry';const box=text('div',`Confirm ${retry?'retry of the identical saved approval (same ID, digest and base)':confirmation==='accept'?'approval of exactly this stored change':'rejection of this version'}? No other edits are authorized.`,'confirm');box.append(text('p',record.proposalDigest,'metadata'),action(retry?'Retry exact original approval':confirmation==='accept'?'Approve exact change':'Reject this version',()=>submit(retry?'accept':kind,retry?prior:undefined),confirmation==='reject'?'danger':'primary'),action('Cancel',()=>{confirmation=null;render();}));detail.append(box);}
}
async function inspect(id){if(busy)return;selected=id;record=null;confirmation=null;const token=++sequence;render();notify('Loading stored evidence…');try{const value=await request(`/api/proposals/${id}`);if(token!==sequence)return;record=checkedRecord(value);notify('Review the stored change and its exact base. Checks are not quality verification.');render();}catch(error){if(token===sequence)notify(error.message);}}
async function refresh(){if(busy)return;const token=++sequence;confirmation=null;render();notify('Refreshing…');try{const incoming=await request('/api/proposals');if(token!==sequence)return;reviewQueue(incoming);items=incoming;renderList();notify(items.length?'Choose a stored proposal to inspect.':'No stored proposals.');if(selected)await inspect(selected);else render();}catch(error){if(token===sequence)notify(error.message);}}
async function submit(kind,original){
 if(busy||!record||!selected)return;const id=selected,digest=record.proposalDigest,decision=original??{kind,requestId:crypto.randomUUID(),proposalDigest:digest};if(decision.proposalDigest!==digest)return;busy=true;confirmation=null;sequence++;render();
 try{if(!navigator.locks)throw Error('Safe cross-tab decision locking is unavailable.');await navigator.locks.request(decisionKey(id),async()=>{const existing=savedDecision(id);if(kind==='accept'&&original&&(!existing||existing.kind!==original.kind||existing.requestId!==original.requestId||existing.proposalDigest!==original.proposalDigest))throw Error('Saved original approval changed. Refresh and inspect; no retry was sent.');if(!original&&existing)throw Error('Another tab already saved a decision. Refresh and inspect its original outcome.');localStorage.setItem(decisionKey(id),JSON.stringify(decision));notify(kind==='reconcile'?'Checking the original attempt without starting a new approval…':'Submitting the exact stored decision…');record=checkedRecord(await request(`/api/proposals/${id}/${kind}`,{requestId:decision.requestId,proposalDigest:decision.proposalDigest}));items=items.map(item=>item.id===id?{...item,status:record.status}:item);notify(`Stored result: ${record.status}.`);});}
 catch(error){notify(`Outcome unconfirmed. ${error.message}\nRefresh to inspect and reconcile the original decision. Never manually replay the replacement.`);}finally{busy=false;renderList();render();}
}
let ownsEditor=false;
async function mountEditor(){
 if(ownsEditor)return;
 if(!navigator.locks){$('editor-status').textContent='Live editor requires origin-scoped browser locks.';return;}
 try{await navigator.locks.request('doc-sync-review-live-editor',{ifAvailable:true},async lock=>{
  if(!lock){$('editor-status').textContent='The live editor is open in another review tab. Review controls remain available here; close that tab before opening another live editor.';$('open-editor').hidden=false;return;}
  ownsEditor=true;$('open-editor').hidden=true;$('editor-status').textContent='One live editor per owner workspace; review-only tabs do not open extra streams.';$('editor').src=auth.editorUrl;
  await new Promise(resolve=>window.addEventListener('pagehide',()=>{$('editor').removeAttribute('src');ownsEditor=false;resolve();},{once:true}));
 });}catch{$('editor-status').textContent='Live editor lock unavailable. Try again after closing another live editor.';$('open-editor').hidden=false;}
}
window.addEventListener('pageshow',event=>{if(event.persisted&&auth?.editorUrl)void mountEditor();});
$('open-editor').addEventListener('click',()=>void mountEditor());
$('filter').addEventListener('change',changeFilter);$('refresh').addEventListener('click',refresh);window.addEventListener('storage',e=>{if(e.key===null||e.key?.startsWith('doc-sync-review-decision-v1:')){confirmation=null;renderList();render();}});
try{
 const secret=location.hash.slice(1);history.replaceState(null,'',location.pathname);
 if(secret){const response=await fetch('/session',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({secret}),redirect:'error',cache:'no-store'});if(!response.ok)throw Error('Review access was not authorized. Open a fresh owner access link.');auth=await response.json();sessionStorage.setItem(sessionKey,JSON.stringify({session:auth.session}));}
 else{const saved=JSON.parse(sessionStorage.getItem(sessionKey)??'null');if(!saved?.session)throw Error('Open the private owner access link to review proposals.');auth={session:saved.session};auth={...auth,...await request('/session')};}
 $('connection').textContent='Owner review · local';$('document-label').textContent=`Document: ${auth.document}`;if(!auth.editorUrl)throw Error('No bound editor configured.');void mountEditor();await refresh();
}catch(error){$('connection').textContent='Access unavailable';notify(error.message);$('refresh').disabled=true;}
