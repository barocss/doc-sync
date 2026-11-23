import type {Schema} from "@barocss/doc-sync";
import type {JSONLeaf,CheckedRevision} from "./brief.ts";
import {parsePlanningPath,readPlanningContext,assertStoredTextTarget,assertPersistedPlanningState} from "./planning-context.ts";
import type {PlanningBinding} from "./planning-context.ts";
export type ProtectedAttribute={path:number[];attribute:string};
export type PreservationCapture={target:ProtectedAttribute;binding:PlanningBinding;nodeType:string;present:boolean;value?:JSONLeaf};
const same=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
const leaf=(v:unknown):v is JSONLeaf=>v===null||typeof v==="boolean"||(typeof v==="number"&&Number.isFinite(v))||(typeof v==="string"&&v.length<=8192);
export function parseProtection(value:unknown,planningPath?:number[]):ProtectedAttribute[]{
 if(!planningPath)throw Error("Protected attributes require bounded planningPath");
 if(!Array.isArray(value)||value.length<1||value.length>16)throw Error("Protection requires 1–16 attributes");
 const seen=new Set<string>();
 return Array.from(value,item=>{
  if(!item||typeof item!=="object"||Array.isArray(item)||Object.keys(item).some(k=>k!=="path"&&k!=="attribute")||typeof item.attribute!=="string"||!item.attribute||item.attribute.length>120)throw Error("Invalid protected attribute");
  const path=parsePlanningPath(item.path),target={path,attribute:item.attribute};
  if(same(path,planningPath))throw Error("Protected block must differ from the bounded editing target");
  const key=JSON.stringify(target);if(seen.has(key))throw Error("Duplicate protected attribute");seen.add(key);return target;
 });
}
export function assertPreservationState(state:{planningPath?:number[];protectedAttributes?:ProtectedAttribute[];preservation?:PreservationCapture[]}):void{
 if(state.protectedAttributes===undefined&&state.preservation===undefined)return;
 if(!state.protectedAttributes||!state.preservation)throw Error("Incomplete preservation capture; review required");
 const targets=parseProtection(state.protectedAttributes,state.planningPath);
 if(state.preservation.length!==targets.length)throw Error("Incomplete preservation capture; review required");
 for(let i=0;i<targets.length;i++){
  const capture=state.preservation[i];
  if(!capture||!same(capture.target,targets[i])||typeof capture.nodeType!=="string"||!capture.nodeType||typeof capture.present!=="boolean"||(capture.present?!Object.hasOwn(capture,"value")||!leaf(capture.value):Object.hasOwn(capture,"value")))throw Error("Invalid preservation capture; review required");
  assertPersistedPlanningState({planningPath:targets[i].path,planningBinding:capture.binding});
 }
}
/** Capture once; never adopt a peer's new value as the original or write it back. */
export async function checkPreservation(call:(name:string,args:Record<string,unknown>)=>Promise<Record<string,unknown>>,targets:ProtectedAttribute[],revision:CheckedRevision,schema:Schema,previous?:PreservationCapture[]):Promise<PreservationCapture[]>{
 const captures:PreservationCapture[]=[];
 for(let i=0;i<targets.length;i++){
  const target=targets[i],context=await readPlanningContext(call,target.path,revision,previous?.[i]?.binding);
  assertStoredTextTarget(context.document.node,schema);
  const node=context.document.node as {type:string;attrs?:Record<string,unknown>};
  if(!Object.hasOwn(schema.nodes[node.type].attrs??{},target.attribute))throw Error("Protected attribute must be declared in the text node schema");
  const present=!!node.attrs&&Object.hasOwn(node.attrs,target.attribute),value=node.attrs?.[target.attribute];
  if(present&&!leaf(value))throw Error("Protected attribute requires a bounded scalar value");
  const capture:PreservationCapture={target:structuredClone(target),binding:context.binding,nodeType:node.type,present,...(present?{value:value as JSONLeaf}:{})};
  if(previous&&!same(capture,previous[i]))throw Error("Protected identity or attribute changed; preservation conflict requires review, never automatic restoration");
  captures.push(capture);
 }
 return captures;
}
