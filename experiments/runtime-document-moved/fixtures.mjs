import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {WORD_SCHEMA,PRESENTATION_SCHEMA} from '../../fixtures/product-schemas.ts';
const digest=x=>createHash('sha256').update(x).digest('hex');
const original=JSON.parse(readFileSync(new URL('../runtime-document-unused/product-schemas.json',import.meta.url)));
const manifest=JSON.parse(readFileSync(new URL('../runtime-document-unused/product-schemas.manifest.json',import.meta.url)));
assert.equal(digest(readFileSync(new URL('../../fixtures/product-schemas.ts',import.meta.url))),manifest.sourceSha256);
assert.equal(digest(readFileSync(new URL('../runtime-document-unused/product-schemas.json',import.meta.url))),manifest.snapshotSha256);
assert.equal(digest(readFileSync(new URL('../rust-sdk/examples/runtime_paragraph_trace.rs',import.meta.url))),'9b71fd7fe42a4ef29f4c2365041bf8985adc676f53a133c8f881ff7b2ee9fda0','preserved paragraph adapter');
const p=text=>({type:'paragraph',runs:[{text}]});
const incoming={type:'paragraph',attrs:{style:{align:'center',spacing:2,indent:1}},runs:[{text:'NEW😀',marks:{italic:true}}]};
function builder(name,schema){
 const commands=[];let time=0;
 const add=(label,actor,op,rest={})=>commands.push({label,actor,op,...rest,time:++time});
 const send=(label,from,to,change,rest={})=>add(label,from,'deliver',{from,to,change,...rest});
 add('root source UTF16 text','A','insertText',{after:null,text:'ROOT😀',alias:'rootText'});
 return{name,schema,commands,add,send};
}
function finish(b,at,parent,{order='A-first'}={}){
 const{add,send}=b;
 add('logical paragraph AFTER movement','A','insertParagraph',{at,parent,model:incoming,alias:'inserted',change:'newParagraph'});
 add('stable inserted paragraph selection','A','selectionStable',{name:'selection',range:{anchor:[...at,0],focus:[...at,2]}});
 send('initial moved document delivery','A','B','pending');
 add('A local structured writer','A','setField',{target:'inserted',key:'style',path:['align'],value:'right',change:'fieldA'});
 send('deliver A structured writer','A','B','fieldA');
 add('B foreign UTF16 text','B','insertText',{parent,after:'inserted',text:'B😀',alias:'foreignText',change:'textB'});
 add('B foreign structured writer','B','setField',{target:'inserted',key:'style',path:['align'],value:'center',change:'fieldB'});
 add('B foreign inserted paragraph placement','B','rawMove',{target:'inserted',parent,after:null,change:'moveB'});
 send('deliver B foreign text','B','A','textB');send('deliver B foreign field','B','A','fieldB');send('deliver B foreign placement','B','A','moveB');
 const undoA=()=>{add('A undo fences B structured writer','A','undo',{change:'undoFieldA'});send('deliver A field undo','A','B','undoFieldA');};
 const undoB=()=>{add('B undo own foreign placement','B','undo',{change:'undoMoveB'});send('deliver B placement undo','B','A','undoMoveB');};
 if(order==='A-first'){undoA();undoB();}else{undoB();undoA();}
 add('B undo own structured writer','B','undo',{change:'undoFieldB'});send('deliver B field undo','B','A','undoFieldB');
 add('B own checkpoint retains both redo branches','B','checkpoint');
 add('B redo own structured writer','B','redo',{change:'redoFieldB'});send('deliver B field redo','B','A','redoFieldB');
 add('B redo own foreign placement','B','redo',{change:'redoMoveB'});send('deliver B placement redo','B','A','redoMoveB');
 add('A undo inserted paragraph retains foreign raw text','A','undo',{change:'undoParagraph'});send('deliver A paragraph undo','A','B','undoParagraph');
 add('A own checkpoint retains paragraph redo','A','checkpoint');
 add('A redo inserted paragraph','A','redo',{change:'redoParagraph'});send('deliver A paragraph redo','A','B','redoParagraph');
 send('retry pending and own twice','A','B','pending',{repeat:2,self:true});send('retry peer pending and own twice','B','A','pending',{repeat:2,self:true});
 add('resolve inserted selection after move and checkpoint','A','resolveSelection',{name:'selection'});
 add('reject unknown model on moved document','A','rejectModel',{at,model:{type:'unknown',runs:[]}});
 add('reject bad own history checkpoint','A','rejectCheckpoint',{kind:'historyVersion'});
 add('reject unsent pending checkpoint','A','rejectCheckpoint',{kind:'pending'});
 add('ack A pending','A','ack');add('ack B pending','B','ack');add('final convergence','A','capture');
 return{name:b.name,schema:b.schema,commands:b.commands,foreignTextSeedLabel:'B foreign UTF16 text',foreignTextFromLabel:'deliver B foreign text',undoOrder:order};
}
export const documents=[];
for(const[name,schema]of[['word',WORD_SCHEMA],['presentation',PRESENTATION_SCHEMA]]){
 assert.deepEqual(schema,original[name]);assert.equal(Object.keys(schema.nodes).length,name==='word'?23:27);
 // Same-flow reordering and movement history that stays global after undo.
 for(const[index,history]of[[0,'active'],[1,'undone'],[3,'redone']]){
  const b=builder(name+'-root-'+index+'-'+history,schema);
  b.add('seed first real paragraph','A','insertModel',{at:[1],model:p('ONE'),alias:'one'});
  b.add('seed second real paragraph','A','insertModel',{at:[2],model:p('TWO'),alias:'two'});
  b.add('reorder second paragraph before first','A','rawMove',{target:'two',parent:null,after:null,change:'priorMove'});
  if(history!=='active')b.add('undo prior paragraph movement','A','undo',{change:'undoPriorMove'});
  if(history==='redone')b.add('redo prior paragraph movement','A','redo',{change:'redoPriorMove'});
  documents.push(finish(b,[index],null,{order:index===1?'B-first':'A-first'}));
 }
 // Canonical default/required projections differ from raw movement order.
 for(const index of[0,1,name==='word'?4:2]){
  const b=builder(name+'-moved-default-required-'+index,schema),kind=name==='word'?'section':'slide';
  b.add('seed original nested container','A','insertModel',{at:[1],model:{type:kind,children:[]},alias:'container'});
  b.add('alias original nested head','A','flowHead',{parent:'container',alias:'oldDefault'});
  b.add('seed old default head UTF16 text','A','insertText',{parent:'container',after:null,text:'HEAD😀',alias:'oldHeadText'});
  b.add('alias trailing required child','A','required',{parent:'container',kind:name==='word'?'footer':'notes',ordinal:0,alias:'requiredTail'});
  b.add('move old default after trailing required child','A','rawMove',{target:'oldDefault',parent:'container',after:'requiredTail',change:'priorMove'});
  documents.push(finish(b,[1,index],'container',{order:index===1?'B-first':'A-first'}));
 }
 // Cross-flow paragraphs retain an old physical source and a new placement.
 if(name==='word'){
  const b=builder(name+'-cross-flow-paragraph-anchor',schema);
  b.add('seed left section','A','insertModel',{at:[1],model:{type:'section',children:[p('LEFT😀')]},alias:'left'});
  b.add('seed right section','A','insertModel',{at:[2],model:{type:'section',children:[p('RIGHT😀')]},alias:'right'});
  b.add('alias left paragraph physical head','A','flowHead',{parent:'left',alias:'leftHead'});b.add('alias right paragraph physical head','A','flowHead',{parent:'right',alias:'rightHead'});
  b.add('move left paragraph across section flows','A','rawMove',{target:'leftHead',parent:'right',after:'rightHead',change:'priorMove'});
  documents.push(finish(b,[2,2],'right',{order:'B-first'}));
  const moved=builder(name+'-moved-parent-root-reorder',schema);
  moved.add('seed left section','A','insertModel',{at:[1],model:{type:'section',children:[p('LEFT😀')]},alias:'left'});
  moved.add('seed right section','A','insertModel',{at:[2],model:{type:'section',children:[p('RIGHT😀')]},alias:'right'});
  moved.add('move parent section after its sibling','A','rawMove',{target:'left',parent:null,after:'right',change:'priorMove'});
  documents.push(finish(moved,[2,0],'left'));
 }else{
  for(const mode of['paragraph','parent']){
   const b=builder(name+'-cross-flow-'+mode,schema);
   b.add('seed left slide','A','insertModel',{at:[1],model:{type:'slide',children:[]},alias:'leftSlide'});
   b.add('seed left textbox','A','insertModel',{at:[1,1],model:{type:'text-box',children:[p('LEFT😀')]},alias:'left'});
   b.add('seed right slide','A','insertModel',{at:[2],model:{type:'slide',children:[]},alias:'rightSlide'});
   b.add('seed right textbox','A','insertModel',{at:[2,1],model:{type:'text-box',children:[p('RIGHT😀')]},alias:'right'});
   b.add('alias left paragraph physical head','A','flowHead',{parent:'left',alias:'leftHead'});b.add('alias right paragraph physical head','A','flowHead',{parent:'right',alias:'rightHead'});
   if(mode==='paragraph')b.add('move left paragraph across textbox flows','A','rawMove',{target:'leftHead',parent:'right',after:'rightHead',change:'priorMove'});
   else b.add('move textbox parent across slide flows','A','rawMove',{target:'left',parent:'rightSlide',after:'right',change:'priorMove'});
   documents.push(finish(b,mode==='paragraph'?[2,1,2]:[2,2,0],mode==='paragraph'?'right':'left',{order:mode==='paragraph'?'B-first':'A-first'}));
  }
 }
}
// A later cyclic record is suppressed; the compiler must use B's winning birth.
{
 const b=builder('presentation-cycle-suppressed-placement-winner',PRESENTATION_SCHEMA);
 b.add('seed slide','A','insertModel',{at:[1],model:{type:'slide',children:[]},alias:'slide'});
 b.add('seed group A','A','insertModel',{at:[1,1],model:{type:'object-group',children:[p('GROUP-A')]},alias:'groupA'});
 b.add('seed group B','A','insertModel',{at:[1,2],model:{type:'object-group',children:[p('GROUP-B')]},alias:'groupB'});
 b.add('alias group A head','A','flowHead',{parent:'groupA',alias:'headA'});b.add('alias group B head','A','flowHead',{parent:'groupB',alias:'headB'});
 b.add('move A inside B','A','rawMove',{target:'groupA',parent:'groupB',after:'headB',change:'priorMove'});
 b.add('record cycle-suppressed move of B inside A','A','rawMove',{target:'groupB',parent:'groupA',after:'headA',change:'suppressedMove'});
 documents.push(finish(b,[1,2],'slide',{order:'B-first'}));
}
export const unsupported=[];
// Pending A birth arrives after B changes the predecessor's current flow.
for(const[name,schema]of[['word',WORD_SCHEMA],['presentation',PRESENTATION_SCHEMA]])for(const deleted of[false,true]){
 const b=builder(name+'-stale-pending-anchor-'+(deleted?'deleted':'relocated'),schema),kind=name==='word'?'section':'slide';
 b.add('seed left destination','A','insertModel',{at:[1],model:{type:kind,children:[]},alias:'left'});
 b.add('seed right destination','A','insertModel',{at:[2],model:{type:kind,children:[]},alias:'right'});
 b.add('seed original physical predecessor','A','insertParagraph',{at:[1,1],parent:'left',model:p('existing'),alias:'existing'});
 b.add('alias right logical default head','A','flowHead',{parent:'right',alias:'rightHead'});
 b.add('move predecessor to right logical flow','A','rawMove',{target:'existing',parent:'right',after:'rightHead'});
 b.send('deliver seed state before concurrent changes','A','B','pending');
 b.add('A compiles stale pending birth','A','insertParagraph',{at:[2,2],parent:'right',model:p('pending😀'),alias:'pending',change:'pendingBirth'});
 b.add('B relocate predecessor before pending delivery','B','rawMove',{target:'existing',parent:'left',after:null,change:'relocated'});
 if(deleted)b.add('B delete predecessor before pending delivery','B','delete',{targets:['existing'],change:'deleted'});
 b.send('deliver A stale pending paragraph','A','B','pendingBirth');
 b.send('deliver B predecessor relocation','B','A','relocated');
 if(deleted)b.send('deliver B predecessor deletion','B','A','deleted');
 b.add('arrival converged before own recovery','A','capture');
 b.add('own pending checkpoint after changed predecessor','A','checkpoint');
 b.add('undo pending birth preserves predecessor writer','A','undo',{change:'pendingUndo'});b.send('deliver pending undo','A','B','pendingUndo');
 b.add('own pending redo checkpoint','A','checkpoint');
 b.add('redo pending birth preserves predecessor writer','A','redo',{change:'pendingRedo'});b.send('deliver pending redo','A','B','pendingRedo');
 b.send('retry A own and peer pending','A','B','pending',{repeat:2,self:true});b.send('retry B own and peer pending','B','A','pending',{repeat:2,self:true});
 b.add('ack A pending','A','ack');b.add('ack B pending','B','ack');b.add('final convergence','A','capture');
 documents.push({name:b.name,schema,commands:b.commands,arrivalWriterLabel:'B relocate predecessor before pending delivery',arrivalDeleteLabel:deleted?'B delete predecessor before pending delivery':null,arrivalFromLabel:'arrival converged before own recovery'});
}
// A moved document can also insert a complete flow with several text children.
for(const[name,schema]of[['word',WORD_SCHEMA],['presentation',PRESENTATION_SCHEMA]]){
 const b=builder(name+'-moved-multichild-flow-model',schema),kind=name==='word'?'section':'slide';
 b.add('seed left flow','A','insertModel',{at:[1],model:{type:kind,children:[]},alias:'left'});
 b.add('seed right flow','A','insertModel',{at:[2],model:{type:kind,children:[]},alias:'right'});
 b.add('move existing left flow after right','A','rawMove',{target:'left',parent:null,after:'right'});
 const children=[...(name==='presentation'?[{type:'title',runs:[{text:'TITLE'}]}]:[]),p('CHILD-A😀'),p('CHILD-B😀')];
 b.add('insert full multichild flow after prior movement','A','insertModel',{at:[1],model:{type:kind,children},alias:'newFlow',change:'flowBirth'});
 b.add('select text inside new multichild flow','A','selectionStable',{name:'selection',range:{anchor:[1,0,0],focus:[1,0,2]}});
 b.send('deliver complete moved flow model','A','B','pending');
 b.add('B structured writer on new flow','B','setField',{target:'newFlow',key:name==='word'?'page':'canvas',path:['width'],value:1440,change:'flowForeign'});b.send('deliver foreign flow field','B','A','flowForeign');
 b.add('own checkpoint before flow birth undo','A','checkpoint');
 b.add('undo new full flow model','A','undo',{change:'flowUndo'});b.send('deliver full flow undo','A','B','flowUndo');
 b.add('own checkpoint retains full flow redo','A','checkpoint');
 b.add('redo new full flow model','A','redo',{change:'flowRedo'});b.send('deliver full flow redo','A','B','flowRedo');
 b.send('retry full flow pending and own','A','B','pending',{repeat:2,self:true});b.send('retry foreign flow pending and own','B','A','pending',{repeat:2,self:true});
 b.add('resolve selection inside restored flow','A','resolveSelection',{name:'selection'});
 b.add('ack A pending','A','ack');b.add('ack B pending','B','ack');b.add('final convergence','A','capture');
 documents.push({name:b.name,schema,commands:b.commands,foreignFieldLabel:'B structured writer on new flow',foreignFieldFromLabel:'deliver foreign flow field'});
}
// The same raw seed restores equivalent own line maps in opposite lazy orders.
for(const[name,schema]of[['word',WORD_SCHEMA],['presentation',PRESENTATION_SCHEMA]])for(const reverse of[false,true]){
 const b=builder(name+'-virtual-promotion-order-'+(reverse?'BA':'AB'),schema),kind=name==='word'?'section':'slide',atom=name==='word'?'page-break':'image';
 const promotionSources=[];
 for(const side of['left','right']){
  b.add('seed '+side+' eligible flow','A','rawNode',{kind,parent:null,after:side==='left'?{ref:'rootText',offset:5}:'left',alias:side});
  b.add('alias '+side+' default head','A','flowHead',{parent:side,alias:side+'Head'});
  b.add('alias '+side+' required right boundary','A','required',{parent:side,kind:name==='word'?'header':'notes',ordinal:0,alias:side+'Right'});
  for(const ordinal of[1,2]){
   const after=ordinal===1?side+'Head':side+'Text1',tag=side+'Atom'+ordinal,text=side+'Text'+ordinal;
   b.add('seed '+side+' atom '+ordinal,'A','rawNode',{kind:atom,parent:side,after,alias:tag});
   b.add('seed '+side+' raw virtual gap '+ordinal,'A','rawText',{parent:side,after:tag,text:side[0]+ordinal,alias:text});
   promotionSources.push({parent:side,after:tag,first:text});
  }
 }
 b.add('move left eligible flow after right','A','rawMove',{target:'left',parent:null,after:'right'});
 b.add('restore equivalent lazy line map '+(reverse?'B,A':'A,B'),'A','capture',{readOrder:reverse?['right','left']:['left','right']});
 const completed=finish(b,[0],null,{order:reverse?'B-first':'A-first'});
 documents.push({...completed,promotionSources,promotionPair:name+'-two-eligible-lines',promotionReadOrder:reverse?'B,A':'A,B'});
}
