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
