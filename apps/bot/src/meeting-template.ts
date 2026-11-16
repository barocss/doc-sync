import {checkSchema, schemaVersion} from '@barocss/doc-sync';
import type {Schema, NodeJSON} from '@barocss/doc-sync';
import {parseBrief, verifyBrief} from './brief.ts';
import type {Brief, Requirement} from './brief.ts';
const roles=['title','summary','decisions','actions'] as const;
export type MeetingTemplateResult =
 | {status:'needs_input'; requirements:string[]}
 | {status:'ready'; schemaVersion:string; draft:NodeJSON; brief:Brief};
const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
/** Build an offline draft, never edit a document or invent meeting facts. */
export function meetingNotesTemplate(input:unknown):MeetingTemplateResult {
 if(!object(input))return {status:'needs_input',requirements:['Provide schema, mapping and inputs.']};
 const errors:string[]=[];
 const mapping=object(input.mapping)?input.mapping:{};
 const supplied=object(input.inputs)?input.inputs:{};
 for(const role of roles){
  if(typeof mapping[role]!=='string'||!mapping[role])errors.push(`mapping.${role}: choose an explicit schema text type.`);
  if(typeof supplied[role]!=='string'||!(supplied[role] as string).trim()||(supplied[role] as string).length>8192)errors.push(`inputs.${role}: supply nonblank text of at most 8192 UTF-16 units (state none explicitly when appropriate).`);
 }
 let schema:Schema, fingerprint:string;
 try{schema=input.schema as Schema;if(!object(schema)||!object(schema.nodes))throw Error();fingerprint=schemaVersion(schema);if(checkSchema(schema).length)throw Error();}
 catch{return {status:'needs_input',requirements:[...errors,'schema: supply a valid supported document schema.']};}
 const root=schema.nodes[schema.root];
 if(schema.domain==='graphic'||root?.shape!=='flow'||root.childRules&&Object.keys(root.childRules).length){
  errors.push('schema: this template requires a document root flow without childRules.');
 }else for(const role of roles){
  const type=mapping[role];const spec=typeof type==='string'?schema.nodes[type]:undefined;
  if(typeof type!=='string'||!root.children.includes(type)||spec?.shape!=='text'||spec.text===false)errors.push(`mapping.${role}: requires a direct root child accepting plain text (groups and inline-only blocks are unsupported).`);
 }
 if(errors.length)return {status:'needs_input',requirements:errors};
 const types=roles.map(role=>mapping[role] as string);
 const draft:NodeJSON={type:schema.root,children:roles.map(role=>({type:mapping[role] as string,runs:[{text:supplied[role] as string,marks:{}}]}))};
 const requirements:Requirement[]=[{id:'sections',kind:'child_types',path:[],types}];
 roles.forEach((role,index)=>requirements.push({id:role,kind:'exact_text',path:[index],text:supplied[role] as string}));
 const brief=parseBrief({version:1,objective:'Preserve the supplied meeting title, summary, decisions and follow-up actions in that order. Do not invent facts.',requirements});
 if(verifyBrief(brief,draft,schema,{epoch:'offline-template',serverSeq:0,schemaVersion:fingerprint}).status!=='passed')return {status:'needs_input',requirements:['schema: generated draft is not supported by the completion verifier.']};
 return {status:'ready',schemaVersion:fingerprint,draft,brief};
}
