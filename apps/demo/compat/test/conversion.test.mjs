import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Doc,applyEdits} from '@barocss/doc-sync';
import {canon,schema,toSlate,fromSlate,fromLexical,editsFor,commitModelEdits,safeSlateRange} from '../model.mjs';
const paragraph=text=>({type:'paragraph',runs:text?[{text,marks:{}}]:[]});
test('Slate round trip preserves Korean, emoji, marks and 2x3 table',()=>{
  const model=canon({type:'content',children:[{type:'paragraph',runs:[{text:'한😀글',marks:{bold:true,italic:true}}]}, {type:'table',children:Array.from({length:2},()=>({type:'table-row',children:Array.from({length:3},()=>({type:'table-cell',children:[{type:'table-cell-body',children:[paragraph('칸')]}]}))}))}]});
  assert.deepEqual(fromSlate(toSlate(model)),model);
});
test('Lexical conversion preserves marks and rejects unsupported inline nodes',()=>{
  assert.deepEqual(fromLexical({root:{children:[{type:'paragraph',children:[{type:'text',text:'한😀글',format:15}]}]}}),canon({type:'content',children:[{type:'paragraph',runs:[{text:'한😀글',marks:{bold:true,italic:true,strike:true,underline:true}}]}]}));
  assert.throws(()=>fromLexical({root:{children:[{type:'paragraph',children:[{type:'link'}]}]}}),/시험 범위 밖/);
  assert.throws(()=>toSlate({children:[{type:'unsupported'}]}),/시험 범위 밖/);
});
test('Enter and join retain semantic intent, including Unicode offsets',()=>{
  const before=canon({type:'content',children:[paragraph('한😀글')]}),after=canon({type:'content',children:[paragraph('한😀'),paragraph('글')]});
  assert.deepEqual(editsFor(before,after),[{op:'split',at:[0,2]}]);
  assert.deepEqual(applyEdits(schema,before,editsFor(before,after)),after);
  assert.deepEqual(editsFor(after,before),[{op:'merge',at:[1]}]);
});
test('simultaneous Enter remains one boundary in two adapter clients',()=>{
  const seed=new Doc('seed',schema);const seedOps=seed.edit([{op:'insert',at:[0,0],content:'abcdefgh'}]).ops;
  const a=new Doc('a',schema),b=new Doc('b',schema);a.apply(seedOps);b.apply(seedOps);
  const next=canon({type:'content',children:[paragraph('abcd'),paragraph('efgh')]});
  const aOps=a.edit(editsFor(a.toJSON(),next)).ops,bOps=b.edit(editsFor(b.toJSON(),next)).ops;
  a.apply(bOps);b.apply(aOps);
  assert.deepEqual(a.toJSON(),b.toJSON());assert.equal(a.toJSON().children.length,2);
});
test('adapter maps Unicode model offsets to UTF-16 CRDT tokens for split, insertion and delete',()=>{
  const doc=new Doc('unicode',schema);
  doc.edit([{op:'insert',at:[0,0],content:'한😀글'}]);
  for(const target of [
    {type:'content',children:[paragraph('한😀'),paragraph('글')]},
    {type:'content',children:[paragraph('한😀X'),paragraph('글')]},
    {type:'content',children:[paragraph('한X'),paragraph('글')]},
  ]){
    const after=canon(target),before=doc.toJSON();
    commitModelEdits(doc,before,editsFor(before,after));
    assert.deepEqual(doc.toJSON(),after);
  }
});
test('Slate reset drops a removed selection path and clamps a surviving offset',()=>{
  const children=toSlate(canon({type:'content',children:[paragraph('x')]}));
  const point=(path,offset)=>({anchor:{path,offset},focus:{path,offset}});
  assert.equal(safeSlateRange(children,point([1,0],6)),null);
  assert.deepEqual(safeSlateRange(children,point([0,0],6)),point([0,0],1));
});
