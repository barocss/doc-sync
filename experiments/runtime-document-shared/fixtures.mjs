// Semantic intent only. Each runtime selects the original source handle independently.
import {documents as inherited} from '../runtime-document-alias/fixtures.mjs';
import {FORMAT} from './schema.mjs';
export const source=(at,kind='default',index=0)=>({$ref:kind,at:at.join('.')+(kind==='default'?'.default':'.values'),...(kind==='enum'?{index}:{})});
const slot=(at,source='default',index=0)=>({at,source,...(source==='enum'?{index}:{})});
function document(original,index){
 const f=structuredClone(original),manifest=f.schema.manifest;
 const object={b:2,a:1},array=[{b:2,a:1},['x',{d:4,c:3}]],spec=v=>({default:structuredClone(v),values:[structuredClone(v),structuredClone(v),structuredClone(v)]});
 const kinds=Object.keys(manifest.nodes),atom=kinds.find(k=>manifest.nodes[k].shape==='atom'),flow=kinds.find(k=>manifest.nodes[k].shape==='flow'&&k!==manifest.root),inline=kinds.find(k=>manifest.nodes[k].shape==='inline'),paragraph=kinds.find(k=>manifest.nodes[k].shape==='text');
 const suffix=index?'Deck':'Article',mark='sharedPaint'+suffix,markArray='sharedArray'+suffix,attr='sharedPayload'+suffix,attrArray='sharedList'+suffix;
 manifest.markValues[mark]={...spec(object),inherit:false};manifest.markValues[markArray]={...spec(array),inherit:false};
 for(const kind of [atom,flow,inline,paragraph]){manifest.nodes[kind].attrs[attr]=spec(object);manifest.nodes[kind].attrs[attrArray]=spec(array);}
 const oldGroups=[];for(const e of f.schema.defaultReferences){let g=oldGroups.find(g=>JSON.stringify(g.representative.at)===JSON.stringify(e.at));if(!g){g={representative:slot(e.at),slots:[slot(e.at)]};oldGroups.push(g);}g.slots.push(slot(e.at,'enum',e.enumIndex));}
 const objectSlots=[slot(['nodes',atom,'attrs',attr],'enum',1),slot(['markValues',mark]),slot(['markValues',mark],'enum',0),slot(['nodes',flow,'attrs',attr]),slot(['nodes',flow,'attrs',attr],'enum',0),slot(['nodes',inline,'attrs',attr],'enum',1),slot(['nodes',paragraph,'attrs',attr],'enum',1)];
 const arraySlots=[slot(['markValues',markArray],'enum',1),slot(['nodes',atom,'attrs',attrArray],'enum',0),slot(['nodes',flow,'attrs',attrArray]),slot(['nodes',inline,'attrs',attrArray],'enum',1),slot(['nodes',paragraph,'attrs',attrArray],'enum',1)];
 const referenceGroups=[...oldGroups,{representative:objectSlots[0],slots:objectSlots},{representative:arraySlots[0],slots:arraySlots}];
 const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b),newPaths=[['markValues',mark],['markValues',markArray],...[atom,flow,inline,paragraph].flatMap(kind=>[['nodes',kind,'attrs',attr],['nodes',kind,'attrs',attrArray]])];for(const at of newPaths){const def=slot(at),owner=referenceGroups.find(g=>g.slots.some(s=>same(s,def)));if(owner){if(!owner.slots.some(s=>same(s.at,at)&&s.source==='enum')){const member=slot(at,'enum',0);if(referenceGroups.some(g=>g.slots.some(s=>same(s,member))))throw Error('reserved default enum');owner.slots.push(member);}}else{const index=[0,1,2].find(index=>!referenceGroups.some(g=>g.slots.some(s=>same(s,slot(at,'enum',index)))));referenceGroups.push({representative:def,slots:[def,slot(at,'enum',index)]});}}
 // Equal unlinked values retain their own insertion order.
 manifest.markValues[markArray].values[2]=['alternate'];manifest.nodes[atom].attrs[attr].values[2]={a:1,b:2};manifest.markValues[mark].default={a:1,b:2};manifest.nodes[flow].attrs[attr].default={a:1,b:2};
 const sm=['markValues',mark],sa=['nodes',atom,'attrs',attr],sf=['nodes',flow,'attrs',attr],si=['nodes',inline,'attrs',attr],sp=['nodes',paragraph,'attrs',attr],am=['markValues',markArray],aa=['nodes',atom,'attrs',attrArray];
 const add=(label,op,rest={},actor='A')=>({label:'shared '+label,actor,op,...rest});
 const added=[
  add('cross kind source omits mark default','insertText',{alias:'sharedOmit',after:'mixedBool',text:'S😀',marks:{[mark]:source(sa,'enum',1)}}),
  add('mark source retained at atom different attribute','set',{target:'atom',key:attr,value:source(sm),change:'sharedSet'}),
  add('atom source retained at inline different kind','set',{target:'inline',key:attr,value:source(sa,'enum',1)}),
  add('flow source retained at paragraph different kind','set',{target:'para',key:attr,value:source(sf)}),
  add('inline source at mark different name','format',{targets:['sharedOmit'],key:mark,value:source(si,'enum',1)}),
  add('paragraph source at atom different kind','set',{target:'atom',key:attr,value:source(sp,'enum',1)}),
  add('mark array source at atom different attribute','set',{target:'atom',key:attrArray,value:source(am,'enum',1)}),
  add('atom array source retained mark','format',{targets:['sharedOmit'],key:markArray,value:source(aa,'enum',0)}),
  add('cross shared null reset fallback order','set',{target:'flow',key:attr,value:null}),
  add('equal unlinked enum keeps own order','set',{target:'atom',key:attr,value:source(sa,'enum',2)}),
  add('synchronize B','deliver',{from:'A',to:'B',change:'pending'}),
  add('A concurrent shared writer','set',{target:'atom',key:attr,value:source(sm,'enum',0),change:'sharedA',caretBefore:'sharedOmit',caretAfter:{ref:'sharedOmit',offset:2}}),
  add('B concurrent shared writer','set',{target:'atom',key:attr,value:source(sf),change:'sharedB'},'B'),
  add('A writer delivery','deliver',{from:'A',to:'B',change:'sharedA'}),
  add('B writer delivery','deliver',{from:'B',to:'A',change:'sharedB'},'B'),
  add('undo foreign fence','undo',{change:'sharedUndo'}),
  add('undo delivery','deliver',{from:'A',to:'B',change:'sharedUndo'}),
  add('pending History recovery','checkpoint'),
  add('redo after JSON History recovery','redo',{change:'sharedRedo'}),
  add('redo delivery','deliver',{from:'A',to:'B',change:'sharedRedo'}),
  add('distinct array before cross group recovery','format',{targets:['sharedOmit'],key:markArray,value:source(am,'enum',2),change:'sharedDistinct'}),
  add('distinct array delivery','deliver',{from:'A',to:'B',change:'sharedDistinct'}),
  add('independent cross group format','format',{targets:['sharedOmit'],key:markArray,value:source(aa,'enum',0),change:'sharedFormat'}),
  add('cross group format delivery','deliver',{from:'A',to:'B',change:'sharedFormat'}),
  add('nonempty cross group undo','undo',{change:'sharedFormatUndo'}),
  add('cross group undo delivery','deliver',{from:'A',to:'B',change:'sharedFormatUndo'}),
  add('cross group pending redo recovery','checkpoint'),
  add('nonempty cross group redo after recovery','redo',{change:'sharedFormatRedo'}),
  add('cross group redo delivery','deliver',{from:'A',to:'B',change:'sharedFormatRedo'}),
  add('stable UTF16 selection','selectionStable',{name:'sharedStable',range:{anchor:[0,1],focus:[0,3]}}),
  add('replay pending twice','deliver',{from:'A',to:'B',change:'pending',repeat:2,self:true}),
  add('resolve stable UTF16 selection','resolveSelection',{name:'sharedStable'}),
 ];
 // Source aliases, nested flow and inline exist before these new commands.
 const at=f.commands.findIndex(c=>c.label==='object attr exact default reset');f.commands.splice(at,0,...added);
 f.commands.forEach((c,i)=>c.time=i+1);
 return{...f,name:f.name.replace('alias','shared'),schema:{format:FORMAT,manifest,referenceGroups}};
}
export const documents=inherited.map(document);
export const unsupported=[];
