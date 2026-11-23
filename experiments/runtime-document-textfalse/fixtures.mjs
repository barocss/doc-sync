// Semantic intents only. Both runtimes author operations independently.
const ref=(name,offset=0)=>({ref:name,offset});
export function schema(suffix=''){
 const n=x=>x+suffix;
 const [root,p,media,badge,other,box,closed,group,item,grid,row,cell,body]=['root','paragraph','media','badge','other','collection','closed','gallery','mediaItem','grid','row','cell','body'].map(n);
 return {domain:'document',root,marks:['bold'],nodes:{
 [root]:{shape:'flow',children:[p,media,closed,group,grid],default:p},
 [p]:{shape:'text',next:media,children:[badge,other]},[media]:{shape:'text',text:false,next:p,children:[badge]},
 [badge]:{shape:'inline',attrs:{label:{default:'x'}}},[other]:{shape:'inline'},
 [closed]:{shape:'flow',children:[media],default:media},
 [group]:{shape:'group',children:[item],by:[]},[item]:{shape:'text',text:false,children:[badge]},
 [grid]:{shape:'grid',children:[row]},[row]:{shape:'row',children:[cell]},[cell]:{shape:'cell',children:[body]},[body]:{shape:'flow',children:[media],default:media}
 }};
}
function profile(name,suffix){
 const s=schema(suffix),n=x=>x+suffix,commands=[];let time=0;
 const add=(label,actor,op,rest={})=>commands.push({label,actor,op,...rest,time:++time});const send=(label,from,to,change)=>add(label,from,'deliver',{from,to,change});
 add('empty default normal text','A','capture');
 add('normal UTF16 text','A','insertText',{alias:'text',after:null,text:'ab😀cd'});
 add('explicit media marker','A','insertBlock',{alias:'media',kind:n('media'),after:ref('text',5)});
 add('media owns allowed inline','A','insertInline',{alias:'badge',after:'media',kind:n('badge'),attrs:{label:'media'}});
 add('mixed flow false marker admits chars','A','insertText',{alias:'mediaText',after:'badge',text:'M😀',marks:{bold:true}});
 add('mixed flow unions inline permissions','A','insertInline',{alias:'other',after:ref('mediaText',2),kind:n('other')});
 add('normal type to false retains chars','A','set',{target:'rootHead',key:'$type',value:n('media')});
 add('false current type still admits chars','A','insertText',{alias:'stillText',after:ref('text',5),text:'R'});
 add('normal type restored','A','set',{target:'rootHead',key:'$type',value:n('paragraph')});
 add('false marker becomes normal','A','set',{target:'media',key:'$type',value:n('paragraph')});
 add('normal marker becomes false again','A','set',{target:'media',key:'$type',value:n('media')});
 add('group false item in mixed flow','A','insertGroupMember',{alias:'item',after:'other',kind:n('mediaItem'),group:n('gallery')});
 add('mixed flow group false admits chars','A','insertText',{alias:'groupText',after:'item',text:'G'});
 add('all false nested flow','A','insertBlock',{alias:'closed',after:'groupText',kind:n('closed')});
 add('all false default owns inline','A','insertInline',{alias:'closedBadge',parent:'closed',after:null,kind:n('badge')});
 add('all false rejects text atomically','A','rejectRawText',{after:'closedBadge',text:'bad'});
 add('mixed raw batch rejects atomically','A','rejectMixedBatch',{target:'media',value:n('paragraph'),after:'closedBadge',text:'bad'});
 add('create false cell default','A','insertGrid',{alias:'grid',after:'closed',kind:n('grid'),rows:1,cols:1,rowAliases:['row'],colAliases:['col']});
 add('false cell owns inline','A','insertInline',{alias:'cellBadge',grid:'grid',row:'row',col:'col',after:null,kind:n('badge')});
 add('false cell rejects chars','A','rejectRawText',{after:'cellBadge',text:'bad'});
 add('capture stable selection','A','selectionStable',{name:'sel',range:{anchor:[0,1],focus:[0,4]}});
 send('initial delivery','A','B','pending');
 add('A local false type writer','A','set',{target:'media',key:'$type',value:n('paragraph'),change:'typeA',caretBefore:'text',caretAfter:ref('text',1)});
 add('B concurrent retained chars','B','insertText',{alias:'peer',after:'mediaText',text:'B😀',change:'peerB'});
 send('A type delivery','A','B','typeA');send('B chars delivery','B','A','peerB');
 add('undo type keeps peer chars','A','undo',{change:'undoA'});send('undo delivery','A','B','undoA');
 add('JSON checkpoint pending caret redo','A','checkpoint');
 add('redo after own JSON checkpoint','A','redo',{change:'redoA'});send('redo delivery','A','B','redoA');
 add('B changed foreign type writer','B','set',{target:'media',key:'$type',value:n('media'),change:'typeB'});send('foreign writer delivery','B','A','typeB');
 add('undo respects foreign type writer','A','undo',{change:'fenced'});send('foreign undo delivery','A','B','fenced');
 add('A raw same value writer','A','rawSet',{target:'media',key:'$type',value:n('media'),change:'rawA',caretBefore:'text',caretAfter:ref('text',1)});send('raw A delivery','A','B','rawA');
 add('B raw same value foreign writer','B','rawSet',{target:'media',key:'$type',value:n('media'),change:'rawB'});send('raw B delivery','B','A','rawB');
 add('undo respects raw same value writer','A','undo',{change:'rawUndo'});send('raw undo delivery','A','B','rawUndo');
 add('peer JSON checkpoint','B','checkpoint');
 add('selection after foreign changes','A','resolveSelection',{name:'sel'});
 add('retry pending twice own and peer','A','deliver',{from:'A',to:'B',change:'pending',repeat:2,self:true});
 add('final convergence','A','capture');
 return {name,schema:s,commands};
}
export const documents=[profile('article-textfalse','Article'),profile('deck-textfalse','Deck')];
export const unsupported=[];
