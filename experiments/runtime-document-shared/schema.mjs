// Test adapter only: JSON DTO groups become actual shared JavaScript objects.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
export const FORMAT='doc-sync-runtime-schema-shared-v2';
export const canonical=v=>v===null||typeof v!=='object'?JSON.stringify(v):Array.isArray(v)?'['+v.map(canonical).join(',')+']':'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}';
export const descriptor=(schema,at)=>at.reduce((v,k)=>{assert(v&&Object.hasOwn(v,k),'descriptor exists: '+JSON.stringify(at));return v[k];},schema);
const cmp=(a,b)=>a<b?-1:a>b?1:0;
export const slotKey=s=>canonical(s);
export function slotValue(schema,s){const d=descriptor(schema,s.at);assert(d&&!d.fields,'atomic descriptor required');assert(['default','enum'].includes(s.source),'valid source');if(s.source==='default'){assert.equal(s.index,undefined,'default has no index');return d.default;}assert(Number.isSafeInteger(s.index)&&s.index>=0&&s.index<d.values?.length,'valid enum index');return d.values[s.index];}
export function normalized(dto){
 assert.equal(dto.format,FORMAT);const manifest=structuredClone(dto.manifest);if(manifest.domain==='document')delete manifest.domain;
 const norm=s=>({at:[...s.at],source:s.source,...(s.source==='enum'?{index:s.index}:{})});
 const groups=dto.referenceGroups.map(g=>({representative:norm(g.representative),slots:g.slots.map(norm).sort((a,b)=>cmp(slotKey(a),slotKey(b)))})).sort((a,b)=>cmp(canonical(a),canonical(b)));
 return{format:FORMAT,manifest,referenceGroups:groups};
}
export const identity=dto=>'sha256:'+createHash('sha256').update(canonical(normalized(dto))).digest('hex');
export function hydrate(dto){
 assert.equal(dto.format,FORMAT);const schema=structuredClone(dto.manifest),seen=new Set();
 for(const g of dto.referenceGroups){assert(g.slots.length>=2,'at least two slots');assert(g.slots.some(s=>slotKey(s)===slotKey(g.representative)),'representative in group');const representative=slotValue(schema,g.representative);assert(representative&&typeof representative==='object','composite representative');for(const s of g.slots){const key=slotKey(s);assert(!seen.has(key),'duplicate or overlapping slot');seen.add(key);const v=slotValue(schema,s);assert(v&&typeof v==='object','composite group member');assert.deepEqual(v,representative,'equal shared payload');const d=descriptor(schema,s.at);if(s.source==='default')d.default=representative;else d.values[s.index]=representative;}}
 return schema;
}
export function aliases(schema,at,value){
 const d=descriptor(schema,at),slots=[];
 const add=(descriptor,at)=>{if(descriptor.default===value)slots.push({at,source:'default'});(descriptor.values??[]).forEach((v,index)=>{if(v===value)slots.push({at,source:'enum',index});});};
 for(const [name,spec] of Object.entries(schema.markValues??{}))add(spec,['markValues',name]);for(const [kind,node]of Object.entries(schema.nodes))for(const [name,spec]of Object.entries(node.attrs??{}))add(spec,['nodes',kind,'attrs',name]);
 return{default:value===d.default,enumIndexes:(d.values??[]).flatMap((v,i)=>v===value?[i]:[]),slots:slots.sort((a,b)=>cmp(slotKey(a),slotKey(b)))};
}
