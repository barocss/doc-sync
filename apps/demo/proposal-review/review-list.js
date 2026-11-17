const pending=new Set(['pending']),unresolved=new Set(['applying','unconfirmed','needs_attention']),closed=new Set(['applied','rejected','stale','not_applied']);
/** Stored-state triage only. Local evidence is not a claim that a request reached the server. */
export function reviewQueue(items,filter='all',hasLocalDecision=()=>false){
 if(!['all','pending','unresolved','closed'].includes(filter)||!Array.isArray(items)||items.length>256||typeof hasLocalDecision!=='function')throw Error('Invalid proposal list');
 const seen=new Set(),counts={all:items.length,pending:0,unresolved:0,closed:0};
 const rows=items.map(item=>{
  if(!item||typeof item!=='object'||!/^[a-f0-9]{64}$/.test(item.id)||seen.has(item.id)||![...pending,...unresolved,...closed].includes(item.status))throw Error('Invalid proposal list');
  seen.add(item.id);
  const local=!!hasLocalDecision(item.id),group=closed.has(item.status)?'closed':unresolved.has(item.status)||local?'unresolved':'pending';
  counts[group]++;return {id:item.id,status:item.status,group,localDecisionPending:item.status==='pending'&&local};
 });
 return {counts,rows:rows.filter(row=>filter==='all'||row.group===filter)};
}
