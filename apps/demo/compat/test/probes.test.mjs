import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Doc} from '@barocss/doc-sync';
import {schema,commitModelEdits} from '../model.mjs';
import * as disabled from '../operation-probe.mjs';

test('operation trace is off by default and does not clone values',()=>{
  assert.equal(disabled.tracingEnabled,false);
  disabled.recordOperation({uncloneable:()=>{}});
  assert.deepEqual(disabled.readOperations(),[]);
});

test('opt-in operation trace keeps 150 independent records and can clear them',async()=>{
  const previous=globalThis.location;
  let recorder;
  try{
    globalThis.location={search:'?trace=1'};
    recorder=await import('../operation-probe.mjs?test=enabled');
  }finally{
    if(previous===undefined)delete globalThis.location;
    else globalThis.location=previous;
  }
  assert.equal(recorder.tracingEnabled,true);
  const record={model:{text:'before'}};
  recorder.recordOperation(record);
  record.model.text='after';
  const first=recorder.readOperations();
  assert.equal(first[0].model.text,'before');
  first[0].model.text='changed read';
  assert.equal(recorder.readOperations()[0].model.text,'before');
  recorder.clearOperations();
  for(let i=0;i<151;i++)recorder.recordOperation({i});
  assert.equal(recorder.readOperations().length,150);
  assert.equal(recorder.readOperations()[0].i,1);
  recorder.clearOperations();
  assert.deepEqual(recorder.readOperations(),[]);
});

test('translated edit observation cannot change Unicode edits sent to the CRDT',()=>{
  const doc=new Doc('probe',schema);
  doc.edit([{op:'insert',at:[0,0],content:'한😀글'}]);
  const before=doc.toJSON();
  const edits=[{op:'insert',at:[0,2],content:'X'}];
  let observed;
  const ops=commitModelEdits(doc,before,edits,mapped=>{
    observed=structuredClone(mapped);
    mapped[0].at[1]=0;
    mapped[0].content='wrong';
  });
  assert.deepEqual(observed,[{op:'insert',at:[0,3],content:'X'}]);
  assert.equal(doc.toJSON().children[0].runs[0].text,'한😀X글');
  assert.deepEqual(edits,[{op:'insert',at:[0,2],content:'X'}]);
  assert.ok(ops.length);
});
