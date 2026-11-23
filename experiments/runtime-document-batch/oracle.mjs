import {applyEdits} from '../../packages/doc-sync/dist/crdt/model.js';
import {insertionOracle} from '../runtime-document-group-grid/contract-oracle.mjs';
const at=(m,p)=>p.reduce((n,i)=>n?.children?.[i],m);
/** Complete expected model uses only pre-command models and documented rules.
 * Column memo is one slot: same grid/index and an unseen row fill that global
 * column. A repeated row allocates a new column and replaces the memo. Row-only
 * insertion keeps width; anchored spans grow through insertionOracle. */
export function batchOracle(schema,before,commands,boundary){
 let expected=structuredClone(before),memo=null;const rules=[],independentEdits=[];
 for(const [index,c] of commands.entries()){
  const shape=schema.nodes[c.model.type]?.shape;
  if(shape==='grid'&&!(c.model.children?.length)&&boundary==='unprojected-empty-grid-at-zero'){
   expected=applyEdits(schema,expected,[{op:'insert',at:[1],content:[{type:schema.nodes[schema.root].default,runs:[]}]}]);
   rules.push({index,rule:'unprojected fallback at zero promotes trailing default text marker despite normalized-empty grid'});continue;
  }
  if((shape==='group'||shape==='grid')&&!(c.model.children?.length)){rules.push({index,rule:'normalized empty group/grid: no model member'});continue;}
  const request={op:'insert',at:c.at,content:[c.model]};
  if(shape==='cell'){
   const gridPath=c.at.slice(0,-2),row=c.at.at(-2),column=c.at.at(-1),grid=at(expected,gridPath),key=JSON.stringify(gridPath);
   if(memo?.grid===key&&memo.column===column&&!memo.rows.has(row)){
    memo.rows.add(row);
    const edits=[];
    if(c.model.attrs&&Object.keys(c.model.attrs).length)edits.push({op:'update',at:c.at,attrs:c.model.attrs});
    const children=c.model.children?.[0]?.children??[];
    if(children.length){
     const body=at(expected,[...c.at,0]);
     if(body?.children?.length===1&&schema.nodes[body.children[0].type]?.shape==='text'&&!(body.children[0].runs?.length))body.children=[];
    }
    if(children.length)edits.push({op:'insert',at:[...c.at,0,0],content:children});
    expected=applyEdits(schema,expected,edits);independentEdits.push(...edits);
    rules.push({index,rule:'fill existing shared global column',gridPath,row,column});continue;
   }
   memo={grid:key,column,rows:new Set([row])};
  }
  const one=insertionOracle(schema,expected,request);expected=one.expected;independentEdits.push(...one.independentEdits);rules.push({index,rule:'independent insertion model',constraints:one.constraintRules});
 }
 return{method:'pre-model independent insertion rules + explicit shared-column memo',expected,independentEdits,constraintRules:rules};
}
