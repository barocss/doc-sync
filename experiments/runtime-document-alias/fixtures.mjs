// Keep the prior semantic corpus, then add native graph/actual TypeScript alias cases.
import {documents as composite} from '../runtime-document-composite/fixtures.mjs';
import {FORMAT} from './schema.mjs';
const source=(at,kind='default',index=0)=>({$ref:kind,at:at.join('.')+(kind==='default'?'.default':'.values'),...(kind==='enum'?{index}:{})});
function document(original,index){
 const f=structuredClone(original),schema=f.schema,defaultReferences=[];
 for(const [key,d]of Object.entries(schema.markValues??{}))if(!key.startsWith('mixed')&&d.values&&d.values[0]&&typeof d.values[0]==='object'){d.default=structuredClone(d.values[0]);defaultReferences.push({at:['markValues',key],enumIndex:0});}
 for(const [kind,node]of Object.entries(schema.nodes))for(const [key,d]of Object.entries(node.attrs??{}))if(!key.startsWith('mixed')&&!d.fields&&d.values&&d.values[0]&&typeof d.values[0]==='object'){d.default=structuredClone(d.values[0]);defaultReferences.push({at:['nodes',kind,'attrs',key],enumIndex:0});}
 const mark=Object.keys(schema.markValues).find(k=>k.startsWith('enumObject')),array=Object.keys(schema.markValues).find(k=>k.startsWith('enumArray')),atom=Object.keys(schema.nodes).find(k=>schema.nodes[k].shape==='atom'),at=['markValues',mark],aa=['nodes',atom,'attrs',mark];
 // Equal slots 0 and 1 must remain distinct unless both edges are declared.
 // This descriptor has an extra equal unlinked slot, even in the multi-edge case.
 schema.markValues[mark].values.push(structuredClone(schema.markValues[mark].values[0]));
 if(index===1)defaultReferences.push({at,enumIndex:1});
 const added=[
  {label:'aliased enum default mark is omitted',op:'insertText',alias:'aliasDefault',after:'mixedBool',text:'D',marks:{[mark]:source(at)}},
  {label:'aliased enum zero mark is omitted',op:'insertText',alias:'aliasZero',after:'aliasDefault',text:'E',marks:{[mark]:source(at,'enum',0)}},
  {label:'equal enum one retains exact declared identity',op:'insertText',alias:'aliasOne',after:'aliasZero',text:'F',marks:{[mark]:source(at,'enum',1)}},
  {label:'equal unlinked enum slot retains identity',op:'insertText',alias:'aliasUnlinked',after:'aliasOne',text:'G',marks:{[mark]:source(at,'enum',3)}},
  {label:'aliased array enum default is omitted',op:'insertText',alias:'aliasArray',after:'aliasUnlinked',text:'H',marks:{[array]:source(['markValues',array])}},
  {label:'alias default format keeps source binding',op:'format',targets:['aliasUnlinked'],key:mark,value:source(at)},
  {label:'alias enum zero format keeps selected index',op:'format',targets:['aliasOne'],key:mark,value:source(at,'enum',0)},
  {label:'alias enum one format keeps selected index',op:'format',targets:['aliasZero'],key:mark,value:source(at,'enum',1)},
  {label:'alias atom default set keeps source binding',op:'set',target:'atom',key:mark,value:source(aa)},
  {label:'alias atom enum zero set keeps selected index',op:'set',target:'atom',key:mark,value:source(aa,'enum',0)},
  {label:'alias atom enum one remains distinct',op:'set',target:'atom',key:mark,value:source(aa,'enum',1)}
 ].map(c=>({...c,actor:'A'}));
 const textAt=f.commands.findIndex(c=>c.label==='mixed enum boolean member')+1;
 f.commands.splice(textAt,0,...added.slice(0,5));
 const attrAt=f.commands.findIndex(c=>c.label==='object attr exact default reset');f.commands.splice(attrAt,0,...added.slice(5));
 f.commands.forEach((c,i)=>c.time=i+1);
 return{...f,name:f.name.replace('composite','alias'),schema:{format:FORMAT,manifest:schema,defaultReferences}};
}
export const documents=composite.map(document);
export const unsupported=[];
