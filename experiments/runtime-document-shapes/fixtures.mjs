// Commands carry intent and aliases. No pre-authored operation stream is shared.
const ref=(name,offset=0)=>({ref:name,offset});
function profile(name,suffix){
 const n=x=>x+suffix;const [root,p,flow,grid,row,cell,body,item,task,group,queue,badge,token,link,tint]=['root','paragraph','section','matrix','band','entry','contents','item','task','collection','queue','badge','token','link','tint'].map(n);
 const shared=n('sharedCollection'),alt=n('alternativeSection');
 const color=n('color'),url=n('url'),bold=n('bold'),style=n('style'),series=n('series');
 const attrs={[style]:{default:'plain',values:['plain','warm','cool']},[series]:{default:'a',values:['a','b']},level:{default:0,min:0,max:5}};
 const schema={domain:'document',root,marks:[bold],markValues:{[url]:{default:null,inherit:false},[color]:{default:'none',values:['none','red','blue'],inherit:true}},nodes:{
 [root]:{shape:'flow',children:[p,flow,alt,grid,group,queue],default:p},
 [alt]:{shape:'flow',children:[shared,group,queue],default:item},[shared]:{shape:'group',children:[item],by:[style]},
 [p]:{shape:'text',children:[badge,token,link,tint]},
 [flow]:{shape:'flow',children:[p,flow,alt,grid,group,queue],default:p},
 [grid]:{shape:'grid',children:[row]},[row]:{shape:'row',children:[cell]},[cell]:{shape:'cell',children:[body]},[body]:{shape:'flow',children:[p,flow,group,queue],default:p},
 [group]:{shape:'group',children:[item],by:[series,style]},[queue]:{shape:'group',children:[task],by:[style]},
 [item]:{shape:'text',attrs,children:[badge,token,link,tint]},[task]:{shape:'text',attrs,children:[badge,token,link,tint]},
 [badge]:{shape:'inline',attrs:{label:{default:'x'},weight:{default:0,min:0,max:9}}},[token]:{shape:'inline',attrs:{code:{default:'?'}}},
 [link]:{shape:'span',mark:url,attr:'href'},[tint]:{shape:'span',mark:color,attr:'shade'}
 }};
 // Second profile reverses span declaration precedence while retaining both marks.
 if(suffix==='Deck'){const spec=schema.nodes[link];delete schema.nodes[link];schema.nodes[link]=spec;}
 const commands=[];let time=0;const add=(label,actor,op,rest={})=>commands.push({label,actor,op,...rest,time:++time});const send=(label,from,to,change)=>add(label,from,'deliver',{from,to,change});
 const member=(label,alias,kind,g,after,parent=null,extra={})=>add(label,'A','insertGroupMember',{alias,kind,group:g,parent,after,attrs:{[series]:'a',[style]:'warm',level:0},...extra});
 add('empty document','A','capture');
 add('root UTF16 text','A','insertText',{alias:'rootText',parent:null,after:null,text:'a😀bcdef',marks:{[bold]:true,[url]:'https://one',[color]:'red'}});
 add('inline after emoji','A','insertInline',{alias:'badge1',parent:null,after:ref('rootText',2),kind:badge,attrs:{label:'first',weight:3}});
 add('second inline before emoji','A','insertInline',{alias:'token1',parent:null,after:ref('rootText',0),kind:token,attrs:{code:'T'}});
 add('UTF16 text after inline','A','insertText',{alias:'afterInline',parent:null,after:'badge1',text:'Z😀',marks:{}});
 add('inline attr edit','A','set',{target:'badge1',key:'weight',value:5});
 add('span split','A','formatSpan',{targets:[ref('rootText',3),ref('rootText',4)],kind:link,value:'https://two'});
 add('span join','A','formatSpan',{targets:[ref('rootText',3),ref('rootText',4)],kind:link,value:'https://one'});
 add('span remove default','A','formatSpan',{targets:[ref('rootText',5)],kind:tint,value:'none'});
 add('span remove null','A','formatSpan',{targets:[ref('rootText',6)],kind:link,value:null});
 add('value marks inheritance','A','insertText',{alias:'inherited',parent:null,after:ref('rootText',0),text:'I',inherit:true});
 add('scalar zero value','A','formatSpan',{targets:[ref('rootText',3)],kind:link,value:0});
 add('scalar false value','A','formatSpan',{targets:[ref('rootText',4)],kind:link,value:false});
 add('scalar empty value','A','formatSpan',{targets:[ref('rootText',5)],kind:link,value:''});
 add('nested flow','A','insertBlock',{alias:'flow',parent:null,after:ref('rootText',7),kind:flow,attrs:{}});
 add('nested text','A','insertText',{alias:'nestedText',parent:'flow',after:null,text:'nest',marks:{}});
 member('first grouped member','g1',item,group,ref('nestedText',3),'flow');
 add('first grouped text','A','insertText',{alias:'groupText',parent:'flow',after:'g1',text:'one😀',marks:{[color]:'blue'}});
 member('adjacent same group','g2',item,group,ref('groupText',4),'flow');
 add('second grouped text','A','insertText',{alias:'groupText2',parent:'flow',after:'g2',text:'two',marks:{}});
 member('arbitrary attrs split group','g3',item,group,ref('groupText2',2),'flow',{attrs:{[series]:'b',[style]:'warm',level:2}});
 member('different group type','task1',task,queue,'g3','flow',{attrs:{[series]:'a',[style]:'cool',level:1}});
 add('group attr joins adjacent groups','A','set',{target:'g3',key:series,value:'a'});
 add('derived group attribute','A','setGroup',{target:'g1',group,targets:['g1','g2','g3'],key:style,value:'cool'});
 add('group text inline','A','insertInline',{alias:'groupBadge',parent:'flow',after:ref('groupText',2),kind:token,attrs:{code:'in-group'}});
 add('nested grid','A','insertGrid',{alias:'grid',kind:grid,parent:'flow',after:'task1',rows:1,cols:1,rowAliases:['r0'],colAliases:['c0']});
 add('cell intro physical anchor','A','insertText',{alias:'cellIntro',grid:'grid',row:'r0',col:'c0',after:null,text:'before',marks:{}});
 member('cell grouped member','cellGroup',item,group,ref('cellIntro',5),null,{grid:'grid',row:'r0',col:'c0'});
 add('cell grouped text','A','insertText',{alias:'cellText',grid:'grid',row:'r0',col:'c0',after:'cellGroup',text:'cell😀',marks:{[url]:'https://cell'}});
 add('cell inline','A','insertInline',{alias:'cellInline',grid:'grid',row:'r0',col:'c0',after:ref('cellText',3),kind:badge,attrs:{label:'cell',weight:2}});
 add('cell second span','A','formatSpan',{targets:[ref('cellText',0),ref('cellText',1)],kind:tint,value:'blue'});
 add('first-match alternate flow','A','insertBlock',{alias:'altFlow',parent:null,after:'flow',kind:alt,attrs:{}});
 add('group default text','A','insertText',{alias:'altText',parent:'altFlow',after:null,text:'alternate😀',marks:{[url]:'https://alt',[color]:'blue'}});
 add('retype stored group member','A','set',{target:'g3',key:'$type',value:task});
 add('update effective group after retype','A','setGroup',{target:'g3',targets:['g3','task1'],group:queue,key:style,value:'warm'});
 add('UTF16 selection','A','selection',{range:{anchor:[0,2],focus:[0,5]}});
 add('capture inline stable selection','A','selectionStable',{name:'inline-stable',range:{anchor:[0,3],focus:[0,5]}});
 add('restore shapes state','A','checkpoint');send('initial delivery','A','B','pending');
 add('A same inline insertion','A','insertInline',{alias:'aInline',after:ref('rootText',0),kind:badge,attrs:{label:'A'},change:'aInsert'});
 add('B same inline insertion','B','insertInline',{alias:'bInline',after:ref('rootText',0),kind:token,attrs:{code:'B'},change:'bInsert'});
 send('inline A delivery','A','B','aInsert');send('inline B delivery','B','A','bInsert');add('resolve selection after concurrent inserts','A','resolveSelection',{name:'inline-stable'});
 add('A inline attr','A','set',{target:'badge1',key:'label',value:'foreign',change:'aAttr',caretBefore:ref('rootText',0),caretAfter:ref('afterInline',2)});send('attr A delivery','A','B','aAttr');
 add('B same inline attr','B','set',{target:'badge1',key:'label',value:'foreign',change:'bAttr'});send('attr B delivery','B','A','bAttr');
 add('undo foreign attr fence','A','undo',{change:'undoAttr'});send('attr undo delivery','A','B','undoAttr');add('redo foreign attr fence','A','redo',{change:'redoAttr'});send('attr redo delivery','A','B','redoAttr');
 add('A concurrent group attr','A','set',{target:'g2',key:series,value:'b',change:'aGroupAttr'});
 add('B concurrent group attr','B','set',{target:'g2',key:series,value:'b',change:'bGroupAttr'});
 send('group attr A delivery','A','B','aGroupAttr');send('group attr B delivery','B','A','bGroupAttr');
 add('undo foreign group attr fence','A','undo',{change:'undoGroupAttr'});send('group attr undo delivery','A','B','undoGroupAttr');
 add('redo foreign group attr fence','A','redo',{change:'redoGroupAttr'});send('group attr redo delivery','A','B','redoGroupAttr');
 add('local scalar with caret','A','formatSpan',{targets:[ref('rootText',0)],kind:tint,value:'blue',change:'localScalar',caretBefore:ref('rootText',0),caretAfter:ref('afterInline',2)});send('local scalar delivery','A','B','localScalar');
 add('local scalar undo','A','undo',{change:'localScalarUndo'});send('local scalar undo delivery','A','B','localScalarUndo');add('restore redo caret history','A','checkpoint');
 add('local scalar redo','A','redo',{change:'localScalarRedo'});send('local scalar redo delivery','A','B','localScalarRedo');
 add('A scalar format','A','formatSpan',{targets:[ref('groupText',0)],kind:link,value:'https://foreign',change:'aFormat',caretBefore:ref('groupText',0),caretAfter:ref('groupText',1)});
 add('B scalar format','B','formatSpan',{targets:[ref('groupText',0)],kind:link,value:'https://foreign',change:'bFormat'});
 send('format A delivery','A','B','aFormat');send('format B delivery','B','A','bFormat');add('undo foreign scalar fence','A','undo',{change:'undoFormat'});send('format undo delivery','A','B','undoFormat');add('redo foreign scalar fence','A','redo',{change:'redoFormat'});send('format redo delivery','A','B','redoFormat');
 add('A inline delete','A','delete',{targets:['token1'],change:'aDelete'});add('B inline delete','B','delete',{targets:['token1'],change:'bDelete'});
 send('delete A delivery','A','B','aDelete');send('delete B delivery','B','A','bDelete');add('resolve selection after inline deletion','A','resolveSelection',{name:'inline-stable'});add('undo foreign inline deletion','A','undo',{change:'undoDelete'});send('delete undo delivery','A','B','undoDelete');
 add('restart with redo and pending','A','checkpoint');add('redo inline deletion','A','redo',{change:'redoDelete'});send('delete redo delivery','A','B','redoDelete');
 add('pending duplicate delivery','A','deliver',{from:'A',to:'B',change:'pending',repeat:2,self:true});
 add('reject scalar value','A','rejectSet',{target:ref('rootText',0),key:color,value:'purple'});
 add('reject inline attr','A','rejectSet',{target:'badge1',key:'weight',value:100});
 add('reject unknown acknowledgement','A','rejectAck');add('reject history checkpoint','A','rejectCheckpoint',{kind:'historyVersion'});add('reject pending checkpoint','A','rejectCheckpoint',{kind:'pending'});
 add('restore pending history','A','checkpoint');add('ack exact pending','A','ack');add('restore acknowledged history','A','checkpoint');
 return{name,schema,commands};
}
export const documents=[profile('article-shapes','Article'),profile('deck-shapes','Deck')];
const plain=()=>({domain:'document',root:'doc',marks:[],nodes:{doc:{shape:'flow',children:['p'],default:'p'},p:{shape:'text'}}});
const neg=(name,edit,path,reason,tsValid=true)=>{const schema=plain();edit(schema);return{name,schema,expectedPath:path,expectedReason:reason,tsValid}};
const withGroup=s=>{s.nodes.doc.children.push('items');s.nodes.items={shape:'group',children:['p'],by:[]};};
const withSpan=s=>{s.markValues={color:{default:''}};s.nodes.p.children=['styled'];s.nodes.styled={shape:'span',mark:'color',attr:'value'};};
export const unsupported=[
 neg('group-missing-child-attr',s=>{withGroup(s);s.nodes.items.by=['category'];},'$.nodes.items.by','group attribute must exist on each child',false),
 neg('group-duplicate-by',s=>{withGroup(s);s.nodes.p.attrs={category:{default:'x'}};s.nodes.items.by=['category','category'];},'$.nodes.items.by','unique safe attribute names required',true),
 neg('group-nontext-child',s=>{withGroup(s);s.nodes.rule={shape:'atom'};s.nodes.doc.children.push('rule');s.nodes.items.children=['rule'];},'$.nodes.items.children','nonempty text children required',false),
 neg('derived-group-stored-attrs',s=>{withGroup(s);s.nodes.items.attrs={category:{default:'x'}};},'$.nodes.items.attrs','derived node attributes must come from stored values',true),
 neg('span-undeclared-mark',s=>{withSpan(s);s.nodes.styled.mark='missing';},'$.nodes.styled.mark','declared value mark required',false),
 neg('span-invalid-attr',s=>{withSpan(s);s.nodes.styled.attr='';},'$.nodes.styled.attr','safe attribute name required',true),
 {...neg('value-mark-nonscalar-default',s=>{s.markValues={color:{default:[]}};},'$.markValues.color.default','composite atomic defaults have reference identity semantics',true),expectedSupported:true},
 neg('value-mark-structured-fields',s=>{s.markValues={color:{default:{tone:'x'},fields:{tone:{default:'x'}}}};},'$.markValues.color.fields','fields are unavailable at this position',false),
 neg('text-false',s=>{s.nodes.p.text=false;},'$.nodes.p.text','text=false is unavailable',true),
 neg('arbitrary-computed-attribute',s=>{s.nodes.p.attrs={rank:{default:0,computed:true}};},'$.nodes.p.attrs.rank.computed','computed attributes are unavailable',true),
 {...neg('cardinality',s=>{s.nodes.doc.childRules={p:{min:1,max:1}};},undefined,undefined,true),expectedSupported:true},
 neg('reserved-axis-descriptor',s=>{s.nodes.doc.children.push('col');s.nodes.col={shape:'atom'};},'$.nodes.col','invalid node name',false)
];
