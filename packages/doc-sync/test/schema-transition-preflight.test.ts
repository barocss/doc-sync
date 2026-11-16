import {test} from 'node:test';
import assert from 'node:assert/strict';
import {preflightSchemaTransition,assertCompatibleSchema,schemaVersion,type Schema} from '../src/index.ts';
const base=():Schema=>({root:'root',marks:[],nodes:{root:{shape:'flow',children:['p'],default:'p'},p:{shape:'text'}}});
test('preflight shares real compatibility verdict across descriptor changes',()=>{
 const a=base();
 for(const mutate of [
  (s:Schema)=>{},
  (s:Schema)=>{s.domain='document';},
  (s:Schema)=>{s.marks=[...s.marks,'bold'];},
  (s:Schema)=>{s.nodes.new={shape:'atom'};},
  (s:Schema)=>{s.nodes.p.ui={label:'Changed'};},
  (s:Schema)=>{s.nodes.p.attrs={x:{default:0}};},
  (s:Schema)=>{if(s.nodes.root.shape==='flow')s.nodes.root.children=[...s.nodes.root.children].reverse();},
  (s:Schema)=>{s.nodes.p={shape:'atom'};},
  (s:Schema)=>{if(s.nodes.p.shape==='text')s.nodes.p.children=[];},
 ]){const b=structuredClone(a);mutate(b);const input=JSON.stringify([a,b]);const r=preflightSchemaTransition(a,b);let compatible=true;try{assertCompatibleSchema(a,b);}catch{compatible=false;}let valid=true;try{schemaVersion(b);}catch{valid=false;}assert.equal(r.status,!valid?'invalid':compatible?'compatible':'incompatible');assert.equal(JSON.stringify([a,b]),input);if(r.status!=='invalid'){assert.equal(r.beforeVersion,schemaVersion(a));assert.equal(r.afterVersion,schemaVersion(b));}}
});
test('normalized domain has no changes; arrays atomic and path segments preserve punctuation',()=>{
 const a=base(),b=base();b.domain='document';assert.deepEqual(preflightSchemaTransition(a,b),{status:'compatible',beforeVersion:schemaVersion(a),afterVersion:schemaVersion(a),changes:[]});
 b.nodes['x.y']={shape:'atom'};b.marks=['bold'];const r=preflightSchemaTransition(a,b);assert.equal(r.status,'compatible');assert.deepEqual(r.changes,[{kind:'replace',path:['marks']},{kind:'add',path:['nodes','x.y']}]);
 const removed=preflightSchemaTransition(b,a);assert.equal(removed.status,'incompatible');assert.deepEqual(removed.changes,[{kind:'replace',path:['marks']},{kind:'remove',path:['nodes','x.y']}]);
});
test('invalid input returns no partial diff or identities and does not invoke getters',()=>{
 const a=base(),b=base();let invoked=false;Object.defineProperty(a.nodes.p,'extra',{enumerable:true,get(){invoked=true;return 1;}});const r=preflightSchemaTransition(a,b);assert.equal(r.status,'invalid');assert.deepEqual(Object.keys(r).sort(),['reason','side','status']);if(r.status==='invalid')assert.equal(r.side,'before');assert.equal(invoked,false);
 b.nodes.p.attrs={bad:{default:'',pattern:'['}};const q=preflightSchemaTransition(base(),b);assert.equal(q.status,'invalid');if(q.status==='invalid')assert.equal(q.side,'after');
});
test('diff is not a migration or a compatibility heuristic',()=>{
 const a=base(),b=base();if(b.nodes.p.shape==='text')b.nodes.p.children=[];const r=preflightSchemaTransition(a,b);assert.equal(r.status,'compatible');{assert.notEqual(r.beforeVersion,r.afterVersion);assert.deepEqual(r.changes,[{kind:'add',path:['nodes','p','children']}]);r.changes[0].path.push('mutated');}assert.equal(Object.hasOwn(b.nodes.p,'mutated'),false);
});
test('real child reorder is rejected and own special keys remain exact',()=>{
 const a=base();a.nodes.q={shape:'text'};if(a.nodes.root.shape==='flow')a.nodes.root.children=[...a.nodes.root.children,'q'];const b=structuredClone(a);if(b.nodes.root.shape==='flow')b.nodes.root.children=[...b.nodes.root.children].reverse();const r=preflightSchemaTransition(a,b);assert.equal(r.status,'incompatible');assert.throws(()=>assertCompatibleSchema(a,b));assert.deepEqual(r.changes,[{kind:'replace',path:['nodes','root','children']}]);
 const c=base();Object.defineProperty(c.nodes,'__proto__',{enumerable:true,value:{shape:'atom'}});const special=preflightSchemaTransition(base(),c);assert.equal(special.status,'compatible');assert.deepEqual(special.changes,[{kind:'add',path:['nodes','__proto__']}]);
});
