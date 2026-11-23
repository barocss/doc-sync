// Semantic commands only. Each runtime authors its own operations.
const ref=(name,offset=0)=>({ref:name,offset});
function profile(name,n){
 const [root,text,outer,grid,row,cell,body,inner,atom,mark,rank,tone]=n;
 const bounded={default:0,min:0,max:5};const grid2=grid+'Nested',row2=row+'Nested',cell2=cell+'Nested',body2=body+'Nested',text2=text+'Nested';
 const schema={domain:'document',root,marks:[mark],nodes:{
  [root]:{shape:'flow',children:[text,outer,grid,grid2,atom],default:text},
  [text]:{shape:'text',attrs:{[rank]:bounded}},
  [outer]:{shape:'flow',children:[text,grid,inner,atom],default:text,attrs:{[rank]:bounded}},
  [inner]:{shape:'flow',children:[text,grid2,inner,atom],default:text},
  [grid2]:{shape:'grid',children:[row2]},[row2]:{shape:'row',children:[cell2]},[cell2]:{shape:'cell',children:[body2]},[body2]:{shape:'flow',children:[text2,grid2],default:text2},[text2]:{shape:'text'},
  [grid]:{shape:'grid',children:[row],attrs:{[rank]:bounded}},
  [row]:{shape:'row',children:[cell]},
  [cell]:{shape:'cell',children:[body],attrs:{[tone]:{default:'plain',values:['plain','warm','cool']},colspan:{default:1,computed:true},rowspan:{default:1,computed:true},spanned:{default:false,computed:true}}},
  [body]:{shape:'flow',children:[text,grid,inner,atom],default:text},[atom]:{shape:'atom'}
 }};
 const commands=[];let time=0;const add=(label,actor,op,rest={})=>commands.push({label,actor,op,...rest,time:++time});
 const send=(label,from,to,change)=>add(label,from,'deliver',{from,to,change});
 const cellAt=(r='r0',c='c0',g='grid')=>({grid:g,row:r,col:c});
 add('empty document','A','capture');
 add('root text','A','insertText',{alias:'rootText',parent:null,after:null,text:'root😀',marks:{}});
 add('outer flow','A','insertBlock',{alias:'outer',kind:outer,parent:null,after:ref('rootText',5),attrs:{}});
 add('outer text','A','insertText',{alias:'outerText',parent:'outer',after:null,text:'outer',marks:{}});
 add('renamed grid 2x2','A','insertGrid',{alias:'grid',kind:grid,parent:'outer',after:ref('outerText',4),rows:2,cols:2,rowAliases:['r0','r1'],colAliases:['c0','c1']});
 add('cell UTF16 text','A','insertCellText',{...cellAt(),alias:'cellText',after:null,text:'cell😀',marks:{}});
 add('hidden cell original text','A','insertCellText',{...cellAt('r0','c1'),alias:'hiddenText',after:null,text:'hidden',marks:{}});
 add('second row text','A','insertCellText',{...cellAt('r1','c0'),alias:'rowText',after:null,text:'row',marks:{}});
 add('nested cell flow','A','insertCellBlock',{...cellAt(),alias:'inner',kind:inner,after:ref('cellText',5),attrs:{}});
 add('nested flow text','A','insertText',{alias:'innerText',parent:'inner',after:null,text:'deep',marks:{}});
 add('nested grid 1x1','A','insertGrid',{alias:'deepGrid',kind:grid2,parent:'inner',after:ref('innerText',3),rows:1,cols:1,rowAliases:['dr0'],colAliases:['dc0']});
 add('deep grid UTF16 text','A','insertCellText',{...cellAt('dr0','dc0','deepGrid'),alias:'deepText',after:null,text:'x😀y',marks:{}});
 add('UTF16 deep range','A','selection',{range:{anchor:[1,1,0,0,0,1,1,0,0,0,0,1],focus:[1,1,0,0,0,1,1,0,0,0,0,3]}});
 add('restore nested grids','A','checkpoint');send('initial delivery','A','B','pending');
 add('A same cell insert','A','insertCellText',{...cellAt(),alias:'aText',change:'aInsert',after:ref('cellText',0),text:'A',marks:{}});
 add('B same cell insert','B','insertCellText',{...cellAt(),alias:'bText',change:'bInsert',after:ref('cellText',0),text:'B',marks:{}});
 send('same cell A delivery','A','B','aInsert');send('same cell B delivery','B','A','bInsert');
 add('A distinct cell insert','A','insertCellText',{...cellAt('r1','c0'),change:'aDistinct',after:ref('rowText',0),text:'a',marks:{}});
 add('B distinct cell insert','B','insertCellText',{...cellAt('r0','c1'),change:'bDistinct',after:ref('hiddenText',0),text:'b',marks:{}});
 send('distinct cell A delivery','A','B','aDistinct');send('distinct cell B delivery','B','A','bDistinct');
 add('A cell attribute','A','setCell',{...cellAt(),change:'aTone',key:tone,value:'warm'});send('cell attribute delivery','A','B','aTone');
 add('B same value attribute','B','setCell',{...cellAt(),change:'bTone',key:tone,value:'warm'});send('foreign cell attribute delivery','B','A','bTone');
 add('undo preserves foreign cell attribute','A','undo',{change:'undoTone'});send('cell fenced undo delivery','A','B','undoTone');
 add('redo preserves foreign cell attribute','A','redo',{change:'redoTone'});send('cell fenced redo delivery','A','B','redoTone');
 add('A text format','A','format',{change:'aFormat',targets:[ref('cellText',1)],key:mark,value:true});
 add('B same format','B','format',{change:'bFormat',targets:[ref('cellText',1)],key:mark,value:true});
 send('format A delivery','A','B','aFormat');send('format B delivery','B','A','bFormat');
 add('undo foreign format fence','A','undo',{change:'undoFormat'});send('format fenced undo delivery','A','B','undoFormat');
 add('merge first row cells','A','span',{...cellAt(),endRow:'r0',endCol:'c1',change:'merge'});send('merge delivery','A','B','merge');
 add('B edits hidden cell','B','insertCellText',{...cellAt('r0','c1'),change:'hiddenEdit',after:ref('hiddenText',5),text:'!',marks:{}});send('hidden edit delivery','B','A','hiddenEdit');
 add('split reveals foreign hidden text','A','span',{...cellAt(),endRow:null,endCol:null,change:'split'});send('split delivery','A','B','split');
 add('undo split','A','undo',{change:'undoSplit'});send('undo split delivery','A','B','undoSplit');add('redo split','A','redo',{change:'redoSplit'});send('redo split delivery','A','B','redoSplit');
 add('A concurrent row insertion','A','insertAxis',{grid:'grid',axis:'rows',kind:row,after:'r0',alias:'aRow',change:'aRow'});
 add('B concurrent row insertion','B','insertAxis',{grid:'grid',axis:'rows',kind:row,after:'r0',alias:'bRow',change:'bRow'});
 send('row A delivery','A','B','aRow');send('row B delivery','B','A','bRow');
 add('A column insertion','A','insertAxis',{grid:'grid',axis:'cols',kind:'col',after:'c0',alias:'aCol',change:'aCol'});
 add('B column insertion','B','insertAxis',{grid:'grid',axis:'cols',kind:'col',after:'c0',alias:'bCol',change:'bCol'});
 send('column A delivery','A','B','aCol');send('column B delivery','B','A','bCol');
 add('new axes cell text','A','insertCellText',{...cellAt('aRow','aCol'),alias:'axisText',change:'axisText',after:null,text:'new',marks:{}});send('new axes text delivery','A','B','axisText');
 add('A concurrent row delete','A','delete',{targets:['r1'],change:'aDelete'});add('B concurrent row delete','B','delete',{targets:['r1'],change:'bDelete'});
 send('delete A delivery','A','B','aDelete');send('delete B delivery','B','A','bDelete');
 add('undo own row delete preserves foreign deletion','A','undo',{change:'undoDelete'});send('row fenced undo delivery','A','B','undoDelete');
 add('restore deleted axes history','A','checkpoint');add('redo row delete after restart','A','redo',{change:'redoDelete'});send('redo row delete delivery','A','B','redoDelete');
 add('column deletion','A','delete',{targets:['aCol'],change:'deleteCol'});send('column delete delivery','A','B','deleteCol');add('undo column deletion','A','undo',{change:'undoCol'});send('column undo delivery','A','B','undoCol');
 add('grid bounded attribute','A','set',{target:'grid',key:rank,value:4,change:'gridAttr'});send('grid attribute delivery','A','B','gridAttr');
 add('move nested grid root','A','move',{target:'deepGrid',parent:null,after:'rootHead',change:'moveGrid'});send('grid move delivery','A','B','moveGrid');
 add('undo grid move','A','undo',{change:'undoGrid'});send('grid move undo delivery','A','B','undoGrid');add('redo grid move','A','redo',{change:'redoGrid'});send('grid move redo delivery','A','B','redoGrid');
 add('pending replay twice','A','deliver',{from:'A',to:'B',change:'pending',repeat:2,self:true});
 add('reject bounded grid attr','A','rejectSet',{target:'grid',key:rank,value:99});
 add('reject cell attr','A','rejectCell',{...cellAt(),key:tone,value:'invalid'});
 add('reject computed cell attr','A','rejectCell',{...cellAt(),key:'colspan',value:2});
 add('reject invalid span endpoint','A','rejectSpan',{...cellAt(),endRow:'dr0',endCol:'dc0'});
 add('reject unknown typed operation','A','rejectOp',{kind:'unknownType'});
 add('reject unknown acknowledgement','A','rejectAck');add('reject history checkpoint','A','rejectCheckpoint',{kind:'historyVersion'});add('reject pending checkpoint','A','rejectCheckpoint',{kind:'pending'});
 add('restore pending material state','A','checkpoint');add('ack exact pending','A','ack');add('restore acknowledged history','A','checkpoint');
 return{name,schema,commands};
}
export const documents=[profile('article-matrix',['article','body','section','matrix','band','entry','contents','aside','rule','emphasis','rank','tone']),profile('deck-board',['deck','caption','slide','board','track','tile','tileBody','note','separator','highlight','priority','shade'])];
// Each descriptor independently reaches its named unsupported or invalid rule.
const plain=()=>({domain:'document',root:'doc',marks:[],nodes:{doc:{shape:'flow',children:['p'],default:'p'},p:{shape:'text'}}});
const gridSchema=()=>({domain:'document',root:'doc',marks:[],nodes:{doc:{shape:'flow',children:['p','table'],default:'p'},p:{shape:'text'},table:{shape:'grid',children:['row']},row:{shape:'row',children:['cell']},cell:{shape:'cell',children:['body']},body:{shape:'flow',children:['p'],default:'p'}}});
const negative=(name,schema,path,reason,tsValid=true)=>({name,schema,expectedPath:path,expectedReason:reason,tsValid});
const group=plain();group.nodes.doc.children.push('items');group.nodes.items={shape:'group',children:['p'],by:[]};
const inline=plain();inline.nodes={badge:{shape:'inline'},...inline.nodes};inline.nodes.p.children=['badge'];
// A valid span requires markValues and attr. Isolate a missing mark field with every other prerequisite present.
const span=plain();span.markValues={color:{default:'red'}};span.nodes.p.children=['styled'];span.nodes.styled={shape:'span',mark:'color',attr:'value'};
const spanShape=plain();spanShape.markValues={color:{default:'red'}};spanShape.nodes.p.children=['styled'];spanShape.nodes={styled:{shape:'span',attr:'value'},...spanShape.nodes};
const values=plain();values.markValues={color:{default:'red'}};
const computed=plain();computed.nodes.p.attrs={rank:{default:0,computed:true}};
const cardinality=plain();cardinality.nodes.doc.childRules={p:{min:1,max:1}};
const unknownChain=gridSchema();unknownChain.nodes.table.children=['missingRow'];
const wrongChain=gridSchema();wrongChain.nodes.table.children=['p'];
const rowAttrs=gridSchema();rowAttrs.nodes.row.attrs={rank:{default:0}};
const bodyAttrs=gridSchema();bodyAttrs.nodes.body.attrs={rank:{default:0}};
const axis=plain();axis.nodes.doc.children.push('col');axis.nodes.col={shape:'atom'};
export const unsupported=[
 {name:'group',schema:group,expectedSupported:true,tsValid:true},
 {name:'inline',schema:inline,expectedSupported:true,tsValid:true},
 {name:'span-valid-value-mark-dependency',schema:span,expectedSupported:true,tsValid:true},
 negative('span-shape-isolation',spanShape,'$.nodes.styled.mark','string required',false),
 {name:'value-marks',schema:values,expectedSupported:true,tsValid:true},
 negative('arbitrary-computed-attribute',computed,'$.nodes.p.attrs.rank.computed','computed attributes are unavailable'),
 {name:'cardinality',schema:cardinality,expectedSupported:true,tsValid:true},
 negative('grid-unknown-chain-reference',unknownChain,'$.nodes.table.children','unknown, duplicate, or root child',false),
 negative('grid-wrong-chain-shape',wrongChain,'$.nodes.table.children','expected one child in grid > row > cell > flow chain',false),
 negative('model-only-row-attributes',rowAttrs,'$.nodes.row.attrs','attributes on model-only row/cell-body positions are unavailable'),
 negative('model-only-cell-body-attributes',bodyAttrs,'$.nodes.body.attrs','attributes on model-only row/cell-body positions are unavailable'),
 negative('reserved-axis-descriptor',axis,'$.nodes.col','invalid node name',false)
];
