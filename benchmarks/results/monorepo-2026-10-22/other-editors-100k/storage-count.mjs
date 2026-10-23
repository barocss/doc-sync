import {readFileSync,writeFileSync} from 'node:fs';
import {Doc} from '../../../packages/doc-sync/src/index.ts';
import {DEMO_SCHEMA} from '../../../fixtures/demo-schema.ts';
const seed=JSON.parse(readFileSync('/tmp/doc-sync-other-editors-100k-20261022/slate-a-lexical-a.jsonl','utf8').split('\n')[0]).change;
const doc=new Doc('storage-count',DEMO_SCHEMA);for(const op of seed.ops)doc.apply(op);const model=doc.toJSON(),lines=doc.lines();
const result={kind:'Structure counts only; not a timing benchmark',seedTextOperations:seed.ops.filter(o=>o.t==='text').length,textLengths:[...new Set(seed.ops.filter(o=>o.t==='text').map(o=>o.text.length))],textUnits:seed.ops.filter(o=>o.t==='text').reduce((s,o)=>s+o.text.length,0),physicalLiveCharItems:lines.flatMap(l=>l.items).filter(i=>i.kind==='char'&&!i.compact).length,allStoredItems:lines.reduce((s,l)=>s+l.items.length,0),idMapEntries:doc.byKey.size,modelParagraphs:model.children.length,modelTextRuns:model.children.reduce((s,p)=>s+p.runs.length,0)};
if(result.seedTextOperations!==625||result.physicalLiveCharItems!==100000||result.modelTextRuns!==625)throw Error(JSON.stringify(result));
writeFileSync('benchmarks/results/monorepo-2026-10-22/other-editors-100k/storage-baseline.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
