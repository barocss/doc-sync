import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {PersistentReviewWatch} from './persistent-watch.ts';
import {ReviewWatch} from './watch.ts';
import type {WatchState,ReviewOutcome} from './watch.ts';
export type WatchCommandConfig={url:string;document:string;mission:string;model?:string;maxRuns:number;checkpoint?:string};
/** CLI configuration identity only, not a model identity or authorization proof. */
export function watchCommandBinding(config:WatchCommandConfig):string{
 const url=new URL(config.url);
 if(!['http:','https:'].includes(url.protocol)||url.username||url.password||url.search||url.hash)throw Error('Persistent watch requires a nonsecret HTTP endpoint without credentials, query or fragment');
 if(!config.document?.trim()||!config.mission?.trim()||(config.model!==undefined&&!config.model.trim()))throw Error('Persistent watch requires document, mission and a valid model setting');
 return createHash('sha256').update(JSON.stringify({contract:'cli-reviewer-v1',url:url.href,document:config.document,mission:config.mission,model:config.model??null,role:'reviewer',maxSteps:4})).digest('hex');
}
/** Same selection path used by the CLI; callbacks are injected for deterministic tests. */
export async function openCommandWatch(config:WatchCommandConfig,read:()=>Promise<WatchState>,review:(range:{from:number;to:number})=>Promise<ReviewOutcome>){
 if(config.checkpoint!==undefined){
  if(!config.checkpoint.trim())throw Error('Checkpoint path must not be blank');
  return PersistentReviewWatch.open({file:resolve(config.checkpoint),binding:watchCommandBinding(config),maxRuns:config.maxRuns},read,review);
 }
 const watch=new ReviewWatch(read,review,config.maxRuns);
 return {get done(){return watch.done;},poll:()=>watch.poll(),close:async()=>watch.stop()};
}
