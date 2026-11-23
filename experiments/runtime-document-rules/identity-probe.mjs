// Preserve JavaScript reference identity evidence. Do not replace this with deep JSON equality.
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {Doc} from '../../packages/doc-sync/dist/crdt/doc.js';
import {History} from '../../packages/doc-sync/dist/crdt/history.js';
import {checkSchema} from '../../packages/doc-sync/dist/crdt/schema.js';
const root=resolve(import.meta.dirname,'../..'),out=resolve(root,process.env.RULES_IDENTITY_OUT??'output/rust-d2-rules-2026-11-04/identity',new Date().toISOString().replaceAll(':','-')+'-'+process.pid);mkdirSync(out,{recursive:true});
const sources=['packages/doc-sync/src/crdt/model.ts','packages/doc-sync/src/crdt/doc.ts','packages/doc-sync/src/crdt/history.ts','packages/doc-sync/dist/crdt/model.js','packages/doc-sync/dist/crdt/doc.js','packages/doc-sync/dist/crdt/history.js','experiments/runtime-document-rules/identity-probe.mjs'];
const hashes=Object.fromEntries(sources.map(p=>[p,createHash('sha256').update(readFileSync(resolve(root,p))).digest('hex')]));
for(const p of sources){const to=resolve(out,'sources',p);mkdirSync(resolve(to,'..'),{recursive:true});writeFileSync(to,readFileSync(resolve(root,p)));}
const defaultObject={tone:'plain'},schema={domain:'document',root:'doc',marks:[],markValues:{paint:{default:defaultObject,inherit:true}},nodes:{doc:{shape:'flow',children:['p'],default:'p'},p:{shape:'text',children:['span']},span:{shape:'span',mark:'paint',attr:'value'}}};assert.deepEqual(checkSchema(schema),[]);
function authored(value){const d=new Doc('A',schema),before=Doc.fromSnapshot('A',d.snapshot(),schema);const ops=d.edit([{op:'insert',at:[0,0],content:[{text:'ab',marks:{paint:value}}]}]).ops;assert.equal(before.check(ops),null);const h=new History();h.record(ops,d,{caretBefore:'0@~root',caretAfter:'2@A',typing:false});const initial=d.toJSON(),cp=JSON.parse(JSON.stringify({document:d.snapshot(),history:h.snapshot()}));const r=Doc.fromSnapshot('A',cp.document,schema);assert.deepEqual(r.toJSON(),initial);const reg=d.blocks()[0].chars.map(c=>c.attrs.get('paint')?.value);return{ops,model:initial,checkpoint:cp,restoredModel:r.toJSON(),storedTokenReferencesEqual:reg[0]===reg[1],storedReferenceEqualsInput:reg[0]===value};}
const sameReference=authored(defaultObject),equalDistinctReference=authored({tone:'plain'}),nondefault=authored({tone:'warm'});
assert.equal(sameReference.ops[0].marks?.paint,undefined,'same schema-default reference suppressed by live Doc.edit');assert.deepEqual(equalDistinctReference.ops[0].marks.paint,{tone:'plain'});assert.equal(equalDistinctReference.storedTokenReferencesEqual,false);assert.equal(nondefault.model.children[0].runs.length,2,'per-token object span boundaries retained');
const receipt={status:'PASS',scope:'TypeScript reference identity only; native composite atomic defaults remain an explicit unsupported boundary unless separately implemented',schema,sameReference,equalDistinctReference,nondefault,sourceHashes:hashes};writeFileSync(resolve(out,'receipt.json'),JSON.stringify(receipt,null,2)+'\n');console.log(JSON.stringify({status:'PASS',out,defaultIdentityChangesEmittedOperations:true,perTokenObjectSpans:nondefault.model.children[0].runs.length}));
