// This test adapter rehydrates only the identity edges declared by the native DTO.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
export const FORMAT='doc-sync-runtime-schema-alias-v1';
export const canonical=v=>v===null||typeof v!=='object'?JSON.stringify(v):Array.isArray(v)?'['+v.map(canonical).join(',')+']':'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}';
export const descriptor=(schema,at)=>at.reduce((v,k)=>{assert(v&&Object.hasOwn(v,k),'descriptor exists: '+JSON.stringify(at));return v[k];},schema);
export function normalized(dto){
 assert.equal(dto.format,FORMAT);const manifest=structuredClone(dto.manifest);if(manifest.domain==='document')delete manifest.domain;
 const edges=dto.defaultReferences.map(e=>({at:[...e.at],enumIndex:e.enumIndex})).sort((a,b)=>{for(let i=0;i<Math.min(a.at.length,b.at.length);i++){if(a.at[i]<b.at[i])return-1;if(a.at[i]>b.at[i])return 1;}return a.at.length-b.at.length||a.enumIndex-b.enumIndex;});
 return{format:FORMAT,manifest,defaultReferences:edges};
}
export const identity=dto=>'sha256:'+createHash('sha256').update(canonical(normalized(dto))).digest('hex');
export function hydrate(dto){
 assert.equal(dto.format,FORMAT);const schema=structuredClone(dto.manifest),seen=new Set();
 for(const edge of dto.defaultReferences){const key=canonical(edge);assert(!seen.has(key),'duplicate edge');seen.add(key);const d=descriptor(schema,edge.at);assert(d.default&&typeof d.default==='object'&&!d.fields,'composite atomic default required');assert(Number.isSafeInteger(edge.enumIndex)&&edge.enumIndex>=0&&edge.enumIndex<d.values.length,'valid enum index');assert.deepEqual(d.values[edge.enumIndex],d.default,'equal alias edge payload');d.values[edge.enumIndex]=d.default;}
 return schema;
}
export function aliases(schema,at,value){const d=descriptor(schema,at);return{default:value===d.default,enumIndexes:(d.values??[]).flatMap((v,i)=>v===value?[i]:[])};}
