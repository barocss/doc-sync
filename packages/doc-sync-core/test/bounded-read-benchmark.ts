import type {Schema} from "../src/index.ts";
import {Doc, ROOT, readDocumentSlice} from "../src/index.ts";
const schema: Schema = {root: "doc", marks: [], nodes: {doc: {shape: "flow", children: ["p"], default: "p"}, p: {shape: "text"}}};
const receipt = [];
for (const size of [1000, 100000]) {
    const doc = new Doc("perf", schema);
    let previous = ROOT, lamport = 1;
    for (let i = 0; i < size; i++) {
        if (i) { const id = {lamport: lamport++, actor: "perf"}; doc.apply({t: "node", id, origin: previous, type: "p", boundary: `perf-${i}`}); previous = id; }
        const id = {lamport: lamport++, actor: "perf"}; doc.apply({t: "text", id, origin: previous, text: "x"}); previous = id;
    }
    let projectedCalls = 0; const project = Doc.prototype.projectVisibleBlock;
    Doc.prototype.projectVisibleBlock = function(block) { projectedCalls++; return project.call(this, block); };
    let fullReads = 0; const fullRead = Doc.prototype.toJSON;
    Doc.prototype.toJSON = () => { fullReads++; throw Error("full read"); };
    const start = performance.now(), first = readDocumentSlice(doc, {limit: 20});
    const firstMs = performance.now() - start;
    const samples = [];
    let last;
    for (let i = 0; i < 30; i++) { const t = performance.now(); last = readDocumentSlice(doc, {start: (i + 1) * 20, limit: 20}); samples.push(performance.now() - t); }
    Doc.prototype.projectVisibleBlock = project;
    Doc.prototype.toJSON = fullRead;
    samples.sort((a,b)=>a-b);
    receipt.push({paragraphs: size, firstMs, warmMedianMs: samples[15], warmP95Ms: samples[28], fullReads, projectedCalls, expectedProjectedCalls: 620, first: first.counts, warm: last!.counts, total: first.total});
}
console.log(JSON.stringify({scope: "local Core read only; simple one-character paragraphs; 30 warm pages; excludes construction/network/SDK/editor", node: process.version, receipt}, null, 2));
