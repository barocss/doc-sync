export type ReviewQueueGroup = 'pending' | 'unresolved' | 'closed';
export type ReviewQueue = {
 counts: Record<'all' | ReviewQueueGroup, number>;
 rows: Array<{id:string;status:string;group:ReviewQueueGroup;localDecisionPending:boolean}>;
};
export function reviewQueue(items:unknown,filter?:string,hasLocalDecision?:(id:string)=>unknown):ReviewQueue;
