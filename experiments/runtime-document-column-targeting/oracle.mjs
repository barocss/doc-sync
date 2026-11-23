import assert from 'node:assert/strict';
import {canonical} from '../../packages/doc-sync/dist/crdt/model.js';
import {isAlive} from '../../packages/doc-sync/dist/crdt/doc.js';
import {strictNode} from '../runtime-document-targeting/oracle.mjs';
const at=(m,p)=>p.reduce((n,i)=>n?.children?.[i],m),key=t=>`${t.lamport}@${t.actor}`;
const compare=(a,b)=>a.lamport-b.lamport||(a.actor<b.actor?-1:a.actor>b.actor?1:0);
export class SpanCatalog{
 constructor(entries=[]){this.entries=new Map(entries);}
 clone(){return new SpanCatalog(structuredClone([...this.entries]));}
 apply(wrapped){const op=wrapped.format==='doc-sync-runtime-reference-op-v1'?wrapped.op:wrapped;if(op.t!=='set'||!op.key.startsWith('$span:'))return;for(const grid of op.ids){const name=key(grid)+'|'+op.key,old=this.entries.get(name);if(!old||compare(op.at,old.at)>0)this.entries.set(name,{grid:key(grid),anchor:op.key.slice(6).split(/,(.+)/),value:structuredClone(op.value),at:op.at});}}
 forGrid(grid){return[...this.entries.values()].filter(x=>x.grid===grid).map(x=>structuredClone(x));}
}
function axis(doc,grid,id,slot){const item=doc.get(id);assert(item&&item.id.lamport>0&&!item.id.actor.startsWith('~required:')&&isAlive(item)&&item.kind==='node','ordinary live axis');assert.equal(item.line.owner?.key,grid.key,'owned axis');assert.equal(item.line.slot,slot,'axis kind');const values=slot==='rows'?grid.block.rows:grid.block.cols,index=values.findIndex(x=>x.key===id);assert(index>=0,'current axis membership');return index;}
const physical=(doc,grid,slot)=>doc.get('0@'+grid+'/'+slot).line.items.filter(x=>x.id.lamport>0).map(x=>x.key);
export function planColumn(doc,command,keyOf,catalog){
 const found=strictNode(doc,keyOf(command.grid));assert.equal(found.block.kind,'grid','current stored grid');const grid=found.key,b=command.boundary;let c;
 if(b.kind==='start')c=0;else if(b.kind==='end')c=found.block.cols.length;else{assert(['before','after'].includes(b.kind),'boundary kind');c=axis(doc,found,keyOf(b.column),'cols')+(b.kind==='after'?1:0);}
 const rows=found.block.rows.map(x=>x.key),cols=found.block.cols.map(x=>x.key),seen=new Set(),payloads=[];assert(Array.isArray(command.cells));
 for(const payload of command.cells){const row=keyOf(payload.row);assert(!seen.has(row),'duplicate row rejected before compile');seen.add(row);payloads.push({row,r:axis(doc,found,row,'rows'),model:structuredClone(payload.model)});}
 const rowType=doc.schema.nodes[found.block.type].children[0],cellType=doc.schema.nodes[rowType].children[0],bodyType=doc.schema.nodes[cellType].children[0];for(const x of payloads)assert.equal(x.model.type,cellType,'cell payload type');
 const before=doc.toJSON(),copy=structuredClone(before),target=at(copy,found.path),symbol='~new-column',liveCols=[...cols];liveCols.splice(c,0,symbol);const rowOrder=physical(doc,grid,'rows'),colOrder=physical(doc,grid,'cols');colOrder.splice(c?colOrder.indexOf(cols[c-1])+1:0,0,symbol);
 const empty=()=>({type:cellType,children:[{type:bodyType,children:[]}]});for(let r=0;r<rows.length;r++)target.children[r].children.splice(c,0,empty());
 for(const x of payloads)target.children[x.r].children[c]=structuredClone(x.model);
 const incoming=[];payloads.forEach((x,index)=>{const attrs=x.model.attrs??{},rs=Math.max(1,Number(attrs.rowspan??1)||1),cs=Math.max(1,Number(attrs.colspan??1)||1);if(rs>1||cs>1)incoming.push({grid,anchor:[x.row,symbol],value:{row:rows[Math.min(rows.length,x.r+rs)-1],col:liveCols[Math.min(liveCols.length,c+cs)-1]},fresh:index});});
 const old=catalog.forGrid(grid),records=[...incoming].reverse().concat(old.filter(x=>x.value).sort((a,b)=>compare(b.at,a.at))),occupied=new Set(),accepted=[],rejected=[];
 const extent=(live,order,start,end)=>{const last=order.indexOf(end);if(last<0)return 1;let count=0;for(let i=start;i<live.length&&order.indexOf(live[i])<=last;i++)count++;return Math.max(1,count);};
 for(const row of target.children)for(const cell of row.children){cell.attrs??={};for(const name of['rowspan','colspan','spanned'])delete cell.attrs[name];}
 for(const record of records){const r=rows.indexOf(record.anchor[0]),col=liveCols.indexOf(record.anchor[1]);if(r<0||col<0)continue;const rs=extent(rows,rowOrder,r,record.value.row),cs=extent(liveCols,colOrder,col,record.value.col),area=[];for(let i=r;i<r+rs;i++)for(let j=col;j<col+cs;j++)area.push(`${i},${j}`);if(rs===1&&cs===1||area.some(x=>occupied.has(x))){rejected.push(record);continue;}area.forEach(x=>occupied.add(x));target.children[r].children[col].attrs={...target.children[r].children[col].attrs,rowspan:rs,colspan:cs};accepted.push(record);}
 const edits=(payloads.length?payloads:[{row:rows[0],r:0,model:{type:cellType,children:[]}}]).map(x=>({op:'insert',at:[...found.path,x.r,c],content:[x.model]}));
 return{before,expected:canonical(doc.schema,copy),edits,independentEdits:edits,method:'independent single rectangular column + caller payloads + retained stable-endpoint writer catalog',constraintRules:[{rule:'one fixed numeric column, caller row order, unique rows',c,rows:payloads.map(x=>x.row),emptySeed:!payloads.length},{rule:'newer span rectangles first; intersecting older whole rectangle suppressed',catalogBefore:old,incoming,accepted,rejected}],grid,path:found.path,c,rows,cols,symbol,incoming,colOrder};
}
export function verifyColumnSpans(plan,ops,newColumn){
 const replace=x=>x===plan.symbol?newColumn:x;
 const actual=ops.filter(op=>op.t==='set'&&op.key.startsWith('$span:')&&op.ids.some(id=>key(id)===plan.grid));assert.equal(actual.length,plan.incoming.length,'one semantic span writer per requested spanning cell');
 plan.incoming.forEach((span,index)=>{const op=actual[index];assert.equal(op.key,'$span:'+span.anchor.map(replace).join(','));assert.deepEqual(op.value,{row:replace(span.value.row),col:replace(span.value.col)});if(index)assert(compare(op.at,actual[index-1].at)>0,'caller payload order controls span priority');for(const old of plan.constraintRules[1].catalogBefore)assert(compare(op.at,old.at)>0,'new spans outrank every prior catalog writer');});
}
