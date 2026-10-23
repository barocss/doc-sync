import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {Doc} from '/Users/user/github/doc-sync/packages/doc-sync/src/crdt/doc.ts';
import * as cmd from '/Users/user/github/doc-sync/packages/doc-sync/src/crdt/commands.ts';
import {DEMO_SCHEMA} from '/Users/user/github/doc-sync/fixtures/demo-schema.ts';
const seed=new Doc('seed',DEMO_SCHEMA);cmd.insertText(seed,{b:0,o:0},'abc');
const snapshot=seed.snapshot();const rows=[];
for(const from of [2,1]){
 const a=Doc.fromSnapshot('A',snapshot,DEMO_SCHEMA),b=Doc.fromSnapshot('B',snapshot,DEMO_SCHEMA);
 const deletion=cmd.backspace(a,{b:0,o:3}).ops;
 const bold=cmd.setMark(b,{b:0,o:from},{b:0,o:3},'bold',true);
 const results=[];
 for(const order of [[deletion,bold],[bold,deletion]]){
  const doc=Doc.fromSnapshot('observer',snapshot,DEMO_SCHEMA);
  for(const ops of order)for(const op of ops)doc.apply(op);
  const model=doc.toJSON();results.push(model);
  for(const ops of order)for(const op of ops)doc.apply(op);
  assert.deepEqual(doc.toJSON(),model,'duplicate delivery is idempotent');
 }
 assert.deepEqual(results[0],results[1]);assert.equal(results[0].children[0].runs.map(r=>r.text).join(''),'ab');
 const expected=from===2?[{text:'ab',marks:{}}]:[{text:'a',marks:{}},{text:'b',marks:{bold:true}}];
 assert.deepEqual(results[0].children[0].runs,expected);
 rows.push({case:from===2?'delete c versus bold c':'delete c versus bold bc',ordersEqual:true,duplicateDeliveryEqual:true,runs:expected});
}
const result={passed:true,scope:'Core Doc operation-order probe; no browser or native IME claim',cases:rows};
writeFileSync('/Users/user/github/doc-sync/output/validation/screen-next-20261023/delete-bold-probe.json',JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result));
