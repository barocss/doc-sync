import type {Schema} from '@barocss/doc-sync';
import type {CheckedRevision} from './brief.ts';
import {parsePlanningPath,readPlanningContext,assertPlanningTarget,assertPersistedPlanningState} from './planning-context.ts';
import type {PlanningBinding} from './planning-context.ts';
export type TextPreservationCapture={path:number[];binding:PlanningBinding;nodeType:string;text:string};
const same=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
const boundedText=(v:unknown):v is string=>typeof v==='string'&&v.length<=8192;
export function parseTextProtection(value:unknown,planningPath?:number[]):number[][]{
 if(!planningPath)throw Error('Protected text requires bounded planningPath');
 if(!Array.isArray(value)||value.length<1||value.length>16)throw Error('Protection requires 1–16 text blocks');
 const seen=new Set<string>();return Array.from(value,item=>{const path=parsePlanningPath(item),key=JSON.stringify(path);if(same(path,planningPath))throw Error('Protected text block must differ from bounded editing target');if(seen.has(key))throw Error('Duplicate protected text block');seen.add(key);return path;});
}
export function assertTextPreservationState(state:{planningPath?:number[];protectedText?:number[][];textPreservation?:TextPreservationCapture[]}):void{
 if(state.protectedText===undefined&&state.textPreservation===undefined)return;
 if(!Array.isArray(state.protectedText)||!Array.isArray(state.textPreservation))throw Error('Incomplete protected text capture; review required');
 const paths=parseTextProtection(state.protectedText,state.planningPath);
 if(state.textPreservation.length!==paths.length)throw Error('Incomplete protected text capture; review required');
 for(let i=0;i<paths.length;i++){const capture=state.textPreservation[i];if(!capture||Object.keys(capture).sort().join(',')!=='binding,nodeType,path,text'||!same(capture.path,paths[i])||typeof capture.nodeType!=='string'||!capture.nodeType||!boundedText(capture.text))throw Error('Invalid protected text capture; review required');assertPersistedPlanningState({planningPath:paths[i],planningBinding:capture.binding});}
}
/** Capture once. Text equality ignores marks/run boundaries, never identity or placement. No restoration. */
export async function checkTextPreservation(call:(name:string,args:Record<string,unknown>)=>Promise<Record<string,unknown>>,paths:number[][],revision:CheckedRevision,schema:Schema,previous?:TextPreservationCapture[]):Promise<TextPreservationCapture[]>{
 const captures:TextPreservationCapture[]=[];
 for(let i=0;i<paths.length;i++){
  const path=paths[i],context=await readPlanningContext(call,path,revision,previous?.[i]?.binding);assertPlanningTarget(context.document.node,schema);
  const node=context.document.node as {type:string;runs:{text:string}[]},text=node.runs.map(run=>run.text).join('');
  if(!boundedText(text))throw Error('Protected text exceeds 8192 UTF-16 units');
  const capture={path:[...path],binding:context.binding,nodeType:node.type,text};
  if(previous&&!same(capture,previous[i]))throw Error('Protected identity or text changed; preservation conflict requires review, never automatic restoration');captures.push(capture);
 }
 return captures;
}
