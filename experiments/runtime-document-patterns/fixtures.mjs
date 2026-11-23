// Semantic commands only. Neither runtime receives the other runtime's operations.
export const LINK='^(https?://\\S+)?$';
export const HEX='^(#[0-9a-fA-F]{6})?$';
const ref=(name,offset=0)=>({ref:name,offset});
export function schema(suffix='') {
 const n=x=>x+suffix; const [root,p,atom,inline,span,tint,grid,row,cell,body]=['root','p','atom','inline','linkSpan','hexSpan','grid','row','cell','body'].map(n);
 const spec=pattern=>({default:'',pattern});
 const attrs=()=>({url:spec(LINK),color:spec(HEX),meta:{default:{url:'',color:''},fields:{url:spec(LINK),color:spec(HEX)}}});
 return {domain:'document',root,marks:['bold'],markValues:{link:spec(LINK),hex:spec(HEX)},nodes:{[root]:{shape:'flow',children:[p,atom,grid],default:p},[p]:{shape:'text',children:[inline,span,tint],attrs:attrs()},[atom]:{shape:'atom',attrs:attrs()},[inline]:{shape:'inline',attrs:attrs()},[span]:{shape:'span',mark:'link',attr:'url'},[tint]:{shape:'span',mark:'hex',attr:'color'},[grid]:{shape:'grid',children:[row]},[row]:{shape:'row',children:[cell]},[cell]:{shape:'cell',children:[body],attrs:{url:spec(LINK),color:spec(HEX)}},[body]:{shape:'flow',children:[p,atom],default:p}}};
}
function document(name,suffix) {
 const s=schema(suffix),n=x=>x+suffix,commands=[];let time=0;
 const add=(label,actor,op,rest={})=>commands.push({label,actor,op,...rest,time:++time});
 const send=(label,from,to,change)=>add(label,from,'deliver',{from,to,change});
 add('empty optional defaults','A','capture');
 add('link span with astral and non-whitespace NEL','A','insertText',{alias:'text',after:null,text:'ab😀cd',marks:{link:'https://例.test/😀\u0085'}});
 add('paragraph optional scalar attrs','A','insertBlock',{alias:'para',kind:n('p'),after:ref('text',5),attrs:{url:'http://host',color:'#aB09fF'}});
 add('paragraph body','A','insertText',{alias:'body',after:'para',text:'wxyz',marks:{hex:'#123ABC'}});
 add('atomic optional scalar attrs','A','insertBlock',{alias:'atom',kind:n('atom'),after:ref('body',3),attrs:{url:'https://a/\u180e',color:'#ffffff'}});
 add('inline optional scalar attrs','A','insertInline',{alias:'inline',after:ref('body',1),kind:n('inline'),attrs:{url:'https://a/\u200b',color:'#000000'}});
 add('structured link field','A','setField',{target:'para',key:'meta',path:['url'],value:'https://a/\u200d'});
 add('structured color field','A','setField',{target:'para',key:'meta',path:['color'],value:'#AbCdEf'});
 add('create patterned cell','A','insertGrid',{alias:'grid',kind:n('grid'),after:'atom',rows:1,cols:1,rowAliases:['row'],colAliases:['col']});
 add('set cell link','A','setCell',{grid:'grid',row:'row',col:'col',key:'url',value:'https://cell.test'});
 add('set cell color','A','setCell',{grid:'grid',row:'row',col:'col',key:'color',value:'#09afDE'});
 add('insert patterned cell text','A','insertCellText',{alias:'cellText',grid:'grid',row:'row',col:'col',after:null,text:'QR',marks:{link:'https://cell.test/x',hex:'#ABCDEF'}});
 send('initial patterns delivery','A','B','pending');
 add('A concurrent link format','A','formatSpan',{targets:[ref('body',0),ref('body',1)],kind:n('linkSpan'),value:'https://actor-a.test',change:'formatA',caretBefore:'body',caretAfter:ref('body',1)});
 add('B concurrent text preserves peer','B','insertText',{alias:'peer',after:'body',text:'B😀',marks:{link:'http://peer.test',hex:'#aabbcc'},change:'textB'});
 send('A format to B','A','B','formatA');send('B text to A','B','A','textB');
 add('undo format preserves peer text','A','undo',{change:'undoA'});send('undo delivery','A','B','undoA');
 add('checkpoint pending and redo','A','checkpoint');
 add('redo format after checkpoint','A','redo',{change:'redoA'});send('redo delivery','A','B','redoA');
 add('A set writer fence','A','set',{target:'atom',key:'url',value:'https://same.test',change:'fenceA'});send('A writer fence delivery','A','B','fenceA');
 add('B same value writer fence','B','set',{target:'atom',key:'url',value:'https://same.test',change:'fenceB'});send('B writer fence delivery','B','A','fenceB');
 add('undo respects foreign writer','A','undo',{change:'undoFence'});send('foreign writer undo delivery','A','B','undoFence');
 add('empty link reset','A','format',{targets:[ref('text',0)],key:'link',value:''});
 add('null color reset','A','set',{target:'atom',key:'color',value:null});
 add('empty cell color reset','A','setCell',{grid:'grid',row:'row',col:'col',key:'color',value:''});
 add('reject malformed atomic link','A','rejectSet',{target:'atom',key:'url',value:'https://a b'});
 add('reject atomic color short','A','rejectSet',{target:'atom',key:'color',value:'#abc'});
 add('reject mark BOM','A','rejectSet',{target:'text',key:'link',value:'https://a/\ufeff'});
 add('reject mark color eight','A','rejectSet',{target:'text',key:'hex',value:'#11223344'});
 add('reject link field linefeed','A','rejectField',{target:'para',key:'meta',path:['url'],value:'https://a\n'});
 add('reject color field wrong type','A','rejectField',{target:'para',key:'meta',path:['color'],value:42});
 add('reject patterned cell link','A','rejectCell',{grid:'grid',row:'row',col:'col',key:'url',value:'mailto:a@b'});
 add('reject patterned cell color','A','rejectCell',{grid:'grid',row:'row',col:'col',key:'color',value:'#GG0000'});
 add('checkpoint B','B','checkpoint');
 add('pending replay twice','A','deliver',{from:'A',to:'B',change:'pending',repeat:2,self:true});
 add('final patterns convergence','A','capture');
 return {name,schema:s,commands};
}
export const documents=[document('article-patterns','Article'),document('deck-patterns','Deck')];
export const unsupported=[];
