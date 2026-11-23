import assert from 'node:assert/strict';
import {Doc,isAlive} from '../../packages/doc-sync/dist/crdt/doc.js';
import {blockPath} from '../../packages/doc-sync/dist/crdt/edit.js';
import {insertionOracle} from '../runtime-document-group-grid/contract-oracle.mjs';
const units=s=>Array.from({length:s.length},(_,i)=>s.charCodeAt(i));
const model=n=>({type:n.type,attrs:n.attrs??{},children:(n.children??[]).map(model),runs:(n.runs??[]).map(r=>('text'in r||'units'in r)?{units:r.units??units(r.text),marks:r.marks??{}}:model(r))});
const at=(m,p)=>p.reduce((n,i)=>n?.children?.[i],m);
/** Strict root-reachable primary-marker walk. Selection and pathAt are not used.
 * blockPath is read only after exact marker matching. Full canonical block
 * equality proves that the returned slot contains this projected marker's model,
 * including text/attrs, rather than merely another node of the same type. */
export function strictNode(doc,key){
 const split=key.indexOf('@'),clock=Number(key.slice(0,split)),actor=key.slice(split+1);assert(Number.isSafeInteger(clock)&&clock>0&&!/^~(?:required|text|fragment):/.test(actor),'synthetic target rejected before implicit slot lookup');
 const item=doc.get(key);assert(item,'missing immutable target');
 assert(item.id.lamport>0&&!/^~(?:required|text|fragment):/.test(item.id.actor),'synthetic target');
 assert(item.kind==='node'&&isAlive(item),'target is not an alive stored node');
 const shape=doc.schema.nodes[doc.typeOf(item)]?.shape;assert(!['row','cell','inline','span'].includes(shape)&&doc.typeOf(item)!=='col','target is not a primary block');
 const canonical=doc.toJSON(),found=[];
 const walk=line=>{
  if(!doc.visible(line))return;
  const blocks=doc.blocks(line);
  for(let index=0;index<blocks.length;index++){
   const block=blocks[index],path=blockPath(doc,line,index);if(!path)continue;
   const projected=at(canonical,path);if(!projected)continue;
   // Canonical cardinality rules can hide a raw projection entry.
   const member=doc.projectVisibleBlock(block),group=block.kind==='text'?doc.groupOf(line,block.type):null;
   if(group){const wrapper=at(canonical,path.slice(0,-1));if(wrapper?.type!==group.type)continue;for(const key of group.spec.by){if(JSON.stringify(wrapper.attrs?.[key])!==JSON.stringify(member.attrs?.[key]))throw new Error('group attribute projection mismatch');delete member.attrs?.[key];}}
   if(JSON.stringify(model(projected))!==JSON.stringify(model(member)))continue;
   if(block.marker.key===key)found.push({path,block,line,key});
   if(block.kind==='flow')walk(block.body);
   if(block.kind==='grid')for(let r=0;r<block.rows.length;r++)for(let c=0;c<block.cols.length;c++){
    if(block.covered.has(`${r},${c}`)||!isAlive(block.rows[r])||!isAlive(block.cols[c]))continue;
    walk(doc.cellKey(block.marker,block.rows[r],block.cols[c]));
   }
  }
 };
 walk('0@~root');assert.equal(found.length,1,'target must have one exact visible primary-marker position');return found[0];
}
export function relativePath(doc,target,keyOf){
 if(target.kind==='before'||target.kind==='after'){
  const found=strictNode(doc,keyOf(target.key)),path=[...found.path];if(target.kind==='after')path[path.length-1]++;
  return{path,exact:{key:found.key,currentPath:found.path,currentLine:found.line,kind:target.kind}};
 }
 assert(['insideStart','insideEnd'].includes(target.kind),'unsupported relative kind');
 const root=target.flow==='root',found=root?null:strictNode(doc,keyOf(target.flow));
 assert(root||doc.schema.nodes[found.block.type]?.shape==='flow','inside requires stored flow');
 const path=root?[]:found.path,node=at(doc.toJSON(),path);assert(node,'flow model is visible');
 return{path:[...path,target.kind==='insideStart'?0:node.children.length],exact:{key:root?'root':found.key,currentPath:path,kind:target.kind}};
}
/** Rebuild each complete prefix from the exact original snapshot and clock.
 * This retains one compiler's promotion/memo behavior within every prefix.
 * The caller executes the final resolved array once on its live TS document. */
export function planRelative(doc,commands,keyOf){
 const snapshot=doc.snapshot(),before=doc.toJSON(),edits=[],resolved=[],rules=[];let expected=structuredClone(before);
 for(const command of commands){
  const prefix=Doc.fromSnapshot(doc.actor,snapshot,doc.schema);if(edits.length)prefix.edit(edits,{normalize:true});
  const current=relativePath(prefix,command.target,keyOf),edit={op:'insert',at:current.path,content:[command.model]};
  const oracle=insertionOracle(doc.schema,expected,edit);expected=oracle.expected;edits.push(edit);resolved.push(current.exact);rules.push(...oracle.constraintRules);
 }
 return{before,edits,resolved,expected,independentEdits:edits,method:'independent strict current-primary-marker walk + complete detached prefix arrays + pre-model insertion oracle',constraintRules:rules};
}
