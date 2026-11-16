import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {generate as legacy, Net, invariant} from './schedules.mjs';

export const kinds = ['concurrent', 'attr-mark', 'foreign', 'peer-move', 'peer-delete', 'late-batch'];
const clone = structuredClone;
function initial(seed) {
  return {type:`book_${seed}`, children:['x','y'].map(text=>({type:`line_${seed}`,attrs:{[`tone_${seed}`]:'kept'},runs:[{text,marks:{}}]}))};
}
function round(seed, kind, order, id) {
  const actions=[], base=initial(seed), model=clone(base);
  const add=(type,data={})=>actions.push({type,...data});
  const edit=(actor,edits)=>add('edit',{actor,edits});
  const flush=()=>add('flush',{up:order,down:[...order].reverse()});
  const check=(a,b)=>add('check',{model:clone(model),history:{A:a,B:b}});
  if(kind==='concurrent'||kind==='attr-mark') {
    if(kind==='concurrent') {
      edit('A',[{op:'insert',at:[0,0],content:'A'}]);
      edit('B',[{op:'insert',at:[1,0],content:'B'}]);
      model.children[0].runs[0].text='Ax'; model.children[1].runs[0].text='By';
    } else {
      edit('A',[{op:'update',at:[0],attrs:{[`tone_${seed}`]:'plain'}}]);
      edit('B',[{op:'update',at:[1,0],length:1,attrs:{[`mark_${seed}`]:true}}]);
      model.children[0].attrs[`tone_${seed}`]='plain'; model.children[1].runs[0].marks[`mark_${seed}`]=true;
    }
    flush(); check(true,true);
    const done=new Set();
    for(const actor of order) {
      add('undo',{actor}); flush(); done.add(actor);
      model.children[actor==='A'?0:1]=clone(base.children[actor==='A'?0:1]);
      check(!done.has('A'),!done.has('B'));
    }
  } else if(kind==='foreign') {
    edit('A',[{op:'insert',at:[0,0],content:'A'}]); flush();
    edit('B',[{op:'insert',at:[0,2],content:'B'}]); flush();
    model.children[0].runs[0].text='AxB'; check(true,true);
    const done=new Set();
    for(const actor of order) {
      add('undo',{actor}); flush(); done.add(actor);
      model.children[0].runs[0].text=(done.has('A')?'':'A')+'x'+(done.has('B')?'':'B');
      check(!done.has('A'),!done.has('B'));
    }
  } else if(kind==='peer-move'||kind==='peer-delete') {
    add('capture',{actor:'A'});
    edit('B',kind==='peer-move'?[{op:'move',from:[0],at:[1]}]:[{op:'delete',at:[0],count:1}]); flush();
    model.children=kind==='peer-move'?[clone(base.children[1]),clone(base.children[0])]:[clone(base.children[1])];
    check(false,true); add('guard',{actor:'A',edits:[{op:'insert',at:[0,0],content:'wrong'}]});check(false,true);
  } else if(kind==='late-batch') {
    add('invalid',{actor:'A',edits:[{op:'insert',at:[0,0],content:'first'},{op:'insert',at:[99,0],content:'invalid'}]});flush();check(false,false);
  } else throw Error('unsupported round');
  return {id,kind,order:[...order],initialModel:base,actions};
}
export function generateV2(seed=1) {
  const schema=legacy(seed).schema;
  return {format:2,seed,schema,rounds:kinds.flatMap((kind,n)=>[['A','B'],['B','A']].map((order,i)=>round(seed,kind,order,`r${n*2+i}`)))};
}
export function validateV2(f) {
  assert.equal(f.format,2);const generated=generateV2(f.seed);
  assert.deepEqual(f.schema,generated.schema);assert(Array.isArray(f.rounds)&&f.rounds.length<=12);
  const ids=new Set();
  for(const r of f.rounds) {
    assert(/^r[0-9]+$/.test(r.id)&&!ids.has(r.id));ids.add(r.id);
    assert.deepEqual([...r.order].sort(),['A','B']);
    // Strict grammar: no missing capture, orphan delivery, changed expected oracle,
    // or invalid command can become an apparently successful reduction.
    assert.deepEqual(r,round(f.seed,r.kind,r.order,r.id));
  }
}
function state(net,c) {
  return {model:clone(c.model()),snapshot:c.snapshot(),history:c.historyStatus(),pending:clone(c.sync.pending),events:net.events};
}
export async function replayV2(input) {
  const f=clone(input);validateV2(f);const trace=[];
  for(const r of f.rounds) {
    const net=new Net(f.schema), captures={};
    try {
      net.hub.doc.edit([{op:'insert',at:[0],content:r.initialModel.children},{op:'delete',at:[2],count:1}]);
      net.add('A');net.add('B');await net.flush();
      for(const [index,action] of r.actions.entries()) {
        trace.push({round:r.id,index,type:action.type});
        const c=net.clients[action.actor];
        switch(action.type) {
          case 'edit': c.edit(action.edits); break;
          case 'undo': c.undo(); break;
          case 'flush': await net.flush(action.up,action.down); break;
          case 'capture': captures[action.actor]=JSON.stringify(c.stamp()); break;
          case 'guard': invariant('stale-guard',()=>{
            const before=state(net,c);
            assert.notEqual(JSON.stringify(c.stamp()),captures[action.actor]);
            assert.throws(()=>{if(JSON.stringify(c.stamp())!==captures[action.actor])throw Error('stale');c.edit(action.edits);},/stale/);
            assert.deepEqual(state(net,c),before);
          }); break;
          case 'invalid': invariant('batch-atomicity',()=>{
            const before=state(net,c);assert.throws(()=>c.edit(action.edits));assert.deepEqual(state(net,c),before);
          }); break;
          case 'check':
            for(const [actor,client] of Object.entries(net.clients)) {
              invariant('event-mirror',()=>assert.equal(client.notificationErrors.length,0));
              invariant('oracle',()=>assert.deepEqual(client.model(),action.model));
              invariant('pending',()=>assert.equal(client.sync.pending.length,0));
              invariant('history',()=>assert.equal(client.historyStatus().canUndo,action.history[actor]));
            }
            invariant('convergence',()=>assert.deepEqual(net.hub.doc.toJSON(),action.model));break;
          default: throw Error('unknown action');
        }
      }
    } catch(error) {
      return {ok:false,failureClass:error.failureClass??'execution',message:error.message,trace};
    } finally {net.close();}
  }
  return {ok:true,trace};
}
export function serializeV2(f) {
  validateV2(f);return JSON.stringify({fixture:f,sha256:createHash('sha256').update(JSON.stringify(f)).digest('hex')});
}
export function deserializeV2(json) {
  const x=JSON.parse(json);validateV2(x.fixture);assert.equal(x.sha256,createHash('sha256').update(JSON.stringify(x.fixture)).digest('hex'));return x.fixture;
}
export async function reduceV2(input, run=replayV2) {
  validateV2(input);let fixture=clone(input), result=await run(clone(fixture)), attempts=0;
  if(result.ok)return {fixture,result,attempts};
  const failureClass=result.failureClass;
  for(let i=0;i<fixture.rounds.length;) {
    const next={...fixture,rounds:fixture.rounds.filter((_,n)=>n!==i)};validateV2(next);
    const candidate=await run(clone(next));attempts++;
    if(!candidate.ok&&candidate.failureClass===failureClass){fixture=next;result=candidate;}else i++;
  }
  return {fixture,result,attempts};
}
