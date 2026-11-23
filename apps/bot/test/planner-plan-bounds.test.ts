import {test} from 'node:test';
import assert from 'node:assert/strict';
import {checkPlan,type Plan} from '../src/runner.ts';
const insert=():Plan=>({action:'insert',at:[0,0],text:'x',count:0,message:'Synthetic'});
test('unused fields cannot evade bounds on non-edit/non-inspect plans',()=>{
 assert.throws(()=>checkPlan({...insert(),editsJson:'x'.repeat(2*1024*1024)}),/64 KiB/);
 for(const focus of [Array(65).fill(0),[-1],[0.5],[Infinity],Array(2)])assert.throws(()=>checkPlan({...insert(),focus}),/focus/);
 assert.throws(()=>checkPlan({...insert(),unknown:'payload'} as Plan),/fields/);
 assert.throws(()=>checkPlan({...insert(),editsJson:[] as unknown as string}),/editsJson/);
 assert.throws(()=>checkPlan({...insert(),at:Array(2)}),/model plan/);
});
test('supported optional fields and legacy action shapes remain valid',()=>{
 for(const plan of [insert(),{...insert(),focus:[],editsJson:''},{...insert(),action:'delete',count:1},{...insert(),action:'inspect',focus:[0,1]},{...insert(),action:'finish',at:[],text:''},{...insert(),action:'needs_attention',at:[],text:''},{...insert(),action:'edit',at:[],text:'',editsJson:'[]'}] as Plan[])assert.doesNotThrow(()=>checkPlan(plan));
 assert.throws(()=>checkPlan({...insert(),action:'inspect',focus:[]}),/selection/);
});
test('64 KiB editsJson byte boundary applies to every action and leaves message headroom',()=>{
 // A syntactically valid structured edit array, padded with legal JSON whitespace.
 const json='[{"op":"insert","at":[0,0],"content":"x"}]';const editsJson=json+' '.repeat(64*1024-Buffer.byteLength(json));
 for(const action of ['insert','edit'] as const){assert.doesNotThrow(()=>checkPlan({...insert(),action,editsJson,message:'m'.repeat(4000)}));assert.throws(()=>checkPlan({...insert(),action,editsJson:editsJson+' '}),/64 KiB/);}
 assert.doesNotThrow(()=>checkPlan({...insert(),editsJson:'é'.repeat(32768)}));assert.throws(()=>checkPlan({...insert(),editsJson:'é'.repeat(32769)}),/64 KiB/);
});
test('aggregate serialized UTF8 budget includes JSON escaping overhead',()=>{
 // Raw editsJson is below 64 KiB, but its serialized representation exceeds 96 KiB.
 assert.throws(()=>checkPlan({...insert(),editsJson:'\u0000'.repeat(20000)}),/96 KiB/);
 assert.doesNotThrow(()=>checkPlan({...insert(),editsJson:'plain '.repeat(9000),message:'한'.repeat(4000)}));
});
