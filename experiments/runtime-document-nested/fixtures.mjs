// Both runtimes receive these semantic actions. Neither receives operations or expected state.
const ref=(name,offset=0)=>({ref:name,offset});
function profile(name,n){
 const [root,line,heading,outer,inner,atom,rootAtom,mark,rank]=n;
 const schema={domain:'document',root,marks:[mark],nodes:{
  [root]:{shape:'flow',children:[line,heading,outer,atom,rootAtom],default:line},
  [line]:{shape:'text',attrs:{[rank]:{default:0,min:0,max:5}}},
  [heading]:{shape:'text',next:line,attrs:{[rank]:{default:1,min:0,max:5}}},
  [outer]:{shape:'flow',children:[line,heading,inner,atom],default:line,attrs:{[rank]:{default:0,min:0,max:5}}},
  [inner]:{shape:'flow',children:[line,heading,inner,atom],default:heading},
  [atom]:{shape:'atom'},[rootAtom]:{shape:'atom'}
 }};
 const commands=[];let time=0;const add=(label,actor,op,rest={})=>commands.push({label,actor,op,...rest,time:++time});
 add('empty parent defaults','A','capture');
 add('empty root selection','A','selection',{range:{anchor:[0,0],focus:[0,0]}});
 add('restore empty root','A','checkpoint');
 add('root UTF16 text','A','insertText',{alias:'rootText',parent:null,after:null,text:'abc😀',marks:{}});
 add('renamed outer flow','A','insertBlock',{alias:'outer',kind:outer,parent:null,after:ref('rootText',4),right:null,attrs:{}});
 add('outer empty default','A','capture');
 add('outer text','A','insertText',{alias:'outerText',parent:'outer',after:null,text:'inside',marks:{}});
 add('renamed second nested flow','A','insertBlock',{alias:'inner',kind:inner,parent:'outer',after:ref('outerText',5),right:null,attrs:{}});
 add('inner heading default','A','capture');
 add('empty nested selection','A','selection',{range:{anchor:[1,1,0,0],focus:[1,1,0,0]}});
 add('restore empty nested default','A','checkpoint');
 add('empty nested selection after restore','A','selection',{range:{anchor:[1,1,0,0],focus:[1,1,0,0]}});
 add('deep UTF16 text','A','insertText',{alias:'deepText',parent:'inner',after:null,text:'deep😀',marks:{}});
 add('explicit nested heading','A','insertBlock',{alias:'heading',kind:heading,parent:'inner',after:ref('deepText',5),right:null,attrs:{}});
 add('heading text','A','insertText',{alias:'headingText',parent:'inner',after:'heading',text:'TITLE',marks:{}});
 add('nested atom','A','insertBlock',{alias:'atom',kind:atom,parent:'inner',after:ref('headingText',4),right:null,attrs:{}});
 add('parent default after atom','A','capture');
 add('create sibling recursive flow','A','insertBlock',{alias:'peerInner',kind:inner,parent:'outer',after:ref('outerText',5),right:'inner',attrs:{}});
 add('initial delivery','A','deliver',{from:'A',to:'B',change:'pending'});
 add('concurrent A insert','A','insertText',{alias:'aText',change:'aInsert',parent:'inner',after:ref('deepText',0),text:'A',marks:{}});
 add('concurrent B insert','B','insertText',{alias:'bText',change:'bInsert',parent:'inner',after:ref('deepText',0),text:'B',marks:{}});
 add('deliver A insert','A','deliver',{from:'A',to:'B',change:'aInsert'});
 add('deliver B insert','B','deliver',{from:'B',to:'A',change:'bInsert'});
 add('A format','A','format',{change:'aFormat',targets:[ref('deepText',1)],key:mark,value:true});
 add('B same value format','B','format',{change:'bFormat',targets:[ref('deepText',1)],key:mark,value:true});
 add('format A delivery','A','deliver',{from:'A',to:'B',change:'aFormat'});
 add('format B delivery','B','deliver',{from:'B',to:'A',change:'bFormat'});
 add('format foreign ownership undo','A','undo',{change:'aUndoFormat'});
 add('format fenced undo delivery','A','deliver',{from:'A',to:'B',change:'aUndoFormat'});
 add('format redo fenced','A','redo',{change:'aRedoFormat'});
 add('format fenced redo delivery','A','deliver',{from:'A',to:'B',change:'aRedoFormat'});
 add('A concurrent delete','A','delete',{change:'aDelete',targets:[ref('deepText',2)]});
 add('B concurrent delete','B','delete',{change:'bDelete',targets:[ref('deepText',2)]});
 add('delete A delivery','A','deliver',{from:'A',to:'B',change:'aDelete'});
 add('delete B delivery','B','deliver',{from:'B',to:'A',change:'bDelete'});
 add('undo own delete preserves foreign delete','A','undo',{change:'aUndoDelete'});
 add('undo delete delivery','A','deliver',{from:'A',to:'B',change:'aUndoDelete'});
 add('restore A coupled pending history','A','checkpoint');
 add('restore B coupled pending history','B','checkpoint');
 add('redo delete after restore','A','redo',{change:'aRedoDelete'});
 add('redo delete delivery','A','deliver',{from:'A',to:'B',change:'aRedoDelete'});
 add('A nested attribute','A','set',{change:'aSet',target:'outer',key:rank,value:4});
 add('A attribute delivery','A','deliver',{from:'A',to:'B',change:'aSet'});
 add('foreign same value attribute','B','set',{change:'bSet',target:'outer',key:rank,value:4});
 add('foreign attribute delivery','B','deliver',{from:'B',to:'A',change:'bSet'});
 add('foreign attribute fenced undo','A','undo',{change:'aUndoSet'});
 add('fenced attribute delivery','A','deliver',{from:'A',to:'B',change:'aUndoSet'});
 add('A move heading out','A','move',{change:'aMove',target:'heading',parent:'outer',after:null});
 add('B concurrent move heading root','B','move',{change:'bMove',target:'heading',parent:null,after:null});
 add('move A delivery','A','deliver',{from:'A',to:'B',change:'aMove'});
 add('move B delivery','B','deliver',{from:'B',to:'A',change:'bMove'});
 add('foreign move fenced undo','A','undo',{change:'aUndoMove'});
 add('move undo delivery','A','deliver',{from:'A',to:'B',change:'aUndoMove'});
 add('undo winning B move','B','undo',{change:'bUndoMove'});
 add('B move undo delivery','B','deliver',{from:'B',to:'A',change:'bUndoMove'});
 add('restore ownership arenas','A','checkpoint');
 add('redo B move','B','redo',{change:'bRedoMove'});
 add('B move redo delivery','B','deliver',{from:'B',to:'A',change:'bRedoMove'});
 add('converge B pending before flow cycle','B','deliver',{from:'B',to:'A',change:'pending'});
 add('converge A pending before flow cycle','A','deliver',{from:'A',to:'B',change:'pending'});
 add('A moves inner under sibling','A','move',{change:'aFlowMove',target:'inner',parent:'peerInner',after:null});
 add('B creates concurrent physical cycle','B','move',{change:'bFlowMove',target:'peerInner',parent:'inner',after:null});
 add('flow move A delivery','A','deliver',{from:'A',to:'B',change:'aFlowMove'});
 add('flow move B delivery','B','deliver',{from:'B',to:'A',change:'bFlowMove'});
 add('restore concurrent flow cycle','A','checkpoint');
 add('undo own flow cycle edge','A','undo',{change:'aUndoFlow'});
 add('deliver flow undo','A','deliver',{from:'A',to:'B',change:'aUndoFlow'});
 add('redo own flow cycle edge','A','redo',{change:'aRedoFlow'});
 add('deliver flow redo','A','deliver',{from:'A',to:'B',change:'aRedoFlow'});
 add('move atom after moved heading','A','move',{change:'movedAnchor',target:'atom',parent:null,after:'heading'});
 add('deliver move after moved anchor','A','deliver',{from:'A',to:'B',change:'movedAnchor'});
 add('pending replay twice','A','deliver',{from:'A',to:'B',change:'pending',repeat:2,self:true});
 add('reject invalid bounded attribute','A','rejectSet',{target:'outer',key:rank,value:99});
 add('reject child outside parent allowlist','A','rejectChild',{parent:'outer',kind:rootAtom});
 add('reject text as container parent','A','rejectParent',{target:'atom',parent:'heading'});
 add('reject unknown typed operation','A','rejectOp',{kind:'unknownType'});
 add('reject unrecognized acknowledgement','A','rejectAck',{kind:'unknown'});
 add('reject corrupted history checkpoint','A','rejectCheckpoint',{kind:'historyVersion'});
 add('reject corrupted pending checkpoint','A','rejectCheckpoint',{kind:'pending'});
 add('ack exact pending','A','ack');
 add('restore acknowledged A','A','checkpoint');
 return {name,schema,commands};
}
export const documents=[profile('article-callout',['article','body','title','section','aside','rule','pageBreak','emphasis','rank']),profile('deck-card',['deck','caption','headline','slide','note','separator','slideBreak','highlight','priority'])];
export const unsupported=[
 {name:'Word-grid',rule:'grid',schema:{root:'doc',nodes:{doc:{shape:'flow',children:['p','table'],default:'p'},p:{shape:'text'},table:{shape:'grid',row:'row',cell:'cell'},row:{shape:'row',children:['cell']},cell:{shape:'flow',children:['p'],default:'p'}}}},
 {name:'Notion-cardinality',rule:'childRules',schema:{root:'doc',nodes:{doc:{shape:'flow',children:['p','title'],default:'p',childRules:{title:{min:1,max:1}}},p:{shape:'text'},title:{shape:'text'}}}},
 {name:'presentation-inline',rule:'inline',schema:{root:'doc',nodes:{doc:{shape:'flow',children:['p'],default:'p'},p:{shape:'text',inline:['badge']},badge:{shape:'inline'}}}},
 {name:'group',rule:'group',schema:{root:'doc',nodes:{doc:{shape:'flow',children:['p','items'],default:'p'},p:{shape:'text'},items:{shape:'group',children:['p'],by:[]}}}},
 {name:'span',rule:'span',schema:{root:'doc',nodes:{doc:{shape:'flow',children:['p'],default:'p'},p:{shape:'text'},styled:{shape:'span',mark:'color'}}}},
 {name:'value-marks',rule:'object marks',schema:{root:'doc',marks:{color:{default:'red'}},nodes:{doc:{shape:'flow',children:['p'],default:'p'},p:{shape:'text'}}}},
 {name:'computed-attrs',rule:'computed',schema:{root:'doc',nodes:{doc:{shape:'flow',children:['p'],default:'p'},p:{shape:'text',attrs:{rank:{default:0,computed:true}}}}}}
];
