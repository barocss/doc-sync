/** Local workload comparison, not an implementation before/after or product-latency benchmark.
 * Run: node --expose-gc benchmarks/bounded-ai-reads.mjs
 * Build the public Core package first. No build, network, browser, or paid model calls occur here.
 */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdir, readFile, readdir, writeFile} from 'node:fs/promises';
import os from 'node:os';
import {join, resolve} from 'node:path';
import {performance} from 'node:perf_hooks';
import {pathToFileURL} from 'node:url';

const root = resolve(import.meta.dirname, '..');
const output = resolve(process.env.BENCH_OUTPUT ?? join(root, 'benchmarks/results/bounded-ai-reads-2026-11-02/run.json'));
const warmSamples = Number(process.env.BENCH_SAMPLES ?? 21);
assert.ok(Number.isSafeInteger(warmSamples) && warmSamples >= 2 && warmSamples <= 30);
assert.equal(typeof global.gc, 'function', 'Use node --expose-gc; heap scope requires explicit GC');
const {Doc, ROOT, readDocumentSlice} = await import(pathToFileURL(join(root, 'packages/doc-sync-core/dist/index.js')));
const schema = {root: 'doc', marks: ['bold'], nodes: {
    doc: {shape: 'flow', children: ['p', 'box', 'table'], default: 'p'},
    table: {shape:'grid', children:['row']}, row:{shape:'row', children:['cell']},
    cell:{shape:'cell', children:['body'], attrs:{colspan:{default:1,min:1,computed:true},rowspan:{default:1,min:1,computed:true},spanned:{default:false,computed:true}}},
    body:{shape:'flow',children:['p'],default:'p'},
    p: {shape: 'text'}, box: {shape: 'flow', children: ['p', 'box'], default: 'p'},
}};
const paragraph = i => ({type: 'p', runs: [{text: `Section ${i}: 한국어 😀 ` + 'document context '.repeat(4), marks: {bold: true}}]});
const sha = value => createHash('sha256').update(value).digest('hex');
async function treeHash(dir) {
    const hash = createHash('sha256');
    async function walk(path, prefix = '') {
        for (const entry of (await readdir(path, {withFileTypes: true})).sort((a,b) => a.name.localeCompare(b.name))) {
            const name = join(prefix, entry.name), full = join(path, entry.name);
            if (entry.isDirectory()) await walk(full, name);
            else if (entry.isFile()) { hash.update(name); hash.update(await readFile(full)); }
        }
    }
    await walk(dir); return hash.digest('hex');
}
async function hashes() {
    return {source: await treeHash(join(root, 'packages/doc-sync-core/src')), dist: await treeHash(join(root, 'packages/doc-sync-core/dist'))};
}
const frozen = await hashes();
const counters = {toJSONCalls: 0, projectionMethodCalls: 0};
const originalFull = Doc.prototype.toJSON, originalProjection = Doc.prototype.projectVisibleBlock;
Doc.prototype.toJSON = function(...args) { counters.toJSONCalls++; return originalFull.apply(this, args); };
Doc.prototype.projectVisibleBlock = function(...args) { counters.projectionMethodCalls++; return originalProjection.apply(this, args); };
const descend = (model, path) => path.reduce((node, index) => node.children[index], model);
function measure(doc, mode, query, phase, ordinal) {
    global.gc();
    const heapBefore = process.memoryUsage().heapUsed;
    counters.toJSONCalls = 0; counters.projectionMethodCalls = 0;
    const start = performance.now();
    const value = mode === 'full' ? doc.toJSON() : readDocumentSlice(doc, query);
    const materialized = performance.now();
    const json = JSON.stringify(value);
    const serialized = performance.now();
    const heapBeforeFinalGC = process.memoryUsage().heapUsed;
    global.gc();
    const heapAfterFinalGC = process.memoryUsage().heapUsed;
    const row = {mode, phase, ordinal, materializationMs: materialized-start, serializationMs: serialized-materialized,
        modelAndSerializationMs: serialized-start, outputBytes: Buffer.byteLength(json), ...counters,
        sliceCounts: mode === 'bounded' ? value.counts : null,
        heapUsedDeltaBeforeFinalGC: heapBeforeFinalGC-heapBefore,
        retainedHeapUsedDeltaAfterGC: heapAfterFinalGC-heapBefore};
    // Keep model and serialized string live through the final GC measurement.
    assert.ok(json.length); return {row, value};
}
function flatSnapshot(count) {
    const doc = new Doc('fixture', schema);
    let origin = ROOT, lamport = 1;
    for (let i=0; i<count; i++) {
        if (i) { const id = {lamport: lamport++, actor: 'fixture'}; doc.apply({t:'node', id, origin, type:'p', boundary:`p-${i}`}); origin=id; }
        const id = {lamport:lamport++, actor:'fixture'};
        doc.apply({t:'text', id, origin, text:'x'}); origin=id;
    }
    return doc.snapshot();
}
function richSnapshot(withTable = false) {
    const doc = new Doc('fixture', schema);
    doc.edit([{op:'insert', at:[0], content:Array.from({length:1000}, (_,i) => ({type:'box', children:[paragraph(i),
        {type:'box', children:[paragraph(i+1000), paragraph(i+2000)]}]}))}], {normalize:false});
    if (withTable) doc.edit([{op:'insert',at:[1000],content:[{type:'table',children:[{type:'row',children:[
        {type:'cell',attrs:{colspan:2},children:[{type:'body',children:[paragraph('visible')]}]},
        {type:'cell',children:[{type:'body',children:[paragraph('retained covered cell')]}]},
    ]}]}]}],{normalize:false});
    return doc.snapshot();
}
const percentile = (values, p) => [...values].sort((a,b)=>a-b)[Math.ceil(values.length*p)-1];
const summarize = rows => Object.fromEntries(['materializationMs','serializationMs','modelAndSerializationMs','outputBytes','heapUsedDeltaBeforeFinalGC','retainedHeapUsedDeltaAfterGC'].map(key => {
    const values=rows.map(row=>row[key]); return [key,{min:Math.min(...values),median:percentile(values,.5),p95:percentile(values,.95),max:Math.max(...values)}];
}));
const results=[];
try {
    for (const [index, spec] of [
        {name:'flat-1000', count:1000, query:{start:480,limit:20}},
        {name:'flat-100000', count:100000, query:{start:49980,limit:20}},
        {name:'nested-marked-1000-boxes', rich:true, query:{path:[500],start:0,limit:2}},
        {name:'retained-table-cell-in-rich-document', rich:true, table:true, query:{path:[1000,0,1,0],start:0,limit:1}},
    ].entries()) {
        const snapshot = spec.rich ? richSnapshot(spec.table) : flatSnapshot(spec.count);
        const snapshotJSON=JSON.stringify(snapshot);
        const full = Doc.fromSnapshot('reader', snapshot, structuredClone(schema));
        const bounded = Doc.fromSnapshot('reader', snapshot, structuredClone(schema));
        const rows=[];
        let expected;
        const firstOrder=index%2 ? ['bounded','full'] : ['full','bounded'];
        let firstBounded;
        for (const mode of firstOrder) {
            const measured=measure(mode==='full'?full:bounded, mode, spec.query, 'first-on-restored-replica',0);
            rows.push(measured.row);
            if (mode==='full') expected=structuredClone(descend(measured.value,spec.query.path??[]).children.slice(spec.query.start,spec.query.start+spec.query.limit));
            else {
                firstBounded=measured.value.children.map(child=>child.node);
                assert.equal(measured.row.toJSONCalls,0);
                assert.ok(measured.row.outputBytes<=262144);
            }
        }
        assert.deepEqual(firstBounded, expected, `${spec.name} first selected-child oracle`);
        for (let i=0;i<warmSamples;i++) {
            for (const mode of i%2 ? ['bounded','full'] : ['full','bounded']) {
                const measured=measure(mode==='full'?full:bounded,mode,spec.query,'warm-same-query',i);
                rows.push(measured.row);
                if (mode==='bounded') {
                    assert.deepEqual(measured.value.children.map(child=>child.node),expected);
                    assert.ok(measured.row.outputBytes<=262144);
                    assert.equal(measured.row.toJSONCalls,0);
                }
            }
        }
        assert.equal(sha(JSON.stringify(full.snapshot())),sha(snapshotJSON),'full snapshot unchanged');
        assert.equal(sha(JSON.stringify(bounded.snapshot())),sha(snapshotJSON),'bounded snapshot unchanged');
        results.push({fixture:spec.name,query:spec.query,snapshotBytes:Buffer.byteLength(snapshotJSON),snapshotSha256:sha(snapshotJSON),
            selectedChildOracle:'PASS',snapshotPreservation:'PASS',executionOrder:rows.map(({phase,mode,ordinal})=>({phase,mode,ordinal})),samples:rows,
            warmSummary:Object.fromEntries(['full','bounded'].map(mode=>[mode,summarize(rows.filter(row=>row.mode===mode&&row.phase==='warm-same-query'))]))});
        console.log(`Completed ${spec.name}`);
    }
    const oversized=new Doc('oversized',schema);
    oversized.edit([{op:'insert',at:[0],content:[{type:'p',runs:[{text:'x'.repeat(65537),marks:{}}]}]}],{normalize:false});
    counters.projectionMethodCalls=0; counters.toJSONCalls=0;
    assert.throws(()=>readDocumentSlice(oversized,{limit:1}),/budget/);
    const oversizedCheck={status:'PASS',textUnits:65537,limit:65536,...counters};
    assert.equal(counters.projectionMethodCalls,0); assert.equal(counters.toJSONCalls,0);
    const after=await hashes(); assert.deepEqual(after,frozen,'Core source/dist changed during run');
    const receipt={format:'bounded-ai-read-workload-v1',timestamp:new Date().toISOString(),node:process.version,execArgv:process.execArgv,
        host:{platform:os.platform(),release:os.release(),arch:os.arch(),cpu:os.cpus()[0]?.model,logicalCPUs:os.cpus().length},
        sourceRoot:root,benchmarkSha256:sha(await readFile(new URL(import.meta.url))),hashesBefore:frozen,hashesAfter:after,sourceFreeze:'PASS',warmSamples,oversizedCheck,
        method:{payloadBytes:'Core JSON only; signed MCP responses and transport envelopes are excluded.',
            comparison:'Full canonical root model versus selected-child slice on matching restored snapshots. Intentionally different output scope.',
            timings:'Synchronous Core model read and JSON.stringify measured separately; no construction, restore, GC, oracle, network, SDK, model inference, editor, or server time.',
            first:'One first read per mode on a separate restored replica; process/JIT and OS are not cold. Order alternates by fixture.',
            warm:'Same unchanged replica and same query after first read; mode order alternates each repetition. No untimed extra warmup.',
            heap:'heapUsed changes from explicit pre-read GC to pre-final-GC and post-final-GC with result and JSON string live; not total allocation, peak RSS, or an allocation profiler.',
            counters:'Instrumented public Doc.toJSON and projectVisibleBlock calls. Slice counts are API-reported; projectionMethodCalls may include nested work.',
            limits:'Single-process local observations. Twenty-one warm samples by default; nearest-rank p95 is sample 20 after sorting. The first read is one observation per mode, subject to JIT and execution-order bias. Nested fixture has 1000 root siblings, not 100000. No global constant-time claim; first indexing can scan siblings. Stale paging correctness remains in Core tests.'},results};
    await mkdir(resolve(output,'..'),{recursive:true}); await writeFile(output,JSON.stringify(receipt,null,2)+'\n');
    console.log(output);
} finally { Doc.prototype.toJSON=originalFull; Doc.prototype.projectVisibleBlock=originalProjection; }
