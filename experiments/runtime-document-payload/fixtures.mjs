// Inherited corpus is imported without modifying any old fixture.
import {documents as inherited} from '../runtime-document-shared/fixtures.mjs';
import {FORMAT} from './schema.mjs';
export const source=(at,kind='default',index=0,valuePath=[])=>({$ref:kind,at:at.join('.')+(kind==='default'?'.default':'.values'),...(kind==='enum'?{index}:{}),...(valuePath.length?{valuePath}:{})});
const slot=(at,source='default',index=0,valuePath=[])=>({at,source,...(source==='enum'?{index}:{}),...(valuePath.length?{valuePath}:{})});
function extend(original,index){const f=structuredClone(original),m=f.schema.manifest,kinds=Object.keys(m.nodes),atom=kinds.find(k=>m.nodes[k].shape==='atom'),flow=kinds.find(k=>m.nodes[k].shape==='flow'&&k!==m.root),inline=kinds.find(k=>m.nodes[k].shape==='inline'),text=kinds.find(k=>m.nodes[k].shape==='text'),tag=index?'Deck':'Article',payload='nestedPayload'+tag,list='nestedList'+tag,parent='parentPayload'+tag,peer='parentPeer'+tag,paint='nestedPaint'+tag,paintList='nestedArray'+tag;
 const child={b:2,a:1},array=[{b:2,a:1},['x',{d:4,c:3}]],root={tail:9,child:structuredClone(child),list:structuredClone(array)},spec=v=>({default:null,values:[structuredClone(v),{z:9}]}),parentSpec=()=>({default:structuredClone(root),values:[structuredClone(root)]});
 m.markValues[paint]={...spec(child),inherit:false};m.markValues[paintList]={...spec(array),inherit:false};for(const kind of [atom,flow,inline,text]){m.nodes[kind].attrs[payload]=spec(child);m.nodes[kind].attrs[list]=spec(array);}m.nodes[atom].attrs[parent]=parentSpec();m.nodes[flow].attrs[peer]=parentSpec();
 const ap=['nodes',atom,'attrs',parent],fp=['nodes',flow,'attrs',peer],target=['nodes',atom,'attrs',payload],mp=['markValues',paint],ml=['markValues',paintList],childSlots=[slot(ap,'default',0,['child']),slot(ap,'default',0,['list',0]),slot(target,'enum',0),slot(mp,'enum',0),...[flow,inline,text].map(k=>slot(['nodes',k,'attrs',payload],'enum',0))],listSlots=[slot(ap,'default',0,['list']),slot(ml,'enum',0),...[atom,flow,inline,text].map(k=>slot(['nodes',k,'attrs',list],'enum',0))];
 // The selected child representative reverses insertion order in every parent alias.
 m.nodes[atom].attrs[payload].values[0]={a:1,b:2};
 f.schema={format:FORMAT,manifest:m,referenceGroups:[...f.schema.referenceGroups,{representative:slot(fp),slots:[slot(ap),slot(ap,'enum',0),slot(fp),slot(fp,'enum',0)]},{representative:slot(target,'enum',0),slots:childSlots},{representative:slot(ml,'enum',0),slots:listSlots}]};
 const add=(label,op,rest={},actor='A')=>({label:'payload '+label,op,actor,...rest}),c=source;
 const commands=[
 add('nested child mark birth','insertText',{alias:'payloadText',after:'mixedBool',text:'N😀',marks:{[paint]:c(ap,'default',0,['child'])}}),
 add('implicit parent descendant to atom','set',{target:'atom',key:payload,value:c(fp,'enum',0,['child']),change:'payloadFirst'}),
 add('array index source to inline','set',{target:'inline',key:payload,value:c(ap,'default',0,['list',0])}),
 add('nested array to flow','set',{target:'flow',key:list,value:c(fp,'default',0,['list'])}),
 add('selected child to text attribute','set',{target:'para',key:payload,value:c(ap,'enum',0,['child'])}),
 add('nested array mark','format',{targets:['payloadText'],key:paintList,value:c(ap,'default',0,['list'])}),
 add('parent root retains normalized nested order','set',{target:'atom',key:parent,value:c(fp)}),
 add('parent null fallback normalized nested order','set',{target:'atom',key:parent,value:null}),
 add('synchronize B','deliver',{from:'A',to:'B',change:'pending'}),
 add('A nested writer','set',{target:'atom',key:payload,value:c(fp,'enum',0,['list',0]),change:'payloadA',caretBefore:'payloadText',caretAfter:{ref:'payloadText',offset:2}}),
 add('B distinct nested writer','set',{target:'atom',key:payload,value:c(target,'enum',1),change:'payloadB'},'B'),
 add('A nested delivery','deliver',{from:'A',to:'B',change:'payloadA'}),
 add('B nested delivery','deliver',{from:'B',to:'A',change:'payloadB'},'B'),
 add('distinct array before nested undo','format',{targets:['payloadText'],key:paintList,value:c(ml,'enum',1),change:'payloadDistinct'}),
 add('distinct array delivery','deliver',{from:'A',to:'B',change:'payloadDistinct'}),
 add('independent nested format','format',{targets:['payloadText'],key:paintList,value:c(fp,'enum',0,['list']),change:'payloadFormat'}),
 add('nested format delivery','deliver',{from:'A',to:'B',change:'payloadFormat'}),
 add('nonempty nested undo','undo',{change:'payloadUndo'}),
 add('nested undo delivery','deliver',{from:'A',to:'B',change:'payloadUndo'}),
 add('pending nested redo JSON checkpoint','checkpoint'),
 add('nonempty nested redo after JSON checkpoint','redo',{change:'payloadRedo'}),
 add('nested redo delivery','deliver',{from:'A',to:'B',change:'payloadRedo'}),
 add('stable UTF16 selection','selectionStable',{name:'payloadStable',range:{anchor:[0,1],focus:[0,3]}}),
 add('replay nested pending twice','deliver',{from:'A',to:'B',change:'pending',repeat:2,self:true}),
 add('resolve stable UTF16 selection','resolveSelection',{name:'payloadStable'}),
 ];const at=f.commands.findIndex(c=>c.label==='object attr exact default reset');f.commands.splice(at,0,...commands);f.commands.forEach((c,i)=>c.time=i+1);f.name=f.name.replace('shared','payload');return f;}
export const documents=inherited.map(extend);
export const unsupported=[];
