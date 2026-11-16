import {Client, checkSchema, applyEdits} from '@barocss/doc-sync';
import {DocHub} from '@barocss/doc-sync/server';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';

// Deliberately small: each reducible round owns its complete causal lifecycle.
export function generate(seed=1) {
 if(!Number.isSafeInteger(seed)||seed<0||seed>65535)throw Error('invalid seed');
 const root=`book_${seed}`, line=`line_${seed}`, attr=`tone_${seed}`, mark=`mark_${seed}`;
 return {format:1,seed,schema:{root,marks:[mark],nodes:{[root]:{shape:'flow',children:[line],default:line},[line]:{shape:'text',attrs:{[attr]:{default:'plain',values:['plain','kept']}}}}},rounds:[0,1].map(n=>({id:`r${n}`,up:n%2?['B','A']:['A','B'],down:n%2?['A','B']:['B','A'],undo:(seed+n)%2?['B','A']:['A','B']}))};
}
export function validate(f) {
 assert.equal(f.format,1);assert(Number.isSafeInteger(f.seed)&&f.seed>=0&&f.seed<=65535);assert.deepEqual(checkSchema(f.schema),[]);
 assert.deepEqual(f.schema,generate(f.seed).schema);assert(Array.isArray(f.rounds)&&f.rounds.length<=4);
 const ids=new Set();for(const r of f.rounds){assert(/^r[0-9]+$/.test(r.id)&&!ids.has(r.id));ids.add(r.id);for(const k of ['up','down','undo'])assert.deepEqual([...r[k]].sort(),['A','B']);}
}
function invariant(kind, fn) { try { fn(); } catch(error) { error.failureClass=kind; error.message=`[${kind}] ${error.message}`; throw error; } }
const tick=()=>new Promise(r=>setImmediate(r));
class Net {
 constructor(schema){this.schema=schema;this.hub=new DocHub({schema});this.boxes=new Map();this.upstream=[];this.clients={};this.mirrors={};this.events=0;}
 add(actor){const box={events:[],receive:null,stop:null};this.boxes.set(actor,box);const transport={sendPresence:()=>{},subscribe:(since,receive,epoch)=>{box.receive=receive;box.events.push(this.hub.hello(since,epoch));box.stop=this.hub.listen(e=>box.events.push(e));return()=>{box.stop?.();box.receive=null;};},send:async message=>{this.upstream.push({actor,message});}};
 const c=new Client({schema:this.schema,actor,transport});this.clients[actor]=c;this.mirrors[actor]=structuredClone(c.model());c.subscribe({modelEvents:(edits,info)=>{this.events++;this.mirrors[actor]=info.fallback?structuredClone(c.model()):applyEdits(this.schema,this.mirrors[actor],edits);invariant('event-mirror',()=>assert.deepEqual(this.mirrors[actor],c.model()));}});c.connect();return c;}
 up(actor){const send=this.upstream.filter(x=>!actor||x.actor===actor);this.upstream=this.upstream.filter(x=>actor&&x.actor!==actor);for(const {message:m} of send)m.kind==='change'?this.hub.submit(m.change):this.hub.ack(m.ack);}
 down(actor){for(const [a,b] of this.boxes)if(!actor||a===actor){const events=b.events;b.events=[];for(const e of events)b.receive?.(e);}}
 async flush(order=['A','B'],down=['A','B']){for(let n=0;n<20;n++){await tick();for(const a of order)this.up(a);for(const a of down)this.down(a);await tick();if(!this.upstream.length&&[...this.boxes.values()].every(b=>!b.events.length))return;}throw Error('delivery budget');}
 close(){for(const c of Object.values(this.clients)){c.disconnect();}}
}
function expected(f,a,b){const line=`line_${f.seed}`,attr=`tone_${f.seed}`;return {type:f.schema.root,children:[{type:line,attrs:{[attr]:'kept'},runs:[{text:a,marks:{}}]},{type:line,attrs:{[attr]:'kept'},runs:[{text:b,marks:{}}]}]};}
function check(net,f,a,b){
 const model=expected(f,a,b);
 for(const c of Object.values(net.clients)){
  invariant('event-mirror',()=>assert.equal(c.notificationErrors.length,0,JSON.stringify(c.notificationErrors)));
  invariant('oracle',()=>assert.deepEqual(c.model(),model));
  invariant('pending',()=>assert.equal(c.sync.pending.length,0));
 }
 invariant('convergence',()=>assert.deepEqual(net.hub.doc.toJSON(),model));
}
export async function replay(input){const f=structuredClone(input);validate(f);const net=new Net(f.schema);const trace=[];
 try{
 // Seed before either actor subscribes: no actor undo stack owns the baseline.
 net.hub.doc.edit([{op:'insert',at:[0],content:expected(f,'x','y').children}]);net.hub.doc.edit([{op:'delete',at:[2],count:1}]);net.add('A');net.add('B');await net.flush();check(net,f,'x','y');
 for(const r of f.rounds){for(const actor of ['A','B']){trace.push({round:r.id,actor,kind:'insert'});net.clients[actor].edit([{op:'insert',at:[actor==='A'?0:1,0],content:actor}]);}
 await net.flush(r.up,r.down);check(net,f,'Ax','By');for(const actor of r.undo){trace.push({round:r.id,actor,kind:'undo'});net.clients[actor].undo();await net.flush(r.up,r.down);const done=trace.filter(t=>t.round===r.id&&t.kind==='undo').map(t=>t.actor);check(net,f,done.includes('A')?'x':'Ax',done.includes('B')?'y':'By');invariant('history',()=>assert.equal(net.clients[actor].historyStatus().canUndo,false));}
 }
 return {ok:true,trace,events:net.events,model:net.hub.doc.toJSON()};
 }catch(e){return {ok:false,failureClass:e.failureClass??'execution',message:String(e.message),trace};}finally{net.close();}}
export function serialize(f){validate(f);const payload=JSON.stringify(f);return JSON.stringify({fixture:f,sha256:createHash('sha256').update(payload).digest('hex')});}
export function deserialize(json){const x=JSON.parse(json);validate(x.fixture);assert.equal(x.sha256,createHash('sha256').update(JSON.stringify(x.fixture)).digest('hex'));return x.fixture;}
// Predicate returns a replay result. Test injection is explicit; production callers use replay.
export async function reduce(input,run=replay){validate(input);let f=structuredClone(input),result=await run(f);if(result.ok)return {fixture:f,result,attempts:0};const kind=result.failureClass;let attempts=0;for(let i=0;i<f.rounds.length;){const candidate={...f,rounds:f.rounds.filter((_,n)=>n!==i)};validate(candidate);const next=await run(structuredClone(candidate));attempts++;if(!next.ok&&next.failureClass===kind){f=candidate;result=next;}else i++;}return {fixture:f,result,attempts};}

// Separate targeted checks; these are not yet reducer inputs.
export async function targeted(kind){
 const f=generate(3),net=new Net(f.schema);
 try{
  net.hub.doc.edit([{op:'insert',at:[0],content:expected(f,'x','y').children},{op:'delete',at:[2],count:1}]);
  const a=net.add('A'),b=net.add('B');await net.flush();
  if(kind==='foreign-same-block'){
   a.edit([{op:'insert',at:[0,0],content:'A'}]);await net.flush();
   b.edit([{op:'insert',at:[0,2],content:'B'}]);await net.flush();
   a.undo();await net.flush();check(net,f,'xB','y');
   assert.equal(a.historyStatus().canUndo,false);assert.equal(b.historyStatus().canUndo,true);
  }else if(kind==='late-batch'){
   const before={model:structuredClone(a.model()),history:a.historyStatus(),pending:structuredClone(a.sync.pending),events:net.events,snapshot:a.snapshot()};
   assert.throws(()=>a.edit([{op:'insert',at:[0,0],content:'first'},{op:'insert',at:[99,0],content:'invalid'}]));
   assert.deepEqual({model:a.model(),history:a.historyStatus(),pending:a.sync.pending,events:net.events,snapshot:a.snapshot()},before);
   await net.flush();check(net,f,'x','y');
  }else if(kind==='peer-delete'||kind==='peer-move'){
   const captured=JSON.stringify(a.stamp());
   b.edit(kind==='peer-delete'?[{op:'delete',at:[0],count:1}]:[{op:'move',from:[0],at:[1]}]);await net.flush();
   assert.notEqual(JSON.stringify(a.stamp()),captured);
   const before={model:structuredClone(a.model()),history:a.historyStatus(),pending:structuredClone(a.sync.pending),events:net.events};
   assert.throws(()=>{if(JSON.stringify(a.stamp())!==captured)throw Error('stale guard');a.edit([{op:'insert',at:[0,0],content:'wrong'}]);},/stale guard/);
   assert.deepEqual({model:a.model(),history:a.historyStatus(),pending:a.sync.pending,events:net.events},before);
   assert.deepEqual(a.model(),b.model());assert.deepEqual(a.model(),net.hub.doc.toJSON());
  }else throw Error('unknown targeted case');
  for(const c of [a,b])assert.equal(c.notificationErrors.length,0);
 }finally{net.close();}
}
