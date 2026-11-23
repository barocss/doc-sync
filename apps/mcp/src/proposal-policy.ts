import {z} from 'zod';
import {createHash} from 'node:crypto';
const identity=z.string().min(1).max(256);
/** A single-revision capability. Owner must renew it after any document revision. */
export const proposalPolicySchema=z.object({
 generation:identity,epoch:identity,serverSeq:z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),schemaVersion:identity,
 blockId:identity,path:z.tuple([z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)]),
 start:z.number().int().min(0).max(16384),end:z.number().int().min(0).max(16384),
 operations:z.tuple([z.literal('replace_text')]),
}).strict().refine(p=>p.start<=p.end);
export type ProposalPolicy=z.infer<typeof proposalPolicySchema>;
function canonical(v:unknown):unknown {if(Array.isArray(v))return v.map(canonical);if(v&&typeof v==='object')return Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical((v as Record<string,unknown>)[k])]));return v;}
export function policyFingerprint(policy:ProposalPolicy|undefined,legacy:string):string {
 return policy===undefined?legacy:createHash('sha256').update(JSON.stringify(canonical(['bounded-proposal-policy',1,legacy,proposalPolicySchema.parse(policy)]))).digest('hex');
}
export function enforcePolicy(policy:ProposalPolicy|undefined,base:{generation:string;epoch:string;serverSeq:number;schemaVersion:string},target?:{path:number[];blockId:string;start?:number;end?:number;kind?:string}):void {
 if(!policy)return;
 const p=proposalPolicySchema.parse(policy);
 if(p.generation!==base.generation||p.epoch!==base.epoch||p.serverSeq!==base.serverSeq||p.schemaVersion!==base.schemaVersion)throw Error('Proposal policy revision mismatch');
 if(target&&(target.path.length!==1||target.path[0]!==p.path[0]||target.blockId!==p.blockId||target.kind!==undefined&&target.kind!=='replace_text'||target.start!==undefined&&(target.start<p.start||target.end===undefined||target.end>p.end||target.start>target.end)))throw Error('Proposal target outside owner policy');
}
