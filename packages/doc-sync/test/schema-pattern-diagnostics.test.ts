import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Doc,attrValueOk,checkSchema,schemaVersion,diagnoseAtomicAttributePatterns,type Schema,type AttrSpec} from '../src/index.ts';
const schema=(spec:AttrSpec):Schema=>({root:'root',marks:[],nodes:{root:{shape:'flow',children:['p.dot'],default:'p.dot'},'p.dot':{shape:'text',attrs:{'label.with.dot':spec}}}});
test('atomic invalid pattern has tokenized path and fails preflight and construction',()=>{
 const s=schema({default:'',pattern:'['});
 const diagnostics=diagnoseAtomicAttributePatterns(s);assert.equal(diagnostics.length,1);assert.equal(diagnostics[0].code,'invalid_pattern');assert.deepEqual(diagnostics[0].path,['nodes','p.dot','attrs','label.with.dot','pattern']);assert.ok(diagnostics[0].message);
 assert.ok(checkSchema(s).length>0);assert.throws(()=>new Doc('test',s));assert.throws(()=>schemaVersion(s));assert.equal(attrValueOk(s.nodes['p.dot'].attrs!['label.with.dot'],'text'),false);
});
test('mark value invalid pattern is diagnosed and rejected before use',()=>{
 const s=schema({default:''});s.markValues={'link.with.dot':{default:'',pattern:'('}};
 const diagnostics=diagnoseAtomicAttributePatterns(s);assert.deepEqual(diagnostics.map(d=>({code:d.code,path:d.path})),[{code:'invalid_pattern',path:['markValues','link.with.dot','pattern']}]);assert.throws(()=>new Doc('test',s));assert.throws(()=>schemaVersion(s));
});
test('present non-string atomic patterns fail closed without coercion',()=>{
 for(const pattern of [null,0,false,[],{},42]){const spec={default:'',pattern} as unknown as AttrSpec;const s=schema(spec);assert.equal(diagnoseAtomicAttributePatterns(s)[0].code,'pattern_type');assert.throws(()=>new Doc('test',s));assert.equal(attrValueOk(spec,'text'),false);assert.equal(attrValueOk(spec,null),true);}
});
test('valid, empty and undefined patterns preserve validation and reset behavior',()=>{
 for(const pattern of [undefined,'','^ok$']){const spec={default:'',...(pattern===undefined?{}:{pattern})};const s=schema(spec);const original=JSON.stringify(s),fingerprint=schemaVersion(s);assert.deepEqual(diagnoseAtomicAttributePatterns(s),[]);assert.deepEqual(checkSchema(s),[]);assert.doesNotThrow(()=>new Doc('test',s));assert.doesNotThrow(()=>schemaVersion(s));assert.equal(attrValueOk(spec,null),true);assert.equal(attrValueOk(spec,'ok'),true);assert.equal(attrValueOk(spec,'bad'),pattern!=='^ok$');assert.equal(JSON.stringify(s),original);assert.equal(schemaVersion(s),fingerprint);}
 assert.equal(attrValueOk({default:'',pattern:undefined},'text'),true);assert.deepEqual(diagnoseAtomicAttributePatterns(schema({default:'',pattern:undefined})),[]);
 assert.equal(attrValueOk({default:'',pattern:'['},null),true);
});
test('atomic enum reference identity and nested field deep equality remain distinct',()=>{
 const choice={x:1};const atomic={default:choice,values:[choice]};assert.equal(attrValueOk(atomic,choice),true);assert.equal(attrValueOk(atomic,{x:1}),false);
 const nested={default:{leaf:{x:1}},fields:{leaf:{default:{x:1},values:[choice]}}};assert.equal(attrValueOk(nested,{leaf:{x:1}}),true);assert.deepEqual(diagnoseAtomicAttributePatterns(schema(nested)),[]);
});
test('nested invalid pattern stays with existing field diagnostics, not atomic API',()=>{
 const nested={default:{leaf:''},fields:{leaf:{default:'',pattern:'['}}};const s=schema(nested);assert.deepEqual(diagnoseAtomicAttributePatterns(s),[]);assert.ok(checkSchema(s).some(message=>message.includes('invalid pattern')));assert.throws(()=>schemaVersion(s));assert.equal(attrValueOk(nested,{leaf:'text'}),false);
});
