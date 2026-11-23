import assert from "node:assert/strict";
import {test} from "node:test";
import {schemaVersion} from "@barocss/doc-sync";
import {DEMO_SCHEMA} from "../../../fixtures/demo-schema.ts";
import {parseBrief, verifyBrief} from "../src/brief.ts";
import type {Brief, Requirement} from "../src/brief.ts";

const revision = {epoch: "epoch-1", serverSeq: 12, schemaVersion: schemaVersion(DEMO_SCHEMA)};
const brief = (...requirements: Requirement[]): Brief => ({version: 1, objective: "Add the requested content.", requirements});
const exact = (text = "Confirmed exactly once.", path = [0]): Requirement => ({id: "confirmation", kind: "exact_text", path, text});
const paragraph = (text: string) => ({type: "paragraph", runs: [{text, marks: {}}]});
const document = (...children: unknown[]) => ({type: "content", children});
const check = (request: Brief, doc: unknown) => verifyBrief(request, doc, DEMO_SCHEMA, revision);

test("exact requirements reject the real-model truncated completion and extra copies", () => {
    assert.equal(check(brief(exact()), document(paragraph("Confirmed"))).status, "failed");
    assert.equal(check(brief(exact()), document(paragraph("Confirmed exactly once."))).status, "passed");
    assert.equal(check(brief(exact()), document(paragraph("Confirmed exactly once.Confirmed exactly once."))).status, "failed");
    assert.equal(check(brief(exact()), document(paragraph(" Confirmed exactly once."))).status, "failed");
});

test("verification reads only the selected model node, never metadata or unrelated descendants", () => {
    const request = brief(exact());
    assert.equal(check(request, document({...paragraph("Wrong"), attrs: {note: "Confirmed exactly once."}}, paragraph("Confirmed exactly once."))).status, "failed");
    assert.equal(check(request, document({type: "callout", children: [paragraph("Confirmed exactly once.")]})).status, "failed");
    assert.equal(check(brief(exact("Confirmed exactly once.", [0, 0])), document({type: "callout", children: [paragraph("Confirmed exactly once.")]})).status, "passed");
    assert.equal(check(brief(exact("", [0, 0])), document(paragraph(""))).status, "failed");
});

test("declared text spans and formatted runs preserve exact UTF-16 text", () => {
    const text = "A😀한글e\u0301";
    const doc = document({type: "paragraph", runs: [{text: "A\ud83d", marks: {}}, {type: "inline-hyperlink", attrs: {url: "https://example.com"}, runs: [{text: "\ude00한글", marks: {bold: true}}]}, {text: "e\u0301", marks: {}}]});
    assert.equal(check(brief(exact(text)), doc).status, "passed");
    assert.equal(check(brief(exact("A😀한글é")), doc).status, "failed");
});

test("inline atoms and undeclared spans cannot disappear into an exact-text pass", () => {
    for (const run of [{type: "inline-image", attrs: {src: "Confirmed exactly once."}}, {type: "invented", runs: [{text: ""}]}]) {
        assert.equal(check(brief(exact()), document({type: "paragraph", runs: [{text: "Confirmed exactly once."}, run]})).status, "failed");
    }
    assert.equal(check(brief(exact()), document({type: "paragraph", runs: [{text: "Confirmed exactly once.", type: "inline-image"}]})).status, "failed");
});

test("node checks verify explicit placement and schema ancestry", () => {
    const request = brief({id: "heading", kind: "node_type", path: [1], type: "heading2"});
    assert.equal(check(request, document(paragraph(""), {type: "heading2", runs: []})).status, "passed");
    assert.equal(check(request, document({type: "heading2", runs: []}, paragraph(""))).status, "failed");
    assert.equal(check(brief({id: "invalid", kind: "node_type", path: [0, 0], type: "heading2"}), document({type: "table", children: [{type: "heading2", runs: []}]})).status, "failed");
    assert.equal(check(brief({id: "root", kind: "node_type", path: [], type: "content"}), document()).status, "passed");
    assert.equal(check(request, {type: "invented", children: [paragraph(""), {type: "heading2", runs: []}]}).status, "failed");
});

test("manual requirements remain not_checked and failed evidence has priority", () => {
    const manual: Requirement = {id: "style", kind: "manual", description: "Review clarity."};
    const report = check(brief(exact(), manual), document(paragraph("Confirmed exactly once.")));
    assert.equal(report.status, "not_checked");
    assert.deepEqual(report.requirements.map(item => item.status), ["pass", "not_checked"]);
    assert.equal(check(brief(exact(), manual), document(paragraph("Confirmed"))).status, "failed");
    assert.equal(check(brief(manual), null).status, "not_checked");
});

test("brief parser rejects unknown fields, invalid paths, duplicates and all declared bounds", () => {
    const valid = brief(exact());
    const invalid = [null, {...valid, requirements: Array(1)}, brief({...exact(), path: Array(1)} as Requirement), {...valid, version: 2}, {...valid, extra: true}, {...valid, objective: " "}, {...valid, objective: "a".repeat(4001)}, {...valid, requirements: []}, {...valid, requirements: Array.from({length: 33}, (_, i) => ({...exact(), id: `r${i}`}))}, brief(exact(), exact()), brief({...exact(), id: "bad id"}), brief({...exact(), text: "a".repeat(8193)} as Requirement), brief({...exact(), path: [-1]} as Requirement), brief({...exact(), path: [0.5]} as Requirement), brief({...exact(), path: Array(65).fill(0)} as Requirement), brief({...exact(), unknown: "yes"} as unknown as Requirement), brief({id: "m", kind: "manual", description: ""}), brief({id: "n", kind: "node_type", path: [], type: ""})];
    for (const value of invalid) assert.throws(() => parseBrief(value));
    assert.equal(check(brief(exact("")), document(paragraph(""))).status, "passed");
});

test("brief and verification snapshots have independent ownership", () => {
    const input = brief(exact());
    const parsed = parseBrief(input);
    (input.requirements[0] as {path: number[]}).path.push(99);
    assert.deepEqual((parsed.requirements[0] as {path: number[]}).path, [0]);
    const doc = document(paragraph("Confirmed exactly once."));
    const sourceRevision = {...revision};
    const report = verifyBrief(parsed, doc, DEMO_SCHEMA, sourceRevision);
    sourceRevision.serverSeq = 99;
    doc.children.splice(0);
    parsed.requirements[0].id = "changed";
    assert.equal(report.checkedRevision.serverSeq, 12);
    assert.equal(report.requirements[0].id, "confirmation");
    assert.equal(report.status, "passed");
});

test("oversized or cyclic selected text fails closed and malformed revisions are rejected", () => {
    assert.equal(check(brief(exact()), document({type: "paragraph", runs: Array(16385).fill({text: ""})})).status, "failed");
    const run = {type: "inline-hyperlink", runs: [] as unknown[]}; run.runs.push(run);
    assert.equal(check(brief(exact()), document({type: "paragraph", runs: [run]})).status, "failed");
    assert.throws(() => verifyBrief(brief(exact()), document(), DEMO_SCHEMA, {...revision, serverSeq: NaN}));
});


test("checked revision must bind to the supplied schema fingerprint", () => {
    for (const fingerprint of [null, "another-schema"]) {
        assert.throws(() => verifyBrief(brief(exact()), document(paragraph("Confirmed exactly once.")), DEMO_SCHEMA, {...revision, schemaVersion: fingerprint}), /schema version does not match/);
    }
    const differentSchema = {...DEMO_SCHEMA, marks: [...DEMO_SCHEMA.marks, "new-mark"]};
    assert.throws(() => verifyBrief(brief(exact()), document(paragraph("Confirmed exactly once.")), differentSchema, revision), /schema version does not match/);
});
const occurrences = (text: string, count: number, path: number[] = []): Requirement => ({id: "occurrences", kind: "text_occurrences", path, text, count});
const children = (types: string[], path: number[] = []): Requirement => ({id: "children", kind: "child_types", path, types});

test("subtree occurrence counts do not use metadata or copies elsewhere", () => {
    const doc = document({type: "callout", children: [paragraph("needle"), paragraph("needle")]}, paragraph("needle"));
    assert.equal(check(brief(occurrences("needle", 2, [0])), doc).status, "passed");
    assert.equal(check(brief(occurrences("needle", 1, [0])), doc).status, "failed");
    assert.equal(check(brief(occurrences("needle", 3)), doc).status, "passed");
    assert.equal(check(brief(occurrences("needle", 1, [3])), doc).status, "failed");
    assert.equal(check(brief(occurrences("needle", 0, [1])), document(paragraph("needle"), {...paragraph("other"), attrs: {note: "needle"}})).status, "passed");
});

test("occurrences use non-overlapping exact UTF-16 sequences with span joins and inline boundaries", () => {
    const doc = document({type: "paragraph", runs: [{text: "A\ud83d"}, {type: "inline-hyperlink", attrs: {url: "https://example.com"}, runs: [{text: "\ude00e\u0301"}]}, {text: "aaaa"}, {type: "inline-image", attrs: {src: "aa"}}, {text: "aa"}]});
    assert.equal(check(brief(occurrences("A😀e\u0301", 1)), doc).status, "passed");
    assert.equal(check(brief(occurrences("A😀é", 0)), doc).status, "passed");
    assert.equal(check(brief(occurrences("aa", 3)), doc).status, "passed");
    assert.equal(check(brief(occurrences("aaa", 1)), doc).status, "passed");
    assert.equal(check(brief(occurrences("aaaaaa", 0)), doc).status, "passed");
    assert.equal(check(brief(occurrences("ab", 0)), document(paragraph("a"), paragraph("b"))).status, "passed");
    assert.equal(check(brief(occurrences("ab", 0)), document({type: "paragraph", runs: [{text: "a"}, {type: "inline-hyperlink", runs: [{type: "inline-image"}]}, {text: "b"}]})).status, "passed");
});

test("child type checks require exact order, duplicates, empty lists and a container path", () => {
    const doc = document(paragraph("a"), {type: "heading2", runs: []}, paragraph("b"));
    assert.equal(check(brief(children(["paragraph", "heading2", "paragraph"])), doc).status, "passed");
    assert.equal(check(brief(children(["paragraph", "paragraph", "heading2"])), doc).status, "failed");
    assert.equal(check(brief(children(["paragraph", "heading2"])), doc).status, "failed");
    assert.equal(check(brief(children([])), document()).status, "passed");
    assert.equal(check(brief(children([], [0])), document(paragraph(""))).status, "failed");
    assert.equal(check(brief(children([], [99])), doc).status, "failed");
});

test("canonical retained spanned cells remain in occurrence and child-type evidence", () => {
    const cell = (text: string, attrs: Record<string, unknown>) => ({type: "table-cell", attrs, children: [{type: "table-cell-body", children: [paragraph(text)]}]});
    const doc = document({type: "table", children: [{type: "table-row", children: [cell("visible", {colspan: 2, rowspan: 1}), cell("retained", {spanned: true})]}]});
    assert.equal(check(brief(occurrences("retained", 1)), doc).status, "passed");
    assert.equal(check(brief(occurrences("retained", 1, [0, 0, 1])), doc).status, "passed");
    assert.equal(check(brief(children(["table-cell", "table-cell"], [0, 0])), doc).status, "passed");
});

test("new checks reject malformed, non-finite, cyclic and oversized whole-model inputs", () => {
    const cyclic = document(); cyclic.children.push(cyclic);
    const badArray: unknown[] = [];
    let accessorRead = false;
    Object.defineProperty(badArray, "0", {get: () => {accessorRead = true; throw Error("Accessor must not execute");}, enumerable: true});
    const malformed = [
        cyclic, document({type: "paragraph", runs: badArray}), document(paragraph("good"), {type: "invented"}),
        document({...paragraph("good"), attrs: {bad: Infinity}}),
        document({...paragraph("good"), runs: [{text: 1}]}),
        document({type: "paragraph", runs: [{text: "good", type: "inline-image"}]}),
        document({type: "paragraph", runs: [{type: "invented", runs: []}]}),
        document({type: "paragraph", runs: [{type: "inline-image", runs: []}]}),
        document({...paragraph("good"), children: []}),
        document(paragraph("x".repeat(1024 * 1024 + 1))),
        document(...Array.from({length: 16385}, () => paragraph(""))),
        document({type: "table", children: [{type: "paragraph", runs: []}]}),
        document({type: "paragraph", runs: Array(1)}),
    ];
    for (const doc of malformed) {
        assert.equal(check(brief(occurrences("good", 0)), doc).status, "failed");
        assert.equal(check(brief(children([])), doc).status, "failed");
    }
    assert.equal(accessorRead, false);
});

test("new brief fields have finite integer, nonempty needle, list and aggregate limits", () => {
    const invalid = [
        occurrences("", 0), occurrences("a", -1), occurrences("a", 0.5), occurrences("a", Infinity), occurrences("a", NaN), occurrences("a", 1048577),
        {...occurrences("a", 1), count: "1"}, {...occurrences("a", 1), path: [Infinity]}, {...occurrences("a", 1), text: "x".repeat(8193)},
        children([""]), children([" "]), children(["a".repeat(121)]), children(Array(1025).fill("paragraph")), {...children([]), types: Array(1)},
        {...children([]), unknown: true}, {...occurrences("a", 1), regex: "a+"},
    ];
    for (const requirement of invalid) assert.throws(() => parseBrief(brief(requirement as Requirement)));
    assert.throws(() => parseBrief(brief(...Array.from({length: 32}, (_, i) => ({...children(Array(1024).fill("a".repeat(120))), id: `r${i}`})))));
    assert.equal(parseBrief(brief(occurrences(" ", 0))).requirements.length, 1);
    // All legacy v1 limits remain valid, even when JSON escaping exceeds the extension budget.
    assert.equal(parseBrief(brief(...Array.from({length: 32}, (_, i) => ({...exact("\u0000".repeat(8192)), id: `old${i}`})))).requirements.length, 32);
});

test("new checks and parse roundtrip preserve ownership, manual priority, schema and input data", () => {
    const request = brief(occurrences("needle", 1), children(["paragraph"]), {id: "manual", kind: "manual", description: "Review"});
    const doc = document(paragraph("needle"));
    const schemaBefore = JSON.stringify(DEMO_SCHEMA), docBefore = JSON.stringify(doc);
    const restored = parseBrief(JSON.parse(JSON.stringify(parseBrief(request))));
    assert.deepEqual(restored, request);
    assert.equal(check(restored, doc).status, "not_checked");
    assert.equal(check(restored, document(paragraph("needle needle"))).status, "failed");
    assert.equal(JSON.stringify(DEMO_SCHEMA), schemaBefore); assert.equal(JSON.stringify(doc), docBefore);
    (restored.requirements[1] as {types: string[]}).types.push("heading2");
    assert.deepEqual((request.requirements[1] as {types: string[]}).types, ["paragraph"]);
    assert.throws(() => verifyBrief(request, doc, DEMO_SCHEMA, {...revision, schemaVersion: null}), /schema version/);
});
