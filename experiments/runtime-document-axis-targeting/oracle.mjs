import assert from 'node:assert/strict';
import {applyEdits} from '../../packages/doc-sync/dist/crdt/model.js';
import {Doc,isAlive} from '../../packages/doc-sync/dist/crdt/doc.js';
import {strictNode} from '../runtime-document-targeting/oracle.mjs';
import {insertionOracle} from '../runtime-document-group-grid/contract-oracle.mjs';
const at=(m,p)=>p.reduce((n,i)=>n?.children?.[i],m);
function axis(doc,grid,key,kind){
 const split=key.indexOf('@');assert(Number(key.slice(0,split))>0&&!/^~(?:required|text|fragment):/.test(key.slice(split+1)),'axis must be ordinary immutable key');
 const item=doc.get(key);assert(item&&isAlive(item)&&item.kind==='node','axis must be an alive node');
 const values=kind==='rows'?grid.block.rows:grid.block.cols,index=values.findIndex(value=>value.key===key);assert(index>=0,'axis belongs to this current grid');
 assert.equal(item.line.owner?.key,grid.key,'exact grid ownership');assert.equal(item.line.slot,kind,'axis kind');return index;
}
export function gridPath(doc,target,keyOf){
 const grid=strictNode(doc,keyOf(target.grid));assert.equal(grid.block.kind,'grid','target is exact visible grid primary');
 const row=axis(doc,grid,keyOf(target.row),'rows');
 if(['beforeRow','afterRow'].includes(target.kind))return{path:[...grid.path,row+(target.kind==='afterRow'?1:0)],exact:{kind:target.kind,grid:grid.key,row:keyOf(target.row),gridPath:grid.path,rowIndex:row}};
 assert(['insideCellStart','insideCellEnd'].includes(target.kind),'typed cell edge required');const column=axis(doc,grid,keyOf(target.column),'cols');
 assert(!grid.block.covered.has(`${row},${column}`),'covered cell never redirects');
 const bodyPath=[...grid.path,row,column,0],body=at(doc.toJSON(),bodyPath);assert(body,'current cell body exists');
 return{path:[...bodyPath,target.kind==='insideCellStart'?0:body.children.length],exact:{kind:target.kind,grid:grid.key,row:keyOf(target.row),column:keyOf(target.column),gridPath:grid.path,rowIndex:row,columnIndex:column,bodyLine:doc.cellKey(grid.block.marker,grid.block.rows[row],grid.block.cols[column])}};
}
export function planGrid(doc,commands,keyOf){
 const snapshot=doc.snapshot(),before=doc.toJSON(),edits=[],resolved=[],rules=[];let expected=structuredClone(before);
 for(const command of commands){
  const prefix=Doc.fromSnapshot(doc.actor,snapshot,doc.schema);if(edits.length)prefix.edit(edits,{normalize:true});
  const current=gridPath(prefix,command.target,keyOf),edit={op:'insert',at:current.path,content:[command.model]};
  const oracle=insertionOracle(doc.schema,expected,edit),priority=rowPayloadSpanPriority(doc.schema,expected,{at:current.path,model:command.model},oracle.expected);expected=priority.expected;edits.push(edit);resolved.push(current.exact);rules.push(...oracle.constraintRules,...priority.rules);
 }
 return{before,edits,resolved,expected,independentEdits:edits,method:'independent exact current grid + live axis ownership + complete prefix arrays + documented fixed row width/anchored span oracle',constraintRules:rules};
}

/** Existing span projection rule: fresh payload span writers precede older
 * anchors, in reverse row-major emission order. Reject an entire older span
 * rectangle if any cell intersects an already accepted newer rectangle.
 * `spanned` is output-only and creates no writer. This derives model-only
 * projection edits; it does not alter requested commands or wire operations. */
function rowPayloadSpanPriority(schema,before,command,expected){
 const rowType=schema.nodes[command.model.type]?.shape;if(rowType!=='row')return{expected,rules:[]};
 const gridPath=command.at.slice(0,-1),index=command.at.at(-1),grid=at(expected,gridPath),prior=at(before,gridPath);if(!grid||!prior)return{expected,rules:[]};
 const width=grid.children[0].children.length,rows=grid.children.length,incoming=[];
 (command.model.children??[]).slice(0,width).forEach((cell,column)=>{const rs=Math.max(1,Number(cell.attrs?.rowspan??1)||1),cs=Math.max(1,Number(cell.attrs?.colspan??1)||1);if(rs>1||cs>1)incoming.push({r:index,c:column,rs:Math.min(rs,rows-index),cs:Math.min(cs,width-column),fresh:true});});
 if(!incoming.length)return{expected,rules:[]};
 const older=[];prior.children.forEach((row,r)=>row.children.forEach((cell,c)=>{const rs=cell.attrs?.rowspan??1,cs=cell.attrs?.colspan??1;if(rs>1||cs>1)older.push({r:r>=index?r+1:r,c,rs:rs+(r<index&&index<=r+rs-1?1:0),cs,fresh:false});}));
 // The bounded overlap fixture has one older active merge. No hidden older
 // candidates are guessed from a model; a larger latent-span corpus requires
 // its own independently retained writer catalog.
 if(older.length>1)throw new Error('row overlap oracle requires at most one prior visible span in this bounded corpus');
 const occupied=new Set(),accepted=[],rejected=[];const area=span=>Array.from({length:span.rs},(_,r)=>Array.from({length:span.cs},(_,c)=>`${span.r+r},${span.c+c}`)).flat();
 for(const span of [...incoming].reverse().concat(older)){
  const cells=area(span);if(span.rs===1&&span.cs===1||cells.some(cell=>occupied.has(cell)))rejected.push(span);else{accepted.push(span);cells.forEach(cell=>occupied.add(cell));}
 }
 const copy=structuredClone(expected);
 for(const span of [...incoming,...older]){const cell=copy.children?at(copy,[...gridPath,span.r,span.c]):null;if(cell){cell.attrs??={};delete cell.attrs.rowspan;delete cell.attrs.colspan;delete cell.attrs.spanned;}}
 for(const span of accepted){const cell=at(copy,[...gridPath,span.r,span.c]);cell.attrs={...cell.attrs,rowspan:span.rs,colspan:span.cs};}
 // Recompute all covered output from the independently chosen non-overlapping
 // rectangles; existing content and noncomputed attrs remain byte-for-byte.
 return{expected:applyEdits(schema,copy,[]),rules:[{rule:'newest span writer first; intersecting older rectangle discarded whole',incoming,older,accepted,rejected,spannedInputIgnored:true}]};
}
