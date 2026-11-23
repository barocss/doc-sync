import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {WORD_SCHEMA,PRESENTATION_SCHEMA} from '../../fixtures/product-schemas.ts';
const original=JSON.parse(readFileSync(new URL('../runtime-document-unused/product-schemas.json',import.meta.url)));
const manifest=JSON.parse(readFileSync(new URL('../runtime-document-unused/product-schemas.manifest.json',import.meta.url)));
const digest=value=>createHash('sha256').update(value).digest('hex');
assert.equal(digest(readFileSync(new URL('../../fixtures/product-schemas.ts',import.meta.url))),manifest.sourceSha256);
assert.equal(digest(readFileSync(new URL('../runtime-document-unused/product-schemas.json',import.meta.url))),manifest.snapshotSha256);
assert.equal(digest(readFileSync(new URL('../rust-sdk/examples/runtime_textfalse_trace.rs',import.meta.url))),'4cc8b8eff86ab65213d639e4eae6f3996d9a36419782823642d10d0680b251a9','preserved inherited physical trace adapter');
function profile(name,schema,index,nested=false){
 const commands=[];let time=0;
 const add=(label,actor,op,rest={})=>commands.push({label,actor,op,...rest,time:++time});
 const send=(label,from,to,change,rest={})=>add(label,from,'deliver',{from,to,change,...rest});
 const container=name.startsWith('word')?'section':'slide';
 add('original empty document','A','capture');
 add('root UTF16 text','A','insertText',{after:null,text:'ab😀cd',alias:'text',marks:{bold:true}});
 const richParagraph={type:'paragraph',attrs:{style:{align:'center',spacing:2,indent:1}},runs:[{text:'P😀',marks:{italic:true}},{text:'tail',marks:{bold:true}}]};
 const paragraph=index===0?{type:'paragraph',runs:[]}:richParagraph;
 if(nested){
  add('nested paragraph model insertion','A','insertModel',{at:[1],model:{type:container,children:[{type:'paragraph',runs:[{text:'nested'}]}]},alias:'container'});
 }else{
  add('fresh empty container','A','insertBlock',{after:{ref:'text',offset:5},kind:container,alias:'container'});
  add('explicit paragraph index '+index,'A','insertParagraph',{parent:'container',at:[1,index],model:paragraph,alias:'paragraph'});
 }
 add('undo paragraph insertion','A','undo',{change:'paragraphUndo'});
 add('own paragraph redo checkpoint','A','checkpoint');
 add('redo paragraph insertion','A','redo',{change:'paragraphRedo'});
 if(!nested)add('stable nested paragraph selection','A','selectionStable',{name:'nestedSel',range:{anchor:[1,index,0],focus:[1,index,index===0?0:3]}});
 add('stable root selection','A','selectionStable',{name:'sel',range:{anchor:[0,1],focus:[0,4]}});
 send('initial delivery','A','B','pending');
 if(!nested){
  add('A nested paragraph style writer','A','setField',{target:'paragraph',key:'style',path:['align'],value:'right',change:'nestedStyle'});
  add('B nested paragraph UTF16 writer','B','insertText',{parent:'container',after:'paragraph',text:'N😀',change:'nestedPeer'});
  send('nested style delivery','A','B','nestedStyle');send('nested peer delivery','B','A','nestedPeer');
  add('undo nested style preserves peer','A','undo',{change:'nestedUndo'});send('nested undo delivery','A','B','nestedUndo');
  add('own nested redo checkpoint','A','checkpoint');
  add('redo nested style after checkpoint','A','redo',{change:'nestedRedo'});send('nested redo delivery','A','B','nestedRedo');
  add('B nested foreign style writer','B','setField',{target:'paragraph',key:'style',path:['align'],value:'center',change:'nestedForeign'});send('nested foreign style delivery','B','A','nestedForeign');
  add('undo fences nested foreign style writer','A','undo',{change:'nestedFence'});send('nested fence delivery','A','B','nestedFence');
 }
 add('A local format writer','A','format',{targets:['text'],key:'bold',value:false,change:'formatA',caretBefore:'text',caretAfter:{ref:'text',offset:1}});
 add('B concurrent UTF16 writer','B','insertText',{after:{ref:'text',offset:5},text:'B😀',alias:'peer',change:'peerB'});
 send('local format delivery','A','B','formatA');send('foreign text delivery','B','A','peerB');
 add('undo local format preserves peer','A','undo',{change:'undoA'});send('undo delivery','A','B','undoA');
 add('own JSON checkpoint with redo and pending','A','checkpoint');
 add('redo local format after checkpoint','A','redo',{change:'redoA'});send('redo delivery','A','B','redoA');
 add('B foreign format writer','B','format',{targets:['text'],key:'bold',value:true,change:'formatB'});send('foreign format delivery','B','A','formatB');
 add('undo fences foreign format writer','A','undo',{change:'fenced'});send('foreign undo delivery','A','B','fenced');
 add('A raw same type writer','A','rawSet',{target:'rootHead',value:'paragraph',change:'rawA',caretBefore:'text',caretAfter:{ref:'text',offset:1}});send('raw A delivery','A','B','rawA');
 add('B raw same type foreign writer','B','rawSet',{target:'rootHead',value:'paragraph',change:'rawB'});send('raw B delivery','B','A','rawB');
 add('undo fences raw foreign writer','A','undo',{change:'rawUndo'});send('raw undo delivery','A','B','rawUndo');
 add('own JSON checkpoint retains pending','A','checkpoint');
 send('retry pending twice own and peer','A','B','pending',{repeat:2,self:true});send('peer pending delivery','B','A','pending',{repeat:2,self:true});
 add('restored stable selection','A','resolveSelection',{name:'sel'});
 if(!nested)add('restored nested paragraph selection','A','resolveSelection',{name:'nestedSel'});
 add('reject nested wrong parent','A','rejectModel',{at:[1,0],model:{type:'unknown-type',runs:[]}});
 add('reject paragraph wrong inline parent','A','rejectParagraph',{at:[1,0],model:{type:'paragraph',runs:[{type:'image-block',runs:[]}]}});
 add('reject raw paragraph bad field','A','rejectField',{target:'rootHead',key:'style',path:['align'],value:'bad'});
 add('reject malformed nested model','A','rejectModel',{at:[1],model:{type:container,children:[{type:'unknown-type'}]}});
 add('reject unknown acknowledgement','A','rejectAck');
 add('reject bad history checkpoint','A','rejectCheckpoint',{kind:'historyVersion'});add('reject unsent pending checkpoint','A','rejectCheckpoint',{kind:'pending'});
 add('ack local pending','A','ack');add('ack peer pending','B','ack');add('final convergence','A','capture');
 return {name,schema,commands};
}
export const documents=[];
for(const[name,schema,positions]of[['word',WORD_SCHEMA,[0,1,3]],['presentation',PRESENTATION_SCHEMA,[0,1,2]]]){
 assert.deepEqual(schema,original[name]);assert.equal(Object.keys(schema.nodes).length,name==='word'?23:27);
 for(const index of positions)documents.push(profile(name+'-paragraph-'+index,schema,index));
 documents.push(profile(name+'-nested-model',schema,0,true));
}
export const unsupported=[];
// B writes the pre-existing automatic head before A compiles the end insertion.
// Delivery follows A compilation. A must retain B's exact placement writer.
for(const[name,schema,index]of[['word',WORD_SCHEMA,3],['presentation',PRESENTATION_SCHEMA,2]]){
 const commands=[];let time=0;
 const add=(label,actor,op,rest={})=>commands.push({label,actor,op,...rest,time:++time});
 const send=(label,from,to,change,rest={})=>add(label,from,'deliver',{from,to,change,...rest});
 add('root UTF16 text','A','insertText',{after:null,text:'ab😀cd',alias:'text'});
 add('fresh empty container','A','insertBlock',{after:{ref:'text',offset:5},kind:name==='word'?'section':'slide',alias:'container'});
 add('alias original automatic head','A','flowHead',{parent:'container',alias:'oldDefault'});
 add('seed original head UTF16 content','A','insertText',{parent:'container',after:null,text:'HEAD😀',alias:'oldHeadText'});
 add('alias required trailing sibling','A','required',{parent:'container',kind:name==='word'?'footer':'notes',ordinal:0,alias:'requiredTail'});
 send('initial container delivered','A','B','pending');
 add('B concurrent old default head writer','B','rawMove',{target:'oldDefault',parent:'container',after:'requiredTail',change:'headMove'});
 add('A real paragraph end insertion','A','insertParagraph',{at:[1,index],parent:'container',model:{type:'paragraph',runs:[{text:'Owned😀'}]},alias:'paragraph',change:'paragraph'});
 send('deliver B old head move','B','A','headMove');
 send('deliver A new paragraph','A','B','paragraph');
 add('own checkpoint preserves lower-clock B writer','A','checkpoint');
 add('undo paragraph retains old head writer','A','undo',{change:'undoParagraph'});send('undo paragraph delivery','A','B','undoParagraph');
 add('own checkpoint retains paragraph redo','A','checkpoint');
 add('redo paragraph retains old head writer','A','redo',{change:'redoParagraph'});send('redo paragraph delivery','A','B','redoParagraph');
 send('retry all pending and own twice','A','B','pending',{repeat:2,self:true});send('retry B writer and own twice','B','A','pending',{repeat:2,self:true});
 add('ack local pending','A','ack');add('ack peer pending','B','ack');add('final convergence','A','capture');
 documents.push({name:name+'-concurrent-old-head-end',schema,commands,headWriterFrom:'deliver B old head move'});
}
