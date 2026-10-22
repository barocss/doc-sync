import {applyEdit, applyEdits, canonical, diffModels} from '@barocss/doc-sync';
import {DEMO_SCHEMA} from '../../../fixtures/demo-schema.ts';
export const schema = DEMO_SCHEMA;
export const canon = model => canonical(schema, model);
const textTypes = new Set(['paragraph', 'heading1', 'heading2', 'quote']);
const structuralTypes = new Set(['table', 'table-row', 'table-cell', 'table-cell-body']);
export function toSlate(model) {
  const node = item => {
    if (textTypes.has(item.type)) return {type:item.type, children:item.runs?.length ? item.runs.map(run => {
      if (!('text' in run)) throw new Error(`시험 범위 밖 inline: ${run.type}`);
      return {text:run.text,...run.marks};
    }) : [{text:''}]};
    if (!structuralTypes.has(item.type)) throw new Error(`시험 범위 밖 node: ${item.type}`);
    return {type:item.type, ...(item.attrs ? {attrs:item.attrs}:{}), children:(item.children ?? []).map(node)};
  };
  return model.children.map(node);
}
export function fromSlate(children) {
  const node = item => textTypes.has(item.type)
    ? {type:item.type,runs:item.children.map(({text,...marks})=>({text,marks}))}
    : {type:item.type,...(item.attrs ? {attrs:item.attrs}:{}),children:item.children.map(node)};
  return canon({type:'content',children:children.map(node)});
}
export function safeSlateRange(children,range) {
  if(!range)return null;
  const point=p=>{
    let node={children};
    for(const index of p.path)node=node?.children?.[index];
    return typeof node?.text==='string'?{path:p.path,offset:Math.min(p.offset,node.text.length)}:null;
  };
  const anchor=point(range.anchor),focus=point(range.focus);
  return anchor&&focus?{anchor,focus}:null;
}
const flags={bold:1,italic:2,strike:4,underline:8};
export function fromLexical(json) {
  const node = item => {
    if (['paragraph','heading','quote'].includes(item.type)) return {
      type:item.type==='heading' ? item.tag==='h1'?'heading1':'heading2':item.type,
      runs:item.children.map(text=>{
        if(text.type!=='text') throw new Error(`시험 범위 밖 Lexical inline: ${text.type}`);
        return {text:text.text,marks:Object.fromEntries(Object.entries(flags).filter(([,bit])=>text.format&bit).map(([key])=>[key,true]))};
      }),
    };
    if(item.type==='table') return {type:'table',attrs:{header:false},children:item.children.map(node)};
    if(item.type==='tablerow') return {type:'table-row',children:item.children.map(node)};
    if(item.type==='tablecell') return {type:'table-cell',children:[{type:'table-cell-body',children:item.children.map(node)}]};
    throw new Error(`시험 범위 밖 Lexical node: ${item.type}`);
  };
  return canon({type:'content',children:json.root.children.map(node)});
}
/** Preserve Enter/join intent. A tree diff alone removes and reinserts the split tail. */
export function editsFor(before, after) {
  const a=before.children,b=after.children;
  const same=(x,y)=>JSON.stringify(x)===JSON.stringify(y);
  const text=n=>n?.type==='paragraph' && (n.runs??[]).every(r=>'text'in r) ? n.runs.map(r=>r.text).join(''):null;
  if(b.length===a.length+1) for(let i=0;i<a.length;i++) {
    if(text(a[i])!==null && text(b[i])!==null && text(b[i+1])!==null && text(a[i])===text(b[i])+text(b[i+1]) && same(a.slice(0,i),b.slice(0,i)) && same(a.slice(i+1),b.slice(i+2)))
      {
        const edits=[{op:'split',at:[i,[...text(b[i])].length]}];
        if(same(applyEdits(schema,before,edits),after))return edits;
      }
  }
  if(a.length===b.length+1) for(let i=0;i<b.length;i++) {
    if(text(b[i])!==null && text(a[i])!==null && text(a[i+1])!==null && text(b[i])===text(a[i])+text(a[i+1]) && same(a.slice(0,i),b.slice(0,i)) && same(a.slice(i+2),b.slice(i+1)))
      {
        const edits=[{op:'merge',at:[i+1]}];
        if(same(applyEdits(schema,before,edits),after))return edits;
      }
  }
  return diffModels(schema,before,after);
}

/** Model diffs count Unicode code points; CRDT token offsets count UTF-16 units. */
export function commitModelEdits(doc,before,edits) {
  const work=structuredClone(before),mappedEdits=[];
  for(const edit of edits){
    let block=work;
    for(const index of edit.at.slice(0,-1))block=block?.children?.[index];
    let mapped=edit;
    if(block?.runs && edit.op!=='merge'){
      if(!block.runs.every(r=>'text'in r))throw new Error('시험 범위 밖 inline offset');
      const units=[...block.runs.map(r=>r.text).join('')];
      const start=edit.at.at(-1),offset=units.slice(0,start).join('').length;
      mapped={...edit,at:[...edit.at.slice(0,-1),offset]};
      if(edit.op==='delete')mapped.count=units.slice(start,start+edit.count).join('').length;
      if(edit.op==='update'&&edit.length!==undefined)mapped.length=units.slice(start,start+edit.length).join('').length;
    }
    mappedEdits.push(mapped);
    applyEdit(schema,work,edit);
  }
  return doc.edit(mappedEdits).ops;
}
