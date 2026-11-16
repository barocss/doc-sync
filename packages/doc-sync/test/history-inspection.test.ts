import {test} from 'node:test';
import assert from 'node:assert/strict';
import {History, inspectHistorySnapshot} from '../src/crdt/history.ts';
const ticket=(actor='A',lamport=1)=>({actor,lamport});
function fixture(version=2,kind='insert',stack='undo'){
 const step={type:'existence',ids:[ticket()],delAt:kind==='delete'?ticket('A',3):null,origin:{kind,ticket:kind==='delete'?ticket('A',3):ticket()}};
 return {version,undo:[],redo:[],sets:[],moves:[],currentSets:[],currentMoves:[],[stack]:[{steps:[step],caretBefore:'',caretAfter:'',typing:false,at:0}]} as any;
}
test('requires explicit policy and rejects unsupported versions',()=>{
 for(const policy of [undefined,{}, {legacyPolicy:'guess'}])assert.throws(()=>inspectHistorySnapshot(fixture(),policy as any),/policy/);
 for(const version of [0,3,'2'])assert.throws(()=>inspectHistorySnapshot({...fixture(),version},{legacyPolicy:'strict'}));
});
test('v1 metadata never promotes legacy steps, input unchanged',()=>{
 const input=fixture(1),before=structuredClone(input);
 for(const legacyPolicy of ['strict','compatibility'] as const){
 const result=inspectHistorySnapshot(input,{legacyPolicy});
 assert.equal(result.legacyExistenceSteps,1);assert.equal(result.originExistenceSteps,0);
 assert.equal(result.legacyActionsBlocked,legacyPolicy==='strict');assert.equal(result.scope,'format-only');
 }
 assert.deepEqual(input,before);
});
test('v2 local insert and foreign delete phases are inspected, not installed',()=>{
 for(const kind of ['insert','delete'])for(const stack of ['undo','redo']){
  const input=fixture(2,kind,stack),step=input[stack][0].steps[0];
  if(kind==='delete')step.ids=[ticket('B')];
  step.delAt=(kind==='insert'?stack==='redo':stack==='undo')?ticket('A',9):null;
  const before=structuredClone(input);
  assert.equal(inspectHistorySnapshot(input,{legacyPolicy:'strict'}).originExistenceSteps,1);
  assert.deepEqual(input,before);assert.throws(()=>History.fromSnapshot(input),/history snapshot/);
 }
});
test('v2 legacy marker remains unverified; mixed groups do not upgrade it',()=>{
 const input=fixture();input.undo[0].steps.push({...input.undo[0].steps[0],origin:{kind:'legacy-unverified'}});
 const result=inspectHistorySnapshot(input,{legacyPolicy:'strict'});
 assert.equal(result.originExistenceSteps,1);assert.equal(result.legacyExistenceSteps,1);assert.equal(result.legacyActionsBlocked,true);
});
test('malformed origin, phase, actor or insert range fails closed',()=>{
 const changes=[(s:any)=>delete s.origin,(s:any)=>s.origin.kind='future',(s:any)=>s.origin.ticket.lamport=-1,
 (s:any)=>s.origin.extra=true,(s:any)=>s.delAt=ticket(),(s:any)=>s.ids=[ticket('B')],
 (s:any)=>s.ids=[ticket(),ticket('A',3)],(s:any)=>s.origin={kind:'legacy-unverified',ticket:ticket()}];
 for(const change of changes){const input=fixture();change(input.undo[0].steps[0]);assert.throws(()=>inspectHistorySnapshot(input,{legacyPolicy:'strict'}));}
 const input=fixture(2,'delete');input.undo[0].steps[0].delAt=ticket('B');assert.throws(()=>inspectHistorySnapshot(input,{legacyPolicy:'strict'}));
});
test('common snapshot shape and JSON safety checks remain enforced',()=>{
 const input=fixture();input.sets=[{value:0,users:0}];assert.throws(()=>inspectHistorySnapshot(input,{legacyPolicy:'compatibility'}));
 const cyclic=fixture();cyclic.extra=cyclic;assert.throws(()=>inspectHistorySnapshot(cyclic,{legacyPolicy:'strict'}));
 assert.equal(inspectHistorySnapshot(new History().snapshot(),{legacyPolicy:'strict'}).legacyActionsBlocked,false);
});

test('deletion provenance respects internal causal clocks',()=>{
 for(const originTime of [0,1]){const input=fixture(2,'delete');input.undo[0].steps[0].origin.ticket=ticket('A',originTime);assert.throws(()=>inspectHistorySnapshot(input,{legacyPolicy:'strict'}));}
 const input=fixture(2,'delete');input.undo[0].steps[0].delAt=ticket('A',2);assert.throws(()=>inspectHistorySnapshot(input,{legacyPolicy:'strict'}));
 const redo=fixture(2,'insert','redo');redo.redo[0].steps[0].delAt=ticket();assert.throws(()=>inspectHistorySnapshot(redo,{legacyPolicy:'strict'}));
});
