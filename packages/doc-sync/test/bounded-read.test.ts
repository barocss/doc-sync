import assert from "node:assert/strict";
import {test} from "node:test";
import {Doc, readDocumentSlice, schemaVersion} from "../src/index.ts";
import type {NodeJSON, Schema} from "../src/index.ts";
import {DEMO_SCHEMA} from "../../../fixtures/demo-schema.ts";

const paragraph = (text: string): NodeJSON => ({type: "paragraph", runs: [{text, marks: {}}]});
const make = (children: NodeJSON[], schema: Schema = DEMO_SCHEMA) => {
    const doc = new Doc("reader", schema);
    doc.edit([{op: "insert", at: [0], content: children}], {normalize: false});
    return doc;
};
const pages = (doc: Doc, path: number[] = [], limit = 7) => {
    const result: NodeJSON[] = [];
    let start = 0;
    do {
        const page = readDocumentSlice(doc, {path, start, limit});
        result.push(...page.children.map(child => child.node));
        if (page.nextIndex === null) break;
        assert.ok(page.nextIndex > start);
        start = page.nextIndex;
    } while (true);
    return result;
};

test("1,200 paragraphs paginate without full model reads and return detached UTF-16 data", t => {
    const doc = make(Array.from({length: 1200}, (_, i) => paragraph(`${i}:한글😀`)));
    const expected = doc.toJSON().children;
    const fullRead = Doc.prototype.toJSON;
    t.after(() => { Doc.prototype.toJSON = fullRead; });
    Doc.prototype.toJSON = () => { throw new Error("full model read"); };
    assert.deepEqual(pages(doc), expected);
    const page = readDocumentSlice(doc, {limit: 3});
    assert.equal(page.counts.projectedBlocks, 3);
    assert.equal(page.counts.indexedBlocks, 0);
    assert.equal(page.counts.textUnits, expected!.slice(0, 3).flatMap(node => node.runs ?? []).reduce((n, run) => n + ("text" in run ? run.text.length : 0), 0));
    assert.equal(page.counts.bytes, new TextEncoder().encode(JSON.stringify(page)).length);
    page.children[0].node.runs![0] = {text: "mutated", marks: {}};
    assert.deepEqual(pages(doc), expected);
    const end = readDocumentSlice(doc, {start: expected!.length});
    assert.deepEqual(end.children, []); assert.equal(end.nextIndex, null);
});

test("nested groups, flows, grid cells, and moves match the canonical model", () => {
    const doc = make([paragraph("head"), {type: "list", attrs: {listType: "numbered"}, children: [
        {type: "list-item", runs: [{text: "A", marks: {}}]}, {type: "list-item", runs: [{text: "B", marks: {}}]},
    ]}, {type: "callout", children: [paragraph("nested"), paragraph("other")]},
    {type: "table", children: [{type: "table-row", children: [
        {type: "table-cell", children: [{type: "table-cell-body", children: [paragraph("cell1")]}]},
        {type: "table-cell", children: [{type: "table-cell-body", children: [paragraph("cell2")]}]},
    ]}]}]);
    let expected = doc.toJSON();
    assert.deepEqual(pages(doc), expected.children);
    for (const path of [[1], [2], [3, 0, 0, 0], [3, 0, 1, 0]]) {
        let node = expected; for (const index of path) node = node.children![index];
        assert.deepEqual(pages(doc, path, 1), node.children);
    }
    const id = readDocumentSlice(doc, {start: 2, limit: 1}).children[0].blockId;
    doc.edit([{op: "move", from: [2], at: [1]}]);
    expected = doc.toJSON();
    assert.deepEqual(pages(doc), expected.children);
    assert.equal(readDocumentSlice(doc, {start: 1, limit: 1}).children[0].blockId, id);
});

test("merged-cell retained model data has the same projection as full reads", () => {
    const doc = make([paragraph("head"), {type: "table", children: [{type: "table-row", children: [
        {type: "table-cell", attrs: {colspan: 2}, children: [{type: "table-cell-body", children: [paragraph("shown")]}]},
        {type: "table-cell", children: [{type: "table-cell-body", children: [paragraph("retained")]}]},
    ]}]}]);
    const expected = doc.toJSON();
    assert.deepEqual(pages(doc), expected.children);
    assert.deepEqual(pages(doc, [1, 0, 1, 0]), expected.children![1].children![0].children![1].children![0].children);
    assert.throws(() => readDocumentSlice(doc, {path: [1, 0, 1, 7]}), /cell body/);
});

test("cardinality required and hidden candidates follow the canonical model", () => {
    const schema: Schema = {root: "doc", marks: [], nodes: {
        doc: {shape: "flow", children: ["paragraph", "box"], default: "paragraph", childRules: {box: {min: 1, max: 1}}},
        paragraph: {shape: "text"}, box: {shape: "flow", children: ["paragraph"], default: "paragraph"},
    }};
    const doc = make([paragraph("x"), {type: "box", children: [paragraph("one")]}, {type: "box", children: [paragraph("hidden")]}], schema);
    assert.deepEqual(pages(doc), doc.toJSON().children);
    const empty = new Doc("empty", schema);
    assert.deepEqual(pages(empty), empty.toJSON().children);
});

test("invalid and oversized queries preserve CRDT revision, schema and snapshot", () => {
    const doc = make([paragraph("😀".repeat(1000)), {type: "callout", children: [paragraph("nested")]}]);
    const before = JSON.stringify(doc.snapshot()), version = doc.version, schema = schemaVersion(doc.schema!);
    for (const query of [{limit: 0}, {limit: 101}, {path: [-1]}, {path: [99]}, {path: [0]}, {start: 999},
        {maxTextUnits: 1}, {maxNodes: 1}, {maxBytes: 20}, {path: [1], maxNodes: 1}]) {
        assert.throws(() => readDocumentSlice(doc, query));
        assert.equal(JSON.stringify(doc.snapshot()), before); assert.equal(doc.version, version); assert.equal(schemaVersion(doc.schema!), schema);
    }
});

test("invalid addresses on a fresh cardinality document do not persist derived required storage", () => {
    const schema: Schema = {root: "doc", marks: [], nodes: {
        doc: {shape: "flow", children: ["paragraph", "box"], default: "paragraph", childRules: {box: {min: 1, max: 1}}},
        paragraph: {shape: "text"}, box: {shape: "flow", children: ["paragraph"], default: "paragraph"},
    }};
    const doc = new Doc("fresh", schema), before = JSON.stringify(doc.snapshot()), version = doc.version;
    assert.throws(() => readDocumentSlice(doc, {path: [999]}));
    assert.equal(JSON.stringify(doc.snapshot()), before); assert.equal(doc.version, version);
});

test("fresh required group/grid/flow reads keep live storage unchanged and match the full model", () => {
    const schema = structuredClone(DEMO_SCHEMA);
    const root = schema.nodes[schema.root]; assert.equal(root.shape, "flow");
    if (root.shape !== "flow") throw Error("flow");
    root.childRules = {table: {min: 1, max: 1}, list: {min: 1, max: 1}, callout: {min: 1, max: 1}};
    const doc = new Doc("required-complex", schema), before = JSON.stringify(doc.snapshot());
    const actual = pages(doc);
    assert.equal(JSON.stringify(doc.snapshot()), before);
    const expected = doc.toJSON().children;
    assert.deepEqual(actual, expected);
    assert.deepEqual(pages(doc), expected);
});

test("run and attribute budgets reject before detached projection, including inline and span nodes", t => {
    const schema: Schema = {root: "doc", marks: [], markValues: {link: {default: ""}}, nodes: {
        doc: {shape: "flow", children: ["p"], default: "p"},
        p: {shape: "text", children: ["icon", "link"], attrs: {payload: {default: null}, meta: {default: {payload: null}, fields: {payload: {default: null}}}}},
        icon: {shape: "inline", attrs: {payload: {default: null}}}, link: {shape: "span", mark: "link", attr: "url"},
    }};
    const examples: Array<{node: NodeJSON; query: Parameters<typeof readDocumentSlice>[1]}> = [
        {node: {type: "p", runs: [{text: "one", marks: {}}]}, query: {limit: 1, maxNodes: 1}},
        {node: {type: "p", runs: Array.from({length: 1000}, () => ({type: "icon"}))}, query: {limit: 1, maxNodes: 2}},
        {node: {type: "p", attrs: {payload: "x".repeat(1_000_000)}, runs: []}, query: {limit: 1, maxBytes: 1024}},
        {node: {type: "p", attrs: {payload: {nested: [{blob: "x".repeat(1_000_000)}]}}, runs: []}, query: {limit: 1, maxBytes: 1024}},
        {node: {type: "p", attrs: {meta: {payload: Array.from({length: 300_000}, () => 1)}}, runs: []}, query: {limit: 1, maxBytes: 1024}},
        {node: {type: "p", runs: [{type: "icon", attrs: {payload: "x".repeat(1_000_000)}}]}, query: {limit: 1, maxBytes: 1024}},
        {node: {type: "p", runs: [{type: "link", attrs: {url: "x".repeat(1_000_000)}, runs: [{text: "x", marks: {}}]}]}, query: {limit: 1, maxBytes: 1024}},
        {node: {type: "p", runs: [{type: "link", attrs: {url: "url"}, runs: [{text: "x", marks: {}}]}]}, query: {limit: 1, maxNodes: 2}},
    ];
    const project = Doc.prototype.projectVisibleBlock;
    let projections = 0;
    Doc.prototype.projectVisibleBlock = function(block) { projections++; return project.call(this, block); };
    t.after(() => { Doc.prototype.projectVisibleBlock = project; });
    for (const {node, query} of examples) {
        const doc = make([node], schema), before = JSON.stringify(doc.snapshot()), version = doc.version;
        projections = 0;
        assert.throws(() => readDocumentSlice(doc, query), /budget/);
        assert.equal(projections, 0);
        assert.equal(JSON.stringify(doc.snapshot()), before); assert.equal(doc.version, version);
    }
    const inline = make([{type: "p", runs: [{type: "icon"}, {type: "icon"}]}], schema);
    assert.equal(readDocumentSlice(inline, {limit: 1, maxTextUnits: 1}).counts.textUnits, 0);
});

test("canonical group boundaries fail closed when live edit paths differ after a type change", () => {
    for (const constrained of [false, true]) {
        const schema: Schema = {root: "doc", marks: [], nodes: {
            doc: {shape: "flow", children: ["p", "list"], default: "p", ...(constrained ? {childRules: {list: {max: 1}}} : {})}, p: {shape: "text"},
            list: {shape: "group", children: ["a", "b"], by: ["color"]},
            a: {shape: "text", attrs: {color: {default: "red", values: ["red", "green"]}}},
            b: {shape: "text", attrs: {color: {default: "red", values: ["red", "blue"]}}},
        }};
        const doc = make([{type: "p", runs: []}, {type: "list", attrs: {color: "green"}, children: [{type: "a", runs: [{text: "A", marks: {}}]}]},
            {type: "list", attrs: {color: "red"}, children: [{type: "b", runs: [{text: "B", marks: {}}]}]}], schema);
        doc.edit([{op: "update", at: [1, 0], attrs: {type: "b"}}], {normalize: false});
        const expected = doc.toJSON();
        if (constrained) {
            assert.deepEqual(pages(doc), expected.children);
            assert.deepEqual(pages(doc, [1]), expected.children![1].children);
        } else {
            const project = Doc.prototype.projectVisibleBlock; let projections = 0;
            Doc.prototype.projectVisibleBlock = function(block) { projections++; return project.call(this, block); };
            try { assert.throws(() => readDocumentSlice(doc), /Unsupported slice: canonical group boundaries/); }
            finally { Doc.prototype.projectVisibleBlock = project; }
            assert.equal(projections, 0);
        }
    }
});

test("streaming JSON bytes match UTF-8 escaping, surrogate and nested-value oracles", async () => {
    const {JsonReadBudget} = await import("../src/crdt/read-budget.ts");
    const values = ["a\"\\\b\t\n\f\r\u0000한글😀\ud800\udfff", [null, true, false, 1.2, {x: "😀", y: ["한글", "\ud800"]}],
        {a: undefined, b: "\u001f", c: [], d: {x: 1, y: false}}];
    for (const value of values) {
        const expected = Buffer.byteLength(JSON.stringify(value), "utf8"), meter = new JsonReadBudget(expected);
        meter.value(value); assert.equal(meter.bytes, expected);
        assert.throws(() => new JsonReadBudget(expected - 1).value(value), /byte budget/);
    }
});

test("group indexes refuse an oversized unselected key before allocating JSON or models", () => {
    const schema: Schema = {root: "doc", marks: [], nodes: {
        doc: {shape: "flow", children: ["p", "list"], default: "p"}, p: {shape: "text"},
        list: {shape: "group", children: ["item"], by: ["key"]}, item: {shape: "text", attrs: {key: {default: ""}}},
    }};
    const huge = "x".repeat(1_000_000);
    const doc = make([{type: "p", runs: []}, {type: "list", attrs: {key: huge}, children: [{type: "item", runs: []}]}], schema);
    const before = JSON.stringify(doc.snapshot()), stringify = JSON.stringify, project = Doc.prototype.projectVisibleBlock;
    let projections = 0, oversizedStrings = 0;
    JSON.stringify = function(value, ...args) {
        if (value === huge || Array.isArray(value) && (value.includes(huge) || value.some(item => Array.isArray(item) && item.includes(huge)))) {
            oversizedStrings++; throw Error("Unbounded key serialization");
        }
        return stringify(value, ...args as [never, never]);
    } as typeof JSON.stringify;
    Doc.prototype.projectVisibleBlock = function(block) { projections++; return project.call(this, block); };
    try { assert.throws(() => readDocumentSlice(doc, {limit: 1, maxBytes: 1024}), /byte budget/); }
    finally { JSON.stringify = stringify; Doc.prototype.projectVisibleBlock = project; }
    assert.equal(oversizedStrings, 0); assert.equal(projections, 0); assert.equal(JSON.stringify(doc.snapshot()), before);
});

test("preflight accepts exact canonical byte limits and rejects one byte less before projection", () => {
    const schema: Schema = {root: "doc", marks: ["bold"], markValues: {link: {default: ""}}, nodes: {
        doc: {shape: "flow", children: ["p"], default: "p"}, p: {shape: "text", children: ["icon", "link"]},
        icon: {shape: "inline", attrs: {payload: {default: null}}}, link: {shape: "span", mark: "link", attr: "url"},
    }};
    const doc = make([{type: "p", runs: [{text: '\"\\\n한글😀\ud800', marks: {}}, {text: "bold", marks: {bold: true}},
        {type: "link", attrs: {url: "value"}, runs: [{text: "link", marks: {}}]}, {type: "icon", attrs: {payload: {a: [null, "😀"]}}}]}], schema);
    readDocumentSlice(doc, {limit: 1});
    const exact = readDocumentSlice(doc, {limit: 1});
    assert.deepEqual(readDocumentSlice(doc, {limit: 1, maxBytes: exact.counts.bytes}).children, exact.children);
    const project = Doc.prototype.projectVisibleBlock; let projections = 0;
    Doc.prototype.projectVisibleBlock = function(block) { projections++; return project.call(this, block); };
    try { assert.throws(() => readDocumentSlice(doc, {limit: 1, maxBytes: exact.counts.bytes - 1}), /byte budget/); }
    finally { Doc.prototype.projectVisibleBlock = project; }
    assert.equal(projections, 0);
});


test("post-normalization model-only group minimum fails closed before projection", () => {
    const schema: Schema = {root: "doc", marks: [], nodes: {
        doc: {shape: "flow", children: ["p", "list"], default: "p", childRules: {list: {min: 2, max: 3}}}, p: {shape: "text"},
        list: {shape: "group", children: ["a", "b"], by: ["color"]},
        a: {shape: "text", attrs: {color: {default: "red", values: ["red", "green"]}}},
        b: {shape: "text", attrs: {color: {default: "red", values: ["red", "blue"]}}},
    }};
    const doc = make([{type: "p", runs: []}, {type: "list", attrs: {color: "green"}, children: [{type: "a", runs: [{text: "A", marks: {}}]}]},
        {type: "list", attrs: {color: "red"}, children: [{type: "b", runs: [{text: "B", marks: {}}]}]}], schema);
    doc.edit([{op: "update", at: [1, 0], attrs: {type: "b"}}], {normalize: false});
    const before = JSON.stringify(doc.snapshot()), project = Doc.prototype.projectVisibleBlock;
    let projections = 0;
    Doc.prototype.projectVisibleBlock = function(block) { projections++; return project.call(this, block); };
    try { assert.throws(() => readDocumentSlice(doc), /Unsupported slice: canonical (group boundaries|child minimum)/); }
    finally { Doc.prototype.projectVisibleBlock = project; }
    assert.equal(projections, 0); assert.equal(JSON.stringify(doc.snapshot()), before);
});


test("grid row, cell and body wrappers count toward the subtree depth limit", () => {
    const schema: Schema = {root: "doc", marks: [], nodes: {
        doc: {shape: "flow", children: ["p", "grid"], default: "p"}, p: {shape: "text"},
        grid: {shape: "grid", children: ["row"]}, row: {shape: "row", children: ["cell"]},
        cell: {shape: "cell", children: ["body"]}, body: {shape: "flow", children: ["p", "grid"], default: "p"},
    }};
    let node: NodeJSON = {type: "p", runs: []};
    for (let i = 0; i < 10; i++) node = {type: "grid", children: [{type: "row", children: [{type: "cell", children: [{type: "body", children: [node]}]}]}]};
    const doc = make([{type: "p", runs: []}, node], schema), before = JSON.stringify(doc.snapshot());
    const project = Doc.prototype.projectVisibleBlock; let projections = 0;
    Doc.prototype.projectVisibleBlock = function(block) { projections++; return project.call(this, block); };
    try { assert.throws(() => readDocumentSlice(doc, {start: 1, limit: 1}), /depth budget/); }
    finally { Doc.prototype.projectVisibleBlock = project; }
    assert.equal(projections, 0); assert.equal(JSON.stringify(doc.snapshot()), before);
});


test("depth limits include text, inline, span runs and empty grid body wrappers", () => {
    const schema: Schema = {root: "doc", marks: [], markValues: {link: {default: ""}}, nodes: {
        doc: {shape: "flow", children: ["p", "box"], default: "p"},
        box: {shape: "flow", children: ["p", "box", "grid"], default: "p"}, p: {shape: "text", children: ["icon", "link"]},
        icon: {shape: "inline"}, link: {shape: "span", mark: "link", attr: "url"},
        grid: {shape: "grid", children: ["row"]}, row: {shape: "row", children: ["cell"]},
        cell: {shape: "cell", children: ["body"]}, body: {shape: "flow", children: ["p"], default: "p", childRules: {p: {max: 0}}},
    }};
    const variants: Array<{depth: number; node: NodeJSON}> = [
        {depth: 32, node: {type: "p", runs: [{text: "x", marks: {}}]}},
        {depth: 32, node: {type: "p", runs: [{type: "icon"}]}},
        {depth: 31, node: {type: "p", runs: [{type: "link", attrs: {url: "url"}, runs: [{text: "x", marks: {}}]}]}},
        {depth: 30, node: {type: "grid", children: [{type: "row", children: [{type: "cell", children: [{type: "body", children: []}]}]}]}},
    ];
    for (const variant of variants) {
        let node = variant.node;
        for (let i = 0; i < variant.depth; i++) node = {type: "box", children: [node]};
        const doc = make([{type: "p", runs: []}, node], schema), before = JSON.stringify(doc.snapshot());
        const project = Doc.prototype.projectVisibleBlock; let projections = 0;
        Doc.prototype.projectVisibleBlock = function(block) { projections++; return project.call(this, block); };
        try { assert.throws(() => readDocumentSlice(doc, {start: 1, limit: 1}), /depth budget/); }
        finally { Doc.prototype.projectVisibleBlock = project; }
        assert.equal(projections, 0); assert.equal(JSON.stringify(doc.snapshot()), before);
    }
    let supported: NodeJSON = {type: "p", runs: [{text: "x", marks: {}}]};
    for (let i = 0; i < 31; i++) supported = {type: "box", children: [supported]};
    const doc = make([{type: "p", runs: []}, supported], schema);
    assert.deepEqual(readDocumentSlice(doc, {start: 1, limit: 1}).children[0].node, doc.toJSON().children![1]);
});
