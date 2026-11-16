import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Doc,checkSchema,schemaVersion,attrValueOk,diagnoseAtomicAttributeBounds,type AttrSpec,type Schema} from '../src/index.ts';
const schema=(spec:AttrSpec):Schema=>({root:'root',marks:[],nodes:{root:{shape:'flow',children:['p.dot'],default:'p.dot'},'p.dot':{shape:'text',attrs:{'n.dot':spec}}}});
test('reversed numeric bounds reject before identity and document construction',()=>{
 const spec={default:0,min:10,max:1},s=schema(spec);assert.deepEqual(diagnoseAtomicAttributeBounds(s),[{code:'bound_order',path:['nodes','p.dot','attrs','n.dot'],message:'Minimum must not exceed maximum'}]);assert.ok(checkSchema(s).length);assert.throws(()=>schemaVersion(s));assert.throws(()=>new Doc('a',s));assert.equal(attrValueOk(spec,5),false);assert.equal(attrValueOk(spec,null),true);
});
test('present bounds must be finite numbers without coercion, including value marks',()=>{
 for(const value of ['1',null,false,Infinity,-Infinity,NaN])for(const key of ['min','max']){
  const spec={default:0,[key]:value} as AttrSpec;const s=schema({default:0});s.markValues={'measure.dot':spec};const d=diagnoseAtomicAttributeBounds(s);assert.equal(d[0].code,'bound_type');assert.deepEqual(d[0].path,['markValues','measure.dot',key]);assert.throws(()=>new Doc('a',s));assert.equal(attrValueOk(spec,2),false);assert.equal(attrValueOk(spec,null),true);
 }
});
test('valid equal/open bounds, defaults and input identity are preserved',()=>{
 for(const spec of [{default:0},{default:0,min:-2},{default:0,max:2},{default:0,min:2,max:2}]){
  const s=schema(spec),before=JSON.stringify(s),version=schemaVersion(s);assert.deepEqual(diagnoseAtomicAttributeBounds(s),[]);assert.doesNotThrow(()=>new Doc('a',s));assert.equal(attrValueOk(spec,2),true);assert.equal(attrValueOk(spec,null),true);assert.equal(JSON.stringify(s),before);assert.equal(schemaVersion(s),version);
 }
 assert.equal(attrValueOk({default:0,min:2,max:2},0),false); // default normalization is not changed
 assert.equal(attrValueOk({default:0,min:0,max:5,values:[2]},3),false);
});
test('bounds on nonnumeric defaults and nested fields retain existing policy',()=>{
 const text={default:'x',min:5,max:1};assert.deepEqual(diagnoseAtomicAttributeBounds(schema(text)),[]);assert.equal(attrValueOk(text,'y'),true);
 const nested={default:{n:2},fields:{n:{default:2,min:1,max:3}}};assert.deepEqual(diagnoseAtomicAttributeBounds(schema(nested)),[]);assert.equal(attrValueOk(nested,{n:2}),true);assert.equal(attrValueOk(nested,{n:4}),false);
});
test('omitted-like undefined bounds and multiple malformed paths are explicit',()=>{
 const spec={default:0,min:undefined,max:undefined};assert.deepEqual(diagnoseAtomicAttributeBounds(schema(spec)),[]);assert.equal(attrValueOk(spec,2),true);
 const invalid={default:0,min:'1',max:false} as unknown as AttrSpec;assert.deepEqual(diagnoseAtomicAttributeBounds(schema(invalid)).map(d=>({code:d.code,path:d.path.slice(-1)})),[{code:'bound_type',path:['min']},{code:'bound_type',path:['max']}]);
});
test('invalid transition preserves current document, revision and descriptor input',async()=>{
 const {DocHub}=await import('../dist/server/hub.js');const current=schema({default:0,min:0,max:10});const hub=new DocHub({schema:current});const next=schema({default:0,min:10,max:1});const input=JSON.stringify(next),snapshot=hub.doc.snapshot(),seq=hub.serverSeq,version=hub.schemaVersion;
 assert.throws(()=>hub.transitionSchema(next,{epoch:hub.epoch,serverSeq:seq,schemaVersion:version!}));assert.deepEqual(hub.doc.snapshot(),snapshot);assert.equal(hub.serverSeq,seq);assert.equal(hub.schemaVersion,version);assert.equal(JSON.stringify(next),input);
 assert.throws(()=>new Doc('current',{...next,domain:'document'}));
});
