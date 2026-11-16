import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Doc,checkSchema,schemaVersion,attrValueOk,diagnoseAtomicAttributeEnums,type Schema,type AttrSpec} from '../src/index.ts';
const schema=(spec:AttrSpec):Schema=>({root:'r',marks:[],nodes:{r:{shape:'flow',children:['p.dot'],default:'p.dot'},'p.dot':{shape:'text',attrs:{'a.dot':spec}}}});
test('malformed enum containers reject before use without substring coercion or TypeError',()=>{
 for(const values of ['ab',{},null,0,false]){
  const spec={default:'a',values} as unknown as AttrSpec,s=schema(spec),before=JSON.stringify(s);assert.deepEqual(diagnoseAtomicAttributeEnums(s),[{code:'enum_type',path:['nodes','p.dot','attrs','a.dot','values'],message:'Atomic enum values must be an array'}]);assert.ok(checkSchema(s).length);assert.throws(()=>new Doc('a',s));assert.throws(()=>new Doc('a',{...s,domain:'document'}));assert.throws(()=>schemaVersion(s));assert.equal(attrValueOk(spec,'a'),false);assert.equal(attrValueOk(spec,null),true);assert.equal(JSON.stringify(s),before);
 }
});
test('value mark container diagnostics use exact tokenized paths',()=>{
 const s=schema({default:''});s.markValues={'tag.dot':{default:'',values:'abc'} as unknown as AttrSpec};assert.deepEqual(diagnoseAtomicAttributeEnums(s)[0].path,['markValues','tag.dot','values']);assert.throws(()=>new Doc('a',s));assert.throws(()=>schemaVersion(s));
});
test('valid/empty/omitted arrays and object reference equality are preserved',()=>{
 for(const values of [[],['a','b']]){const s=schema({default:'a',values}),version=schemaVersion(s);assert.deepEqual(diagnoseAtomicAttributeEnums(s),[]);assert.doesNotThrow(()=>new Doc('a',s));assert.equal(attrValueOk(s.nodes['p.dot'].attrs!['a.dot'],'a'),values.length>0);assert.equal(schemaVersion(s),version);}
 assert.equal(attrValueOk({default:'a',values:undefined},'b'),true);
 const v={x:1},spec={default:v,values:[v]};assert.equal(attrValueOk(spec,v),true);assert.equal(attrValueOk(spec,{x:1}),false);
 const nested={default:{v:{x:1}},fields:{v:{default:{x:1},values:[v]}}};assert.deepEqual(diagnoseAtomicAttributeEnums(schema(nested)),[]);assert.equal(attrValueOk(nested,{v:{x:1}}),true);
});
test('malformed enum transition preserves live state',async()=>{
 const {DocHub}=await import('../dist/server/hub.js');const hub=new DocHub({schema:schema({default:'a',values:['a','b']})});const next=schema({default:'a',values:'ab'} as unknown as AttrSpec);const before=hub.doc.snapshot(),version=hub.schemaVersion,seq=hub.serverSeq;
 assert.throws(()=>hub.transitionSchema(next,{epoch:hub.epoch,serverSeq:seq,schemaVersion:version!}));assert.deepEqual(hub.doc.snapshot(),before);assert.equal(hub.schemaVersion,version);assert.equal(hub.serverSeq,seq);
});
