import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {WORD_SCHEMA,PRESENTATION_SCHEMA} from '../../fixtures/product-schemas.ts';
const original=JSON.parse(readFileSync(new URL('../runtime-document-unused/product-schemas.json',import.meta.url)));
assert.deepEqual(WORD_SCHEMA,original.word);assert.deepEqual(PRESENTATION_SCHEMA,original.presentation);
assert.equal(Object.keys(WORD_SCHEMA.nodes).length,23);assert.equal(Object.keys(PRESENTATION_SCHEMA.nodes).length,27);
export const paragraph=text=>({type:'paragraph',runs:[{text,marks:{bold:true}}]});
export const cell=text=>({type:'cell',attrs:{backgroundColor:'#123456'},children:[{type:'cell-body',children:text?[paragraph(text)]:[]}]});
const grid=()=>({type:'table',attrs:{header:true},children:[{type:'row',children:[cell('00'),cell('01')]},{type:'row',children:[cell('10'),cell('11')]}]});
const member=text=>({type:'list-item',attrs:{level:1},runs:[{text,marks:{}}]});
function make(name,schema,container,kind,undoOrder='A-first'){
 const commands=[];let time=0;const add=(label,actor,op,rest={})=>commands.push({label,actor,op,...rest,time:++time});const send=(label,from,to,change,rest={})=>add(label,from,'deliver',{from,to,change,...rest});
 add('seed root UTF16','A','insertText',{after:null,text:'ROOT😀',alias:'rootText'});
 add('seed original product container','A','insertModel',{at:[1],model:{type:container,children:[]},alias:'container'});
 if(kind!=='create')add('seed grid','A','insertModel',{at:[1,1],model:grid(),alias:'grid',rowAliases:['r0','r1'],colAliases:['c0','c1']});
 if(kind!=='create')add('seed anchored span','A','span',{grid:'grid',row:'r0',col:'c0',endRow:'r0',endCol:'c1'});
 send('initial delivery','A','B','pending');
 const gp=[1,1],insertion=(at,model)=>({at,model});let batch;
 if(kind==='create')batch=[{...insertion([1,1],grid()),alias:'grid'},insertion([...gp,0,1],cell('CREATE0')),insertion([...gp,1,1],cell('CREATE1')),insertion([...gp,1,1,0,1],paragraph('CREATE-LATER'))];
 if(kind==='shared')batch=[insertion([...gp,0,1],cell('A0😀')),insertion([...gp,1,1],cell('A1😀')),insertion([...gp,1,1,0,1],paragraph('LATER'))];
 if(kind==='repeat')batch=[insertion([...gp,0,1],cell('FIRST')),insertion([...gp,0,1],cell('SECOND')),insertion([...gp,1,1],cell('THIRD'))];
 if(kind==='different')batch=[insertion([...gp,0,1],cell('MIDDLE')),insertion([...gp,1,3],cell('END'))];
 if(kind==='row')batch=[insertion([...gp,1],{type:'row',children:[cell('R0'),cell('R1'),cell('DROPPED')]}),insertion([...gp,1,1,0,1],paragraph('ROW-LATER'))];
 if(kind==='group')batch=[insertion([1,2],{type:'list',attrs:{listType:'numbered'},children:[member('ONE'),member('TWO')]}),insertion([1,2,1],member('BETWEEN'))];
 if(kind==='noop')batch=[insertion([1,2],{type:'list',children:[]}),insertion([...gp,0,1],cell('REAL')),insertion([1,2],{type:'table',children:[]})];
 if(kind==='concurrent')batch=[insertion([...gp,0,1],cell('A0')),insertion([...gp,1,1],cell('A1'))];
 add('atomic native batch / one TS edit array','A','batch',{commands:batch,change:'batch'});
 add('save stable selection','A','selectionStable',{name:'stable',range:{anchor:[0,5],focus:[0,1]}});
 if(kind==='concurrent'){
  add('B same-gap batch before delivery','B','batch',{commands:[insertion([...gp,0,1],cell('B0')),insertion([...gp,1,1],cell('B1'))],change:'Bbatch'});
  send('deliver B concurrent batch','B','A','Bbatch');send('deliver A concurrent batch','A','B','batch');
 }else send('deliver batch','A','B','batch');
 add('B foreign model field writer','B','set',{target:'grid',key:'header',value:false,change:'foreignField'});send('deliver foreign model field','B','A','foreignField');
 add('B foreign UTF16 writer','B','insertText',{after:'rootText',text:'B😀',change:'foreignText'});send('deliver foreign UTF16','B','A','foreignText');
 add('invalid late batch preserves live TS clone boundary','A','rejectBatch',{commands:[insertion([...gp,0,0],cell('SHOULD-NOT-LIVE')),insertion([999,0],paragraph('INVALID'))]});
 add('own checkpoint before undo','A','checkpoint');
 if(undoOrder==='B-first'){add('undo peer text first','B','undo',{change:'peerUndo'});send('foreign undo delivery','B','A','peerUndo');}
 add('undo complete batch once','A','undo',{change:'batchUndo'});send('undo delivery','A','B','batchUndo');
 if(undoOrder==='A-first'){add('undo peer text second','B','undo',{change:'peerUndo'});send('foreign undo delivery','B','A','peerUndo');}
 add('own checkpoint retains redo','A','checkpoint');add('redo complete batch once','A','redo',{change:'batchRedo'});send('redo delivery','A','B','batchRedo');
 add('redo peer text','B','redo',{change:'peerRedo'});send('peer redo delivery','B','A','peerRedo');
 send('retry pending twice own and peer','A','B','pending',{repeat:2,self:true});send('retry B pending twice own and peer','B','A','pending',{repeat:2,self:true});
 add('resolve stable selection','A','resolveSelection',{name:'stable'});add('ack A pending','A','ack');add('ack B pending','B','ack');add('final convergence','A','capture');
 return{name,schema,commands,undoOrder,foreignFieldLabel:'B foreign model field writer',foreignFieldFromLabel:'deliver foreign model field',batchKind:kind};
}
export const documents=[];
for(const [prefix,schema,container] of [['word',WORD_SCHEMA,'section'],['presentation',PRESENTATION_SCHEMA,'slide']])for(const kind of ['shared','repeat','row','noop'])documents.push(make(prefix+'-'+kind,schema,container,kind,kind==='repeat'?'B-first':'A-first'));
documents.push(make('word-create-grid-and-fill-one-batch',WORD_SCHEMA,'section','create'));
documents.push(make('word-group-evolving',WORD_SCHEMA,'section','group','B-first'));
documents.push(make('presentation-concurrent-same-gap',PRESENTATION_SCHEMA,'slide','concurrent'));
export const unsupported=[];
// Explicit custom schema: root paragraph minimum zero makes the initial
// unprojected fallback and the projected stored paragraph boundary observable.
const custom={root:'doc',marks:[],nodes:{doc:{shape:'flow',children:['paragraph','list','table'],default:'paragraph',childRules:{paragraph:{min:0}}},paragraph:{shape:'text'},list:{shape:'group',children:['item'],by:[]},item:{shape:'text'},table:{shape:'grid',children:['row']},row:{shape:'row',children:['cell']},cell:{shape:'cell',children:['cell-body']},'cell-body':{shape:'flow',children:['paragraph'],default:'paragraph'}}};
function boundary(name,projected,trailing){
 const commands=[];let time=0;const add=(label,op,rest={})=>commands.push({label,actor:'A',op,...rest,time:++time});
 const command=(at,model)=>({at,model});const empty={type:'table',children:[]};const p=text=>({type:'paragraph',runs:[{text,marks:{}}]});
 if(projected)add('enter projected mode with same-position move','move',{target:'rootHead',parent:null,after:null});
 add('true empty batch','batch',{commands:[]});
 add('normalized empty group has no identity','batch',{commands:[command([0],{type:'list',children:[]})]});
 if(!projected)add('fresh empty grid promotes tail only','batch',{commands:[command([0],empty)],oracleBoundary:'unprojected-empty-grid-at-zero'});
 else{
  add('seed one undoable batch','batch',{commands:[command([1],p('SEED'))]});add('undo seed creates redo','undo');
  add('clock-only empty grid preserves redo','batch',{commands:[command([0],empty)]});
  add('own checkpoint retains reserved clock','checkpoint');add('true empty batch preserves redo','batch',{commands:[]});add('redo survives noops','redo');
  if(trailing){add('trailing reserved-only batch','batch',{commands:[command([1],p('TRAIL')),command([0],empty)]});add('own checkpoint retains trailing reservation','checkpoint');add('next ticket after trailing reservation','batch',{commands:[command([1],p('NEXT'))]});add('undo next batch','undo');add('redo next batch','redo');}
 }
 add('ack local pending','ack');add('capture boundary state','capture');
 return{name,schema:custom,schemaFamily:'custom',commands,undoOrder:'custom-noop-boundary',batchKind:'boundary'};
}
documents.push(boundary('custom-unprojected-empty-grid',false,false));
documents.push(boundary('custom-projected-clock-only-preserve-redo',true,false));
documents.push(boundary('custom-trailing-clock-own-checkpoint',true,true));
