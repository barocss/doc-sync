import {test} from 'node:test';
import assert from 'node:assert/strict';
import {checkSchema,schemaVersion,attrValueOk,type AttrSpec,type Schema} from '../src/index.ts';
const wrapped=(leaf:AttrSpec):AttrSpec=>({default:{leaf:leaf.default},fields:{leaf}});
const schema=(spec:AttrSpec):Schema=>({root:'r',marks:[],nodes:{r:{shape:'flow',children:['p'],default:'p'},p:{shape:'text',attrs:{settings:spec}}}});
test('nested leaves reject coerced numeric and pattern descriptor types',()=>{
 for(const leaf of [{default:2,min:'1',max:'3'},{default:'o',pattern:{}},{default:2,min:Infinity},{default:2,max:null},{default:2,min:3,max:1}] as unknown as AttrSpec[]){const spec=wrapped(leaf),s=schema(spec);assert.ok(checkSchema(s).length);assert.throws(()=>schemaVersion(s));assert.equal(attrValueOk(spec,{leaf:leaf.default}),false);assert.equal(attrValueOk(spec,null),true);assert.equal(attrValueOk(spec,{leaf:null}),true);}
});
test('malformed nested enum containers return false instead of throwing',()=>{
 for(const values of ['abc',{},null,false,0]){const leaf={default:'a',values} as unknown as AttrSpec,spec=wrapped(leaf);assert.doesNotThrow(()=>checkSchema(schema(spec)));assert.ok(checkSchema(schema(spec)).some(p=>p.includes('values must be an array')));assert.equal(attrValueOk(spec,{leaf:'a'}),false);}
});
test('valid nested rules preserve defaults, deep equality and null resets',()=>{
 for(const leaf of [{default:2,min:1,max:3},{default:'AA',pattern:'^[A-Z]{2}$'},{default:{x:1},values:[{x:1}]}]){const spec=wrapped(leaf),s=schema(spec),before=JSON.stringify(s),version=schemaVersion(s);assert.deepEqual(checkSchema(s),[]);assert.equal(attrValueOk(spec,structuredClone(spec.default)),true);assert.equal(attrValueOk(spec,null),true);assert.equal(attrValueOk(spec,{leaf:null}),true);assert.equal(schemaVersion(s),version);assert.equal(JSON.stringify(s),before);}
});
test('deep malformed descriptor transition preserves live state and input',async()=>{
 const {DocHub}=await import('../dist/server/hub.js');const valid=wrapped(wrapped({default:2,min:1,max:3})),hub=new DocHub({schema:schema(valid)});const malformed=wrapped(wrapped({default:2,min:'1'} as unknown as AttrSpec)),next=schema(malformed),input=JSON.stringify(next),snapshot=hub.doc.snapshot(),version=hub.schemaVersion,seq=hub.serverSeq;
 assert.ok(checkSchema(next).some(p=>p.includes('settings.leaf.leaf')&&p.includes('min must be a finite number')));assert.throws(()=>hub.transitionSchema(next,{epoch:hub.epoch,serverSeq:seq,schemaVersion:version!}));assert.deepEqual(hub.doc.snapshot(),snapshot);assert.equal(hub.schemaVersion,version);assert.equal(hub.serverSeq,seq);assert.equal(JSON.stringify(next),input);
});
