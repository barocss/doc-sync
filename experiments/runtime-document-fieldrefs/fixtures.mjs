// This corpus extends existing fixtures without changing them.
import {documents as inherited} from '../runtime-document-payload/fixtures.mjs';
import {source} from '../runtime-document-payload/fixtures.mjs';
const slot=(at,kind='default',index=0,valuePath=[])=>({at,source:kind,...(kind==='enum'?{index}:{}),...(valuePath.length?{valuePath}:{})});
function extend(original,index){
 const f=structuredClone(original),m=f.schema.manifest,tag=index?'Deck':'Article',atom=Object.keys(m.nodes).find(k=>m.nodes[k].shape==='atom'),flow=Object.keys(m.nodes).find(k=>m.nodes[k].shape==='flow'&&k!==m.root),inline=Object.keys(m.nodes).find(k=>m.nodes[k].shape==='inline'),text=Object.keys(m.nodes).find(k=>m.nodes[k].shape==='text');
 const key='fieldRefs'+tag,target='fieldObject'+tag,arrTarget='fieldArray'+tag,paint='fieldPaint'+tag;
 const child={b:2,a:1},other={z:9},array=[{b:2,a:1},['x']],deep={child:structuredClone(child),array:structuredClone(array)};
 const leaf=()=>({default:structuredClone(child),values:[structuredClone(child),structuredClone(other)]});
 const nested=()=>({default:{palette:structuredClone(child),list:structuredClone(array),source:structuredClone(deep),note:'plain'},fields:{palette:leaf(),list:{default:structuredClone(array),values:[structuredClone(array),['other']]},source:{default:structuredClone(deep),values:[structuredClone(deep)]},note:{default:'plain'}}});
 const branch=()=>{const nest=nested();return{default:{group:structuredClone(nest.default),count:0},fields:{group:nest,count:{default:0,min:0,max:10}}};};
 for(const kind of [atom,flow,inline,text]){m.nodes[kind].attrs[key]=branch();m.nodes[kind].attrs[target]={default:null,values:[structuredClone(child),structuredClone(other)]};m.nodes[kind].attrs[arrTarget]={default:null,values:[structuredClone(array),['other']]};}
 m.markValues[paint]={default:null,values:[structuredClone(child),structuredClone(other)],inherit:false};
 const field=['nodes',atom,'attrs',key,'fields','group','fields'],palette=[...field,'palette'],list=[...field,'list'],deepAt=[...field,'source'];
 // Leaf representative order differs from its branch default clone; structural schema equality still holds.
 m.nodes[atom].attrs[key].fields.group.fields.palette.default={a:1,b:2};
 const childSlots=[slot(palette),slot(palette,'enum',0),slot(deepAt,'default',0,['child']),slot(deepAt,'enum',0,['child']),slot(['markValues',paint],'enum',0),...[atom,flow,inline,text].map(k=>slot(['nodes',k,'attrs',target],'enum',0))];
 const arraySlots=[slot(list),slot(list,'enum',0),slot(deepAt,'default',0,['array']),slot(deepAt,'enum',0,['array']),...[atom,flow,inline,text].map(k=>slot(['nodes',k,'attrs',arrTarget],'enum',0))];
 f.schema.referenceGroups.push({representative:slot(palette),slots:childSlots},{representative:slot(list),slots:arraySlots});
 const add=(label,op,rest={},actor='A')=>({label:'fieldrefs '+label,actor,op,...rest}),c=source;
 const commands=[
 add('leaf default source to atomic attribute','set',{target:'atom',key:target,value:c(palette)}),
 add('leaf enum source to mark','format',{targets:['payloadText'],key:paint,value:c(palette,'enum',0)}),
 add('leaf payload descendant to atomic attribute','set',{target:'flow',key:target,value:c(deepAt,'enum',0,['child'])}),
 add('leaf array default to inline atomic','set',{target:'inline',key:arrTarget,value:c(list)}),
 add('leaf default to independent field target','setField',{target:'flow',key,path:['group','palette'],value:c(palette)}),
 add('equal distinct enum field admissible','setField',{target:'inline',key,path:['group','palette'],value:{a:1,b:2}}),
 add('leaf payload descendant to field target','setField',{target:'flow',key,path:['group','list'],value:c(deepAt,'default',0,['array'])}),
 add('reject field enum unknown member','rejectField',{target:'flow',key,path:['group','palette'],value:{unknown:1}}),
 add('reject field unknown path','rejectField',{target:'flow',key,path:['missing'],value:null}),
 add('reject field branch as leaf','rejectField',{target:'flow',key,path:['group'],value:{palette:other}}),
 add('reject field bounds','rejectField',{target:'flow',key,path:['count'],value:11}),
 add('synchronize B','deliver',{from:'A',to:'B',change:'pending'}),
 add('A leaf writer','setField',{target:'flow',key,path:['group','palette'],value:other,change:'fieldA',caretBefore:'payloadText',caretAfter:{ref:'payloadText',offset:2}}),
 add('B independent note writer','setField',{target:'flow',key,path:['group','note'],value:'peer survives',change:'fieldB'},'B'),
 add('A independent delivery','deliver',{from:'A',to:'B',change:'fieldA'}),
 add('independent convergence','deliver',{from:'B',to:'A',change:'fieldB'},'B'),
 add('nonempty undo','undo',{change:'fieldUndo'}),
 add('undo delivery','deliver',{from:'A',to:'B',change:'fieldUndo'}),
 add('pending redo JSON checkpoint','checkpoint'),
 add('nonempty redo after JSON checkpoint','redo',{change:'fieldRedo'}),
 add('redo convergence','deliver',{from:'A',to:'B',change:'fieldRedo'}),
 add('A same value writer','setField',{target:'flow',key,path:['group','palette'],value:structuredClone(child),change:'fieldFenceA'}),
 add('same writer A delivery','deliver',{from:'A',to:'B',change:'fieldFenceA'}),
 add('B same value writer','setField',{target:'flow',key,path:['group','palette'],value:structuredClone(child),change:'fieldFenceB'},'B'),
 add('same writer B delivery','deliver',{from:'B',to:'A',change:'fieldFenceB'},'B'),
 add('foreign writer undo','undo',{change:'fieldFenceUndo'}),
 add('fence undo convergence','deliver',{from:'A',to:'B',change:'fieldFenceUndo'}),
 add('recovery after foreign writer','checkpoint'),
 ];
 const at=f.commands.findIndex(c=>c.label==='payload stable UTF16 selection');f.commands.splice(at,0,...commands);f.commands.forEach((c,i)=>c.time=i+1);f.name=f.name.replace('payload','fieldrefs');return f;
}
export const documents=inherited.map(extend);
export const unsupported=[];
