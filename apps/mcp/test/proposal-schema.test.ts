import {test} from "node:test";
import assert from "node:assert/strict";
import {createProposalSchema} from "../src/proposal-schema.ts";
import {previewReplacement} from "../src/proposal-preview.ts";
const change = {kind: "replace_text" as const, path: [0], blockId: "block", start: 1, end: 3, replacement: "new"};
test("pure UTF16 preview matches independent string oracle and refuses scalar splits", () => {
    const text = "A😀BC", result = previewReplacement(text, change);
    assert.equal(result.preview.prefix + result.after + result.preview.suffix, text.slice(0, 1) + "new" + text.slice(3));
    for (const [start, end] of [[2, 3], [1, 2], [3, 2], [0, 6]]) assert.throws(() => previewReplacement(text, {...change, start: start!, end: end!}));
    for (const replacement of ["\n", "\r", "\u0085", "\u2028", "\u2029", "\ud800", "x".repeat(4097)]) assert.throws(() => previewReplacement(text, {...change, replacement}));
});
test("schema refuses authority fields, structural changes, deep paths and claimed check status", () => {
    const request = {requestId: "56fbd743-bdc3-44d3-b626-6dfb73ae7230", base: {generation: "g", epoch: "e", serverSeq: 0, schemaVersion: "v"}, change, explanation: "Reason", assumptions: [], questions: [], checks: []};
    assert.deepEqual(createProposalSchema.parse(request), request);
    for (const input of [{...request, actor: "foreign"}, {...request, url: "http://other"}, {...request, change: {...change, kind: "move"}}, {...request, change: {...change, path: [0, 0]}}, {...request, checks: [{reference: "a", status: "passed"}]}]) assert.throws(() => createProposalSchema.parse(input));
});
test("creator capability cannot be combined with write or owner decisions", async () => {
    const {parseHostedConfig} = await import("../src/hosted-config.ts");
    const base = {dataDir: "/tmp/proposal-config", hosts: ["local"], routes: [{tenant: "t", document: "d", slot: "s", actor: "a", upstreamDocument: "doc", upstream: "http://localhost"}], grants: [{id: "planner", principal: "p", token: "a".repeat(43), routes: ["/mcp/t/d/s"], permissions: ["read", "proposal_create"]}]};
    assert.equal(parseHostedConfig(base).proposals.enabled, false);
    for (const capability of ["write", "proposal_read", "proposal_decide"]) assert.throws(() => parseHostedConfig({...base, grants: [{...base.grants[0], permissions: ["read", "proposal_create", capability]}]}));
});
