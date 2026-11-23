import {makeExpanded} from './expanded-fixtures.mjs';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {WORD_SCHEMA,PRESENTATION_SCHEMA} from '../../fixtures/product-schemas.ts';
const digest=x=>createHash('sha256').update(x).digest('hex');
const original=JSON.parse(readFileSync(new URL('../runtime-document-unused/product-schemas.json',import.meta.url)));
const manifest=JSON.parse(readFileSync(new URL('../runtime-document-unused/product-schemas.manifest.json',import.meta.url)));
assert.equal(digest(readFileSync(new URL('../../fixtures/product-schemas.ts',import.meta.url))),manifest.sourceSha256);
assert.equal(digest(readFileSync(new URL('../runtime-document-unused/product-schemas.json',import.meta.url))),manifest.snapshotSha256);
assert.equal(digest(readFileSync(new URL('../rust-sdk/examples/runtime_moved_trace.rs',import.meta.url))),'2093e083fda18332608f6640cfed023d9afaa933e5cf0d57496d01ca83ad90d2','preserved moved adapter');
assert.deepEqual(WORD_SCHEMA,original.word);assert.deepEqual(PRESENTATION_SCHEMA,original.presentation);
assert.equal(Object.keys(WORD_SCHEMA.nodes).length,23);assert.equal(Object.keys(PRESENTATION_SCHEMA.nodes).length,27);
export const paragraph=text=>({type:'paragraph',runs:[{text,marks:{bold:true}}]});
export const list={type:'list',attrs:{listType:'numbered'},children:[
 {type:'list-item',attrs:{level:1},runs:[{text:'Alpha😀',marks:{bold:true}}]},
 {type:'list-item',attrs:{level:0},runs:[{text:'Beta',marks:{}}]},
]};
const cell=(label,first=false)=>({type:'cell',attrs:{backgroundColor:'#112233',properties:{label,complete:first}},children:[{type:'cell-body',children:[first?{type:'paragraph',runs:[{text:'A😀',marks:{bold:true}},{type:'mention',attrs:{id:'u1',label:'User'}},{text:'Z',marks:{}}]}:paragraph(label)]}]});
export const table={type:'table',attrs:{header:true},children:[
 {type:'row',children:[cell('R0C0',true),cell('R0C1')]},
 {type:'row',children:[cell('R1C0'),cell('R1C1')]},
]};
function builder(name,schema,container){
 const commands=[];let time=0;
 const add=(label,actor,op,rest={})=>commands.push({label,actor,op,...rest,time:++time});
 const send=(label,from,to,change,rest={})=>add(label,from,'deliver',{from,to,change,...rest});
 add('seed root UTF16 text','A','insertText',{after:null,text:'ROOT😀',alias:'rootText'});
 add('seed original product container','A','insertModel',{at:[1],model:{type:container,children:[]},alias:'container'});
 return{name,schema,commands,add,send};
}
function finish(b,{at,model,selection,key,value}){
 const{add,send}=b;
 add('logical group or grid model insertion','A','insertModel',{at,model,alias:'subject',change:'subjectBirth'});
 add('stable text selection in model','A','selectionStable',{name:'selection',range:{anchor:[...selection,0],focus:[...selection,2]}});
 send('deliver complete product model','A','B','pending');
 add('B foreign model field writer','B','set',{target:'subject',key,value,change:'foreignField'});send('deliver foreign model field','B','A','foreignField');
 add('own checkpoint before model undo','A','checkpoint');
 add('undo model preserves foreign writer','A','undo',{change:'modelUndo'});send('deliver model undo','A','B','modelUndo');
 add('own checkpoint retains model redo','A','checkpoint');
 add('redo model preserves foreign writer','A','redo',{change:'modelRedo'});send('deliver model redo','A','B','modelRedo');
 send('retry A own and peer pending','A','B','pending',{repeat:2,self:true});send('retry B own and peer pending','B','A','pending',{repeat:2,self:true});
 add('resolve stable model selection','A','resolveSelection',{name:'selection'});
 add('ack A pending','A','ack');add('ack B pending','B','ack');add('final convergence','A','capture');
 return{name:b.name,schema:b.schema,commands:b.commands,foreignFieldLabel:'B foreign model field writer',foreignFieldFromLabel:'deliver foreign model field'};
}
export const documents=[];
documents.push(finish(builder('word-list-model',WORD_SCHEMA,'section'),{at:[1,0],model:list,selection:[1,0,0],key:'level',value:2}));
documents.push(finish(builder('word-dense-table-model',WORD_SCHEMA,'section'),{at:[1,1],model:table,selection:[1,1,0,0,0,0],key:'header',value:false}));
documents.push(finish(builder('presentation-dense-table-model',PRESENTATION_SCHEMA,'slide'),{at:[1,1],model:table,selection:[1,1,0,0,0,0],key:'header',value:false}));
{
 const b=builder('word-existing-list-member-model',WORD_SCHEMA,'section');
 b.add('seed existing numbered list','A','insertModel',{at:[1,0],model:list,alias:'existingList'});
 documents.push(finish(b,{at:[1,0,1],model:{type:'list-item',attrs:{level:2},runs:[{text:'Middle😀',marks:{italic:true}}]},selection:[1,0,1],key:'level',value:3}));
}
export const unsupported=[];

documents.push(...makeExpanded({WORD_SCHEMA,PRESENTATION_SCHEMA,paragraph,list,table,builder,finish}));
