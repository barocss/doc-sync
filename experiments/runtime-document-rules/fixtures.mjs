// Shared semantic intent only. Each runtime authors its own operations and expected state.
const ref=(name,offset=0)=>({ref:name,offset});
const fields=()=>({default:{label:'plain',layout:{width:0,mode:'auto'},tags:[],data:{x:0}},fields:{label:{default:'plain',pattern:'^[a-z]*$'},layout:{default:{width:0,mode:'auto'},fields:{width:{default:0,min:0,max:100},mode:{default:'auto',values:['auto','fixed']}}},tags:{default:[]},data:{default:{x:0}}}});
function builder(){const commands=[];let time=0;const add=(label,actor,op,rest={})=>commands.push({label,actor,op,...rest,time:++time});return{commands,add,send:(label,from,to,change)=>add(label,from,'deliver',{from,to,change})};}
function structured(name,suffix){
 const n=x=>x+suffix;const [root,p,flow,grid,row,cell,body,item,group,badge,span]=['root','paragraph','section','matrix','band','entry','contents','item','collection','badge','tint'].map(n),meta=n('meta'),mark=n('paint');
 const attrs=()=>({[meta]:fields()});
 const schema={domain:'document',root,marks:[],markValues:{[mark]:{default:null,inherit:true},[n('raw')]:{default:null,inherit:true},[n('array')]:{default:null,inherit:false}},nodes:{[root]:{shape:'flow',children:[p,flow,grid,group],default:p},[p]:{shape:'text',attrs:attrs(),children:[badge,span]},[flow]:{shape:'flow',children:[p,grid,group],default:p,attrs:attrs()},[grid]:{shape:'grid',children:[row],attrs:attrs()},[row]:{shape:'row',children:[cell]},[cell]:{shape:'cell',children:[body],attrs:attrs()},[body]:{shape:'flow',children:[p,group],default:p},[item]:{shape:'text',attrs:attrs(),children:[badge,span]},[group]:{shape:'group',children:[item],by:[meta]},[badge]:{shape:'inline',attrs:attrs()},[span]:{shape:'span',mark,attr:'value'}}};
 // Reverse field declaration order in the second descriptor. This is deliberate and schema-bound.
 if(suffix==='Deck')for(const spec of Object.values(schema.nodes))if(spec.attrs)spec.attrs[meta].fields=Object.fromEntries(Object.entries(spec.attrs[meta].fields).reverse());
 const {commands,add,send}=builder();
 add('empty structured defaults','A','capture');add('seed text','A','insertText',{alias:'rootText',after:null,text:'a😀bcd',marks:{}});
 add('stored paragraph','A','insertBlock',{alias:'para',kind:p,after:ref('rootText',5),attrs:{[meta]:{layout:{width:11},label:'seed'}}});
 add('paragraph text','A','insertText',{alias:'paraText',after:'para',text:'P😀',marks:{}});
 add('stored flow','A','insertBlock',{alias:'flow',kind:flow,after:ref('paraText',2),attrs:{[meta]:{layout:{mode:'fixed'}}}});
 add('flow text','A','insertText',{alias:'flowText',parent:'flow',after:null,text:'nest',marks:{}});
 add('stored inline','A','insertInline',{alias:'inline',parent:'flow',after:ref('flowText',1),kind:badge,attrs:{[meta]:{label:'inline',tags:['one'],data:{x:2}}}});
 add('stored grid','A','insertGrid',{alias:'grid',kind:grid,after:'flow',attrs:{[meta]:{label:'grid'}},rows:1,cols:1,rowAliases:['r0'],colAliases:['c0']});
 add('cell nested attrs','A','setCell',{grid:'grid',row:'r0',col:'c0',key:meta,value:{label:'cell',layout:{width:9}}});
 add('cell text','A','insertText',{alias:'cellText',grid:'grid',row:'r0',col:'c0',after:null,text:'cell😀',marks:{}});
 add('structured group member one','A','insertGroupMember',{alias:'g1',kind:item,group,after:'grid',attrs:{[meta]:{label:'group',layout:{width:4}}}});
 add('group member text','A','insertText',{alias:'gText',after:'g1',text:'one',marks:{}});
 add('structured group member two','A','insertGroupMember',{alias:'g2',kind:item,group,after:ref('gText',2),attrs:{[meta]:{label:'group',layout:{width:4}}}});
 add('derived group structured patch','A','setGroup',{target:'g1',targets:['g1','g2'],group,key:meta,value:{layout:{mode:'fixed'}}});
 for(const target of ['para','flow','inline','grid'])add(target+' independent field patch','A','set',{target,key:meta,value:{layout:{width:17},tags:['a','b'],data:{x:3}}});
 add('cell independent nested leaf','A','setCell',{grid:'grid',row:'r0',col:'c0',key:meta,value:{layout:{mode:'fixed'}}});
 add('branch reset defaults','A','set',{target:'inline',key:meta,value:{layout:null}});
 add('whole field reset defaults','A','set',{target:'grid',key:meta,value:null});
 add('structured atomic value mark','A','formatSpan',{targets:[ref('paraText',0),ref('paraText',1)],kind:span,value:{tone:'warm',level:3}});
 add('object span and plain composite marks','A','insertText',{alias:'composite',after:ref('paraText',2),text:'uv',marks:{[mark]:{tone:'warm',level:3},[n('raw')]:{a:1,b:2},[n('array')]:[1,'x']}});
 add('plain object key order one','A','insertText',{alias:'rawOne',after:ref('composite',1),text:'r',marks:{[n('raw')]:{a:1,b:2}}});
 add('plain object key order two','A','insertText',{alias:'rawTwo',after:'rawOne',text:'s',marks:{[n('raw')]:{b:2,a:1}}});
 add('structured atomic null reset','A','formatSpan',{targets:[ref('paraText',1)],kind:span,value:null});
 add('structured stable selection','A','selectionStable',{name:'stable',range:{anchor:[0,1],focus:[0,3]}});
 send('initial delivery','A','B','pending');
 add('A independent leaf','A','set',{target:'flow',key:meta,value:{label:'left'},change:'aLeaf',caretBefore:ref('rootText',0),caretAfter:ref('paraText',0)});
 add('B independent leaf','B','set',{target:'flow',key:meta,value:{layout:{width:33}},change:'bLeaf'});send('independent A delivery','A','B','aLeaf');send('independent B delivery','B','A','bLeaf');
 add('A branch reset concurrent','A','set',{target:'flow',key:meta,value:{layout:null},change:'aReset'});
 add('B leaf against branch reset','B','set',{target:'flow',key:meta,value:{layout:{width:44}},change:'bResetLeaf'});send('branch A delivery','A','B','aReset');send('branch B delivery','B','A','bResetLeaf');
 add('A same scalar leaf','A','set',{target:'inline',key:meta,value:{label:'foreign'},change:'aFence',caretBefore:ref('flowText',0),caretAfter:ref('flowText',2)});send('leaf A delivery','A','B','aFence');
 add('B same scalar leaf','B','set',{target:'inline',key:meta,value:{label:'foreign'},change:'bFence'});send('leaf B delivery','B','A','bFence');
 add('undo foreign nested leaf fence','A','undo',{change:'undoFence'});send('fence undo delivery','A','B','undoFence');add('redo foreign nested leaf fence','A','redo',{change:'redoFence'});send('fence redo delivery','A','B','redoFence');
 add('A cell same leaf','A','setCell',{grid:'grid',row:'r0',col:'c0',key:meta,value:{label:'same'},change:'aCell'});send('cell A delivery','A','B','aCell');add('B cell same leaf','B','setCell',{grid:'grid',row:'r0',col:'c0',key:meta,value:{label:'same'},change:'bCell'});send('cell B delivery','B','A','bCell');add('undo foreign cell field fence','A','undo',{change:'undoCell'});send('cell undo delivery','A','B','undoCell');
 add('local leaf caret edit','A','set',{target:'para',key:meta,value:{layout:{width:22}},change:'local',caretBefore:ref('paraText',0),caretAfter:ref('paraText',2)});send('local leaf delivery','A','B','local');add('local leaf undo','A','undo',{change:'localUndo'});send('local undo delivery','A','B','localUndo');add('restore pending redo','A','checkpoint');add('local leaf redo','A','redo',{change:'localRedo'});send('local redo delivery','A','B','localRedo');
 add('move structured paragraph to nested context','A','move',{target:'para',parent:'flow',after:ref('flowText',3),change:'movePara'});send('structured move delivery','A','B','movePara');add('undo structured move','A','undo',{change:'undoMovePara'});send('structured move undo delivery','A','B','undoMovePara');add('redo structured move','A','redo',{change:'redoMovePara'});send('structured move redo delivery','A','B','redoMovePara');
 add('resolve structured selection','A','resolveSelection',{name:'stable'});
 add('reject unknown field','A','rejectField',{target:'flow',key:meta,path:['missing'],value:2});add('reject wrong nested type','A','rejectField',{target:'flow',key:meta,path:['layout','width'],value:'bad'});add('reject nested range','A','rejectField',{target:'flow',key:meta,path:['layout','width'],value:101});
 add('reject wrong field branch','A','rejectSet',{target:'flow',key:meta,value:{layout:4}});
 add('pending replay twice','A','deliver',{from:'A',to:'B',change:'pending',repeat:2,self:true});add('restore structured history','A','checkpoint');add('reject unknown ack','A','rejectAck');add('reject history checkpoint','A','rejectCheckpoint',{kind:'historyVersion'});add('reject pending checkpoint','A','rejectCheckpoint',{kind:'pending'});add('ack pending','A','ack');add('restore ack','A','checkpoint');
 return{name,schema,commands};
}
function required(name,suffix){
 const n=x=>x+suffix;const [root,p,title,box,group,item,grid,row,cell,body,atom]=['root','paragraph','caption','section','collection','item','matrix','band','entry','contents','rule'].map(n),meta=n('meta');
 const schema={domain:'document',root,marks:[],nodes:{[root]:{shape:'flow',children:[p,title,box,group,grid,atom],default:p,childRules:{[title]:{min:1,max:1},[box]:{min:1,max:1},[group]:{min:1,max:2},[grid]:{min:1,max:1},[atom]:{min:1,max:1}}},[p]:{shape:'text'},[title]:{shape:'text',attrs:{[meta]:fields()}},[box]:{shape:'flow',children:[p,title],default:p,childRules:{[title]:{min:1,max:1}},attrs:{[meta]:fields()}},[group]:{shape:'group',children:[item],by:[]},[item]:{shape:'text'},[grid]:{shape:'grid',children:[row]},[row]:{shape:'row',children:[cell]},[cell]:{shape:'cell',children:[body]},[body]:{shape:'flow',children:[p],default:p},[atom]:{shape:'atom',attrs:{level:{default:0,min:0,max:5}}}}};
 const blocked=n('suppressed');schema.nodes[blocked]={shape:'atom'};schema.nodes[root].children.push(blocked);schema.nodes[root].childRules[blocked]={min:0,max:0};
 const {commands,add,send}=builder();
 add('required auto materialization','A','capture');
 for(const [alias,kind]of[['title',title],['box',box],['group',group],['grid',grid],['rule',atom]])add('resolve required '+alias,'A','required',{alias,headAlias:alias+'Head',kind,ordinal:0,...(kind===grid?{rowAlias:'reqRow',colAlias:'reqCol'}:{})});
 add('resolve nested required title','A','required',{alias:'nestedTitle',headAlias:'nestedTitleHead',parent:'box',kind:title,ordinal:0});
 add('required selection','A','selectionStable',{name:'required-stable',range:{anchor:[1,0],focus:[1,0]}});
 add('A concurrent required typing','A','insertText',{alias:'aTitle',after:'title',text:'A😀',marks:{},change:'aType',caretBefore:'title',caretAfter:'title'});
 add('B concurrent same required typing','B','insertText',{alias:'bTitle',after:'title',text:'B',marks:{},change:'bType'});send('required A delivery','A','B','aType');send('required B delivery','B','A','bType');
 add('required nested typing','A','insertText',{alias:'nestedText',parent:'box',after:'nestedTitle',text:'nested',marks:{}});
 add('required grid cell typing','A','insertText',{alias:'reqCellText',grid:'grid',row:'reqRow',col:'reqCol',after:null,text:'cell😀',marks:{}});
 add('required group typing','A','insertText',{alias:'groupText',after:'group',text:'group😀',marks:{}});
 add('required root physical text','A','insertText',{alias:'rootText',after:null,text:'root',marks:{}});
 add('max zero hidden atom','A','insertBlock',{alias:'blocked',kind:blocked,after:ref('rootText',3),attrs:{}});
 add('required text nested attrs','A','set',{target:'title',key:meta,value:{label:'required',layout:{width:3}}});
 add('required flow nested attrs','A','set',{target:'box',key:meta,value:{label:'box'}});
 add('required atom attrs','A','set',{target:'rule',key:'level',value:4});
 add('resolve selection after typing','A','resolveSelection',{name:'required-stable'});
 add('authored title replaces fallback','A','insertBlock',{alias:'authTitle',kind:title,after:ref('rootText',3),right:'title',attrs:{[meta]:{label:'authored'}}});
 add('authored title text','A','insertText',{alias:'authText',after:'authTitle',text:'winner',marks:{}});
 add('extra title over maximum','A','insertBlock',{alias:'extraTitle',kind:title,after:ref('authText',5),right:'box',attrs:{}});
 add('authored placement probe','A','insertBlock',{alias:'moveProbe',kind:p,after:ref('authText',5),right:'box',attrs:{}});
 add('move authored block after required atom','A','move',{target:'moveProbe',parent:null,after:'rule',change:'afterRequired'});add('undo move after required atom','A','undo',{change:'undoAfterRequired'});add('redo move after required atom','A','redo',{change:'redoAfterRequired'});
 add('capture hidden candidates','A','capture');
 add('move authored title into required flow','A','move',{target:'authTitle',parent:'box',after:null,change:'moveTitle'});add('undo required context move','A','undo',{change:'undoMoveTitle'});add('redo required context move','A','redo',{change:'redoMoveTitle'});add('return title to root','A','move',{target:'authTitle',parent:null,after:ref('rootText',3)});
 add('delete winner promotes extra','A','delete',{targets:['authTitle'],change:'deleteWinner'});
 add('undo winner deletion','A','undo',{change:'undoWinner'});add('redo winner deletion','A','redo',{change:'redoWinner'});
 add('delete extra restores fallback','A','delete',{targets:['extraTitle'],change:'deleteExtra'});
 add('delete required text preserves slot','A','delete',{targets:['title'],change:'deleteRequired'});
 add('type required slot after deletion','A','insertText',{alias:'againTitle',after:'title',text:'again',marks:{}});
 add('delete required atom preserves slot','A','delete',{targets:['rule']});
 add('required flow delete preserves attrs','A','delete',{targets:['box']});
 add('required selection after deletes','A','resolveSelection',{name:'required-stable'});
 send('required synchronize A','A','B','pending');send('required synchronize B','B','A','pending');
 add('restore required coupled history','A','checkpoint');add('restore required peer history','B','checkpoint');
 add('pending replay twice','A','deliver',{from:'A',to:'B',change:'pending',repeat:2,self:true});
 add('reject required fixed-slot move','A','rejectRequiredMove',{target:'box',parent:null,after:null});
 add('reject required type change','A','rejectSet',{target:'title',key:'$type',value:p});
 add('reject required ordinal beyond minimum','A','rejectRequired',{kind:title,ordinal:1});add('reject nonexistent text node variant','A','rejectRequired',{kind:title,ordinal:0,variant:1});add('reject nonflow required parent reference','A','rejectRequired',{parent:'rootText',kind:title,ordinal:0});add('reject absent child rule reference','A','rejectRequired',{kind:p,ordinal:0});
 add('ack required pending','A','ack');add('restore acknowledged required','A','checkpoint');
 return{name,schema,commands};
}
export const documents=[structured('article-fields','Article'),structured('deck-fields','Deck'),required('article-required','Article'),required('deck-required','Deck')];
const base=()=>({domain:'document',root:'doc',marks:[],nodes:{doc:{shape:'flow',children:['p','box'],default:'p'},p:{shape:'text'},box:{shape:'flow',children:['p'],default:'p'}}});
const neg=(name,edit,path,reason,tsValid=false)=>{const schema=base();edit(schema);return{name,schema,expectedPath:path,expectedReason:reason,tsValid};};
const gridChain=s=>{s.nodes.doc.children.push('table');Object.assign(s.nodes,{table:{shape:'grid',children:['row']},row:{shape:'row',children:['cell']},cell:{shape:'cell',children:['body']},body:{shape:'flow',children:['p'],default:'p'}});};
export const unsupported=[
 neg('derived-group-fields',s=>{s.nodes.doc.children.push('items');s.nodes.items={shape:'group',children:['p'],by:[],attrs:{meta:fields()}}},'$.nodes.items.attrs','derived node attributes must come from stored values'),
 neg('derived-span-fields',s=>{s.markValues={paint:{default:null}};s.nodes.p.children=['styled'];s.nodes.styled={shape:'span',mark:'paint',attr:'value',attrs:{meta:fields()}}},'$.nodes.styled.attrs','derived node attributes must come from stored values'),
 neg('model-row-fields',s=>{gridChain(s);s.nodes.row.attrs={meta:fields()}},'$.nodes.row.attrs','attributes on model-only row/cell-body positions are unavailable'),
 neg('model-cell-body-fields',s=>{gridChain(s);s.nodes.body.attrs={meta:fields()}},'$.nodes.body.attrs','attributes on model-only row/cell-body positions are unavailable'),
 neg('root-fields',s=>s.nodes.doc.attrs={meta:fields()},'$.nodes.doc.attrs.meta.fields','fields are unavailable at this position'),
 neg('branch-default-mismatch',s=>s.nodes.p.attrs={meta:{default:{x:1},fields:{x:{default:0}}}},'$.nodes.p.attrs.meta.default','branch default must equal declared child defaults'),
 neg('branch-leaf-constraints',s=>s.nodes.p.attrs={meta:{...fields(),min:0}},'$.nodes.p.attrs.meta','branch constraints belong on leaf fields'),
 neg('unsafe-field-attribute',s=>s.nodes.p.attrs={'$meta':fields()},'$.nodes.p.attrs.$meta','safe field attribute name required'),
 neg('field-computed',s=>s.nodes.p.attrs={meta:{default:{x:null},fields:{x:{default:null,computed:true}}}},'$.nodes.p.attrs.meta.fields.x.computed','collaborative fields cannot be computed'),
 neg('value-mark-fields',s=>s.markValues={paint:fields()},'$.markValues.paint.fields','fields are unavailable at this position'),
 neg('required-min-over-max',s=>s.nodes.doc.childRules={p:{min:2,max:1}},'$.nodes.doc.childRules.p','min exceeds max'),
 neg('required-fractional-bound',s=>s.nodes.doc.childRules={p:{min:0.5}},'$.nodes.doc.childRules.p.min','bounds must be integers from 0 to 1000'),
 neg('required-missing-child',s=>{s.nodes.other={shape:'text'};s.nodes.doc.childRules={other:{min:1}}},'$.nodes.doc.childRules.other','rule target must be a declared child'),
 neg('required-cycle',s=>{s.nodes.box.children.push('box');s.nodes.box.childRules={box:{min:1}}},'$.nodes.box.childRules','required child cycle'),
 {...neg('object-default-value-mark',s=>s.markValues={paint:{default:{tone:'plain'}}},'$.markValues.paint.default','composite atomic defaults have reference identity semantics',true),expectedSupported:true},
 {...neg('array-default-value-mark',s=>s.markValues={paint:{default:[]}},'$.markValues.paint.default','composite atomic defaults have reference identity semantics',true),expectedSupported:true},
 {...neg('composite-enum-value-mark',s=>s.markValues={paint:{default:null,values:[{tone:'plain'}]}},'$.markValues.paint.values','composite atomic enum values have reference identity semantics',true),expectedSupported:true},
 neg('computed-ordinary-attribute',s=>s.nodes.p.attrs={rank:{default:0,computed:true}},'$.nodes.p.attrs.rank.computed','computed attributes are unavailable',true),
 neg('text-false',s=>s.nodes.p.text=false,'$.nodes.p.text','text=false is unavailable',true)
];
