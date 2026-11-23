import {generateCases,exportReproducer} from '../runtime-document-schema-contract/fixtures.mjs';
import {createHash} from 'node:crypto';
const clone=value=>structuredClone(value);
const cell=(text,attrs={})=>({type:'cell',attrs,children:[{type:'cell-body',children:[{type:'paragraph',runs:[{text,marks:{bold:true}}]}]}]});
const smallTable=(text='OUTER')=>({type:'table',attrs:{header:true},children:[{type:'row',children:[cell(text)]}]});
const mergedTable=()=>({type:'table',attrs:{header:true},children:[
 {type:'row',children:[cell('MERGE',{colspan:2,rowspan:2}),cell('HIDDEN',{properties:{label:'hidden',complete:false}})]},
 {type:'row',children:[cell('LOWER'),cell('DEEP')]},
]});

export function makeExpanded({WORD_SCHEMA,PRESENTATION_SCHEMA,paragraph,list,table,builder,finish}){
 const result=[];
 // A group path denotes an insertion position in its parent flow; a paragraph
 // or grid can split the derived group when that parent admits the new type.
 for(const[type,model,key,value,selection]of[
  ['paragraph',paragraph('Split😀'),'style',null,null],
  ['grid',clone(table),'header',false,null],
 ]){
  const b=builder('word-group-split-'+type,WORD_SCHEMA,'section');
  b.add('seed list that will split','A','insertModel',{at:[1,0],model:clone(list),alias:'existingList'});
  if(type==='paragraph'){
   result.push(finish(b,{at:[1,0,1],model,key:'style',value:{align:'right',spacing:1,indent:0},selection:[1,1]}));
  }else result.push(finish(b,{at:[1,0,1],model,key,value,selection:[1,1,0,0,0,0]}));
 }
 {
  const b=builder('presentation-textbox-list-model',PRESENTATION_SCHEMA,'slide');
  b.add('seed reachable textbox group parent','A','insertModel',{at:[1,1],model:{type:'text-box',children:[]},alias:'textbox'});
  const model=clone(list);model.children[0].attrs.listType=null;model.children[1].attrs.listType='bullet';model.children.push({type:'list-item',attrs:{listType:'numbered',level:2},runs:[{text:'ExplicitNumbered😀',marks:{}}]});
  result.push(finish(b,{at:[1,1,0],model,selection:[1,1,0,0],key:'level',value:3}));
 }
 {
  const b=builder('word-moved-list-member-insertion',WORD_SCHEMA,'section');
  b.add('seed left list','A','insertModel',{at:[1,0],model:clone(list),alias:'firstMember'});
  b.add('seed right section','A','insertModel',{at:[2],model:{type:'section',children:[paragraph('RIGHT')]},alias:'right'});
  b.add('alias right default paragraph','A','flowHead',{parent:'right',alias:'rightHead'});
  b.add('move first stored list member across flows','A','rawMove',{target:'firstMember',parent:'right',after:'rightHead'});
  result.push(finish(b,{at:[2,1,1],model:{type:'list-item',attrs:{level:2},runs:[{text:'MovedMember😀',marks:{bold:true}}]},selection:[2,1,1],key:'level',value:3}));
 }
 {
  const b=builder('word-ragged-table-model',WORD_SCHEMA,'section'),model=clone(table);model.children[1].children.pop();
  result.push(finish(b,{at:[1,1],model,selection:[1,1,0,0,0,0],key:'header',value:false}));
 }
 // Covered cell bodies remain addressable and retain their payload while
 // concurrent row/column insertions extend the span's anchored range.
 for(const order of['A-first','B-first']){
  const b=builder('word-covered-cell-peer-axes-'+order,WORD_SCHEMA,'section'),{add,send}=b;
  add('seed merged covered grid','A','insertModel',{at:[1,1],model:mergedTable(),alias:'grid',rowAliases:['r0','r1'],colAliases:['c0','c1']});
  add('insert paragraph in covered cell','A','insertModel',{at:[1,1,0,1,0,1],model:paragraph('Inside😀'),alias:'subject',change:'inside'});
  add('select inserted hidden-cell text','A','selectionStable',{name:'selection',range:{anchor:[1,1,0,1,0,1,0],focus:[1,1,0,1,0,1,2]}});
  send('deliver hidden-cell model','A','B','pending');
  add('B foreign UTF16 text','B','insertText',{after:'subject',text:'B😀',alias:'foreignText',change:'textB'});
  add('B foreign covered-cell property','B','setCell',{grid:'grid',row:'r0',col:'c1',key:'properties',value:{label:'peer',complete:true},change:'fieldB'});
  add('B insert row inside anchored span','B','insertAxis',{grid:'grid',axis:'rows',kind:'row',after:'r0',alias:'peerRow',change:'rowB'});
  add('B insert column inside anchored span','B','insertAxis',{grid:'grid',axis:'cols',kind:'cell',after:'c0',alias:'peerCol',change:'colB'});
  send('deliver B foreign text','B','A','textB');send('deliver covered-cell field','B','A','fieldB');send('deliver span row','B','A','rowB');send('deliver span column','B','A','colB');
  const undoA=()=>{add('A undo covered-cell model','A','undo',{change:'undoA'});send('deliver A hidden-cell undo','A','B','undoA');};
  const undoB=()=>{add('B undo own span column','B','undo',{change:'undoCol'});send('deliver B column undo','B','A','undoCol');add('B undo own span row','B','undo',{change:'undoRow'});send('deliver B row undo','B','A','undoRow');};
  if(order==='A-first'){undoA();undoB();}else{undoB();undoA();}
  add('B own checkpoint with both axis redos','B','checkpoint');
  add('B redo span row','B','redo',{change:'redoRow'});send('deliver B row redo','B','A','redoRow');add('B redo span column','B','redo',{change:'redoCol'});send('deliver B column redo','B','A','redoCol');
  add('A own checkpoint with hidden-cell redo','A','checkpoint');add('A redo covered-cell model','A','redo',{change:'redoA'});send('deliver A hidden-cell redo','A','B','redoA');
  send('retry A hidden pending','A','B','pending',{repeat:2,self:true});send('retry B axis pending','B','A','pending',{repeat:2,self:true});
  add('resolve covered-cell selection','A','resolveSelection',{name:'selection'});add('ack A pending','A','ack');add('ack B pending','B','ack');add('final convergence','A','capture');
  result.push({name:b.name,schema:b.schema,commands:b.commands,foreignTextSeedLabel:'B foreign UTF16 text',foreignTextFromLabel:'deliver B foreign text',foreignFieldLabel:'B foreign covered-cell property',foreignFieldFromLabel:'deliver covered-cell field',preserveSpanLabel:'seed merged covered grid',spanFromLabel:'deliver span column',undoOrder:order});
 }
 {
  const b=builder('presentation-table-inside-object-group',PRESENTATION_SCHEMA,'slide');
  b.add('seed nested flow object group','A','insertModel',{at:[1,1],model:{type:'object-group',children:[]},alias:'objectGroup'});
  b.add('alias ordinary default title head','A','flowHead',{parent:'container',alias:'defaultTitle'});
  b.add('alias notes right boundary','A','required',{parent:'container',kind:'notes',ordinal:0,alias:'notes'});
  b.add('seed excess real title node','A','rawNode',{parent:'container',after:'objectGroup',right:'notes',kind:'title',alias:'excessTitle'});
  b.add('seed max-clamped title text','A','rawText',{parent:'container',after:'excessTitle',text:'MAX-HIDDEN😀',marks:{bold:true},alias:'hiddenTitleText'});
  b.add('observe max-clamped title before table','A','capture');
  const ragged=clone(table);ragged.children[1].children.pop();
  const profile=finish(b,{at:[1,1,1],model:ragged,selection:[1,1,1,0,0,0,0],key:'header',value:false});
  const insertAfter=(label,commands)=>{const at=profile.commands.findIndex(command=>command.label===label);if(at<0)throw new Error('missing control label '+label);profile.commands.splice(at+1,0,...commands);};
  insertAfter('deliver complete product model',[
   {label:'B expose stored excess title',actor:'B',op:'rawSet',target:'defaultTitle',key:'$type',value:'paragraph',change:'expose'},
   {label:'deliver B exposes excess title',actor:'B',op:'deliver',from:'B',to:'A',change:'expose'},
  ]);
  insertAfter('deliver model redo',[
   {label:'B restores max title clamp',actor:'B',op:'rawSet',target:'defaultTitle',key:'$type',value:'title',change:'clamp'},
   {label:'deliver B restores max clamp',actor:'B',op:'deliver',from:'B',to:'A',change:'clamp'},
   {label:'B own checkpoint retains clamp undo',actor:'B',op:'checkpoint'},
   {label:'B undo restores excess title visibility',actor:'B',op:'undo',change:'unclamp'},
   {label:'deliver B undo exposes excess title',actor:'B',op:'deliver',from:'B',to:'A',change:'unclamp'},
   {label:'B redo hides excess title again',actor:'B',op:'redo',change:'reclamp'},
   {label:'deliver B redo restores max clamp',actor:'B',op:'deliver',from:'B',to:'A',change:'reclamp'},
  ]);
  profile.commands.forEach((command,index)=>command.time=index+1);
  result.push({...profile,maxHiddenSeedLabel:'seed max-clamped title text',maxHiddenFromLabel:'deliver complete product model',maxHiddenType:'title',maxHiddenText:'MAX-HIDDEN😀',maxHiddenChecks:[{label:'observe max-clamped title before table',visible:false},{label:'deliver complete product model',visible:false},{label:'deliver B exposes excess title',visible:true},{label:'deliver B restores max clamp',visible:false},{label:'deliver B undo exposes excess title',visible:true},{label:'deliver B redo restores max clamp',visible:false}]});
 }
 for(const[name,base]of[['word',WORD_SCHEMA],['presentation',PRESENTATION_SCHEMA]]){
  const schema=clone(base);schema.nodes['cell-body'].children.push('table');
  const b=builder(name+'-recursive-cell-table-composition',schema,name==='word'?'section':'slide');
  b.add('seed outer table','A','insertModel',{at:[1,1],model:smallTable(),alias:'outer'});
  const profile=finish(b,{at:[1,1,0,0,0,1],model:clone(table),selection:[1,1,0,0,0,1,0,0,0,0],key:'header',value:false});
  result.push({...profile,schemaFamily:'composition',composition:{baseProduct:name,change:'cell-body.children additionally admits table; public original descriptor is unchanged'}});
 }
 // Return keys for row/cell insert models identify real row/column axes. A
 // peer axis inserted after that key must survive the author's own undo.
 for(const[name,schema,shape]of[['word',WORD_SCHEMA,'row'],['presentation',PRESENTATION_SCHEMA,'cell']]){
  const b=builder(name+'-'+shape+'-model-peer-axis',schema,name==='word'?'section':'slide'),{add,send}=b;
  add('seed grid for model axis insertion','A','insertModel',{at:[1,1],model:clone(table),alias:'grid',rowAliases:['r0','r1'],colAliases:['c0','c1']});
  const at=shape==='row'?[1,1,1]:[1,1,1,1],model=shape==='row'?{type:'row',children:[cell('NEW0😀'),cell('NEW1😀'),cell('VALID-EXCESS-DROPPED')]}:cell('SELECTED-ROW😀',{properties:{label:'selected',complete:true}});
  add('logical row or column model insertion','A','insertModel',{at,model,alias:'newAxis',change:'axisA'});
  const selection=shape==='row'?[1,1,1,0,0,0]:[1,1,1,1,0,0];
  add('select inserted axis payload','A','selectionStable',{name:'selection',range:{anchor:[...selection,0],focus:[...selection,2]}});send('deliver axis model','A','B','pending');
  add('B insert peer axis after returned key','B','insertAxis',{grid:'grid',axis:shape==='row'?'rows':'cols',kind:shape==='row'?'row':'cell',after:'newAxis',alias:'peerAxis',change:'axisB'});send('deliver B peer axis','B','A','axisB');
  add('A own checkpoint before axis undo','A','checkpoint');add('A undo own axis keeps peer axis','A','undo',{change:'undoA'});send('deliver own axis undo','A','B','undoA');add('A own checkpoint with axis redo','A','checkpoint');
  add('A redo own axis keeps peer axis','A','redo',{change:'redoA'});send('deliver own axis redo','A','B','redoA');send('retry A axis pending','A','B','pending',{repeat:2,self:true});send('retry B axis pending','B','A','pending',{repeat:2,self:true});
  add('resolve inserted axis selection','A','resolveSelection',{name:'selection'});add('ack A pending','A','ack');add('ack B pending','B','ack');add('final convergence','A','capture');
  result.push({name:b.name,schema:b.schema,commands:b.commands,foreignAxisLabel:'B insert peer axis after returned key',foreignAxisFromLabel:'deliver B peer axis'});
 }
 // Custom generated descriptors are a separate suite, not additional original
 // Word/Presentation product schemas or an arbitrary-schema fuzz claim.
 for(const generated of generateCases()){
  const{schema,names:n,seed}=generated,commands=[];let time=0;
  const add=(label,actor,op,rest={})=>commands.push({label,actor,op,...rest,time:++time}),send=(label,from,to,change,rest={})=>add(label,from,'deliver',{from,to,change,...rest});
  add('seed generated initial model text','A','insertText',{after:null,text:generated.initialModel.children[0].runs[0].text,marks:{},alias:'head'});
  add('insert generated group','A','insertModel',{at:generated.edits[0].at,model:clone(generated.groupModel),alias:'group'});
  add('insert generated grid','A','insertModel',{at:generated.edits[1].at,model:clone(generated.gridModel),alias:'grid'});
  add('insert generated cell group','A','insertModel',{at:generated.edits[2].at,model:clone(generated.cellGroupModel),alias:'cellGroup',change:'cellGroup'});
  add('select generated nested member','A','selectionStable',{name:'selection',range:{anchor:[2,0,0,0,1,0,0],focus:[2,0,0,0,1,0,2]}});send('deliver generated model','A','B','pending');
  add('B generated member field writer','B','set',{target:'group',key:n.level,value:3,change:'foreign'});send('deliver generated member field','B','A','foreign');
  add('own generated checkpoint','A','checkpoint');add('undo generated cell group','A','undo',{change:'undoA'});send('deliver generated undo','A','B','undoA');add('own generated redo checkpoint','A','checkpoint');add('redo generated cell group','A','redo',{change:'redoA'});send('deliver generated redo','A','B','redoA');
  send('retry generated A pending','A','B','pending',{repeat:2,self:true});send('retry generated B pending','B','A','pending',{repeat:2,self:true});add('resolve generated nested selection','A','resolveSelection',{name:'selection'});add('ack A pending','A','ack');add('ack B pending','B','ack');add('final convergence','A','capture');
  result.push({name:'generated-schema-contract-'+seed,schema,commands,schemaFamily:'generated',seed,dimensions:generated.dimensions,reproducerSha256:createHash('sha256').update(exportReproducer(seed)).digest('hex'),foreignFieldLabel:'B generated member field writer',foreignFieldFromLabel:'deliver generated member field'});
 }
 return result;
}
