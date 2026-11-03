import assert from "node:assert/strict";
import {test} from "node:test";
import {createEditor as createSlateEditor} from "slate";
import {createEditor as createLexicalEditor} from "lexical";
import {canonical} from "../src/crdt/model.ts";
import type {NodeJSON} from "../src/crdt/model.ts";
import type {DocumentSchema} from "../src/crdt/schema.ts";
import {schemaVersion} from "../src/crdt/schema-version.ts";
import {inspectEditorSchema, inspectSpreadsheetSchema} from "../src/editor/schema-support.ts";
import type {EditorSchemaCapabilities} from "../src/editor/schema-support.ts";
import {buildPmSchema, toPmJSON, fromPmJSON} from "../../doc-sync-prosemirror/dist/index.js";
import {createTiptapExtensions} from "../../doc-sync-tiptap/dist/index.js";
import {toSlate, fromSlate} from "../../doc-sync-slate/dist/index.js";
import {buildLexicalSchema, toLexicalJSON, fromLexicalJSON, $toLexical, readLexicalModel} from "../../doc-sync-lexical/dist/index.js";

const schema: DocumentSchema = {domain: "document", root: "manuscript", marks: ["emphasis"], markValues: {citation: {default: ""}}, nodes: {
    manuscript: {shape: "flow", children: ["prose-line", "callout", "attachment"], default: "prose-line"},
    "prose-line": {shape: "text", attrs: {speaker: {default: "author"}, indent: {default: 0}}, children: ["mention"]},
    callout: {shape: "flow", children: ["prose-line"], default: "prose-line", attrs: {tone: {default: "info"}}},
    attachment: {shape: "atom", attrs: {asset: {default: ""}}},
    mention: {shape: "inline", attrs: {person: {default: ""}}},
}};
const semantic: EditorSchemaCapabilities = {domains: ["document"], shapes: ["flow", "text", "atom", "inline"], nodes: {
    manuscript: {mode: "semantic", nativeName: "document"},
    "prose-line": {mode: "semantic", nativeName: "paragraph", attrs: {speaker: "semantic", indent: "semantic"}},
    callout: {mode: "semantic", attrs: {tone: "semantic"}},
    attachment: {mode: "semantic", attrs: {asset: "semantic"}}, mention: {mode: "semantic", attrs: {person: "semantic"}},
}, marks: {emphasis: "semantic"}, markValues: {citation: "semantic"}};

test("editor preflight exposes explicit domain, shape, node, attr and mark handling", () => {
    assert.deepEqual(inspectEditorSchema(schema, semantic), {supported: true, semantic: true, schemaVersion: schemaVersion(schema), diagnostics: []});
    const incomplete = inspectEditorSchema(schema, {domains: ["graphic"], shapes: ["text"], nodes: {"prose-line": {mode: "opaque", attrs: {speaker: "preserve"}}}});
    assert.equal(incomplete.supported, false); assert.equal(incomplete.semantic, false);
    for (const [path, feature] of [["domain", "domain"], ["nodes.manuscript.shape", "shape"], ["nodes.manuscript", "node"], ["nodes.prose-line.attrs.indent", "attribute"], ["marks.emphasis", "mark"], ["markValues.citation", "markValue"]]) {
        assert.ok(incomplete.diagnostics.some(d => d.path === path && d.feature === feature && d.severity === "error"));
    }
    assert.ok(incomplete.diagnostics.some(d => d.path === "nodes.prose-line" && d.severity === "warning"));
});

test("opaque view profiles preserve model identity and distinguish data preservation from semantic rendering", () => {
    const before = structuredClone(schema);
    const opaque: EditorSchemaCapabilities = {...semantic, nodes: {...semantic.nodes, attachment: {mode: "opaque", attrs: {asset: "preserve"}}}};
    const a = inspectEditorSchema(schema, semantic), b = inspectEditorSchema(schema, opaque);
    assert.equal(b.supported, true); assert.equal(b.semantic, false);
    assert.equal(a.schemaVersion, b.schemaVersion); assert.equal(schemaVersion(schema), a.schemaVersion);
    assert.deepEqual(schema, before);
    const collision = inspectEditorSchema(schema, {...semantic, nodes: {...semantic.nodes, callout: {mode: "semantic", nativeName: "paragraph", attrs: {tone: "semantic"}}}});
    assert.equal(collision.supported, false); assert.ok(collision.diagnostics.some(d => d.feature === "nativeName"));
    assert.equal(inspectEditorSchema({...schema, root: "missing"}, semantic).diagnostics[0].feature, "schema");
});

const model = (): NodeJSON => canonical(schema, {type: "manuscript", children: [
    {type: "prose-line", attrs: {speaker: "reviewer", indent: 2}, runs: [{text: "Custom 😀", marks: {emphasis: true, citation: "ref:7"}}, {type: "mention", attrs: {person: "a"}}]},
    {type: "callout", attrs: {tone: "warning"}, children: [{type: "prose-line", runs: [{text: "Nested", marks: {}}]}]},
    {type: "attachment", attrs: {asset: "asset:abc"}},
]});

test("custom document names and attrs roundtrip through native ProseMirror, Slate and Lexical state", () => {
    const source = model();
    const info = buildPmSchema(schema);
    const native = info.pm.nodeFromJSON(toPmJSON(schema, source));
    native.check();
    assert.deepEqual(canonical(schema, fromPmJSON(info, schema, native.toJSON())), source);
    const slate = createSlateEditor(); slate.children = toSlate(schema, source);
    assert.deepEqual(canonical(schema, fromSlate(schema, slate.children)), source);
    const lexicalInfo = buildLexicalSchema(schema, {paragraph: "prose-line"});
    const editor = createLexicalEditor({nodes: lexicalInfo.nodes, onError: error => {throw error;}});
    editor.update(() => $toLexical(lexicalInfo, source), {discrete: true});
    assert.deepEqual(canonical(schema, readLexicalModel(editor, lexicalInfo)), source);
    assert.deepEqual(canonical(schema, fromLexicalJSON(lexicalInfo, toLexicalJSON(lexicalInfo, source))), source);
    // Tiptap consumes the same checked PM schema; custom types are exposed as extensions.
    assert.ok(createTiptapExtensions(schema).some(extension => extension.name === "prose_line"));
});

test("PM and Tiptap builders reject normalized name collisions and reserved native text before construction", () => {
    const collision: DocumentSchema = {root: "doc", marks: [], nodes: {doc: {shape: "flow", children: ["a-b", "a_b"], default: "a-b"}, "a-b": {shape: "text"}, a_b: {shape: "text"}}};
    for (const build of [buildPmSchema, createTiptapExtensions]) assert.throws(() => build(collision), /name collision/);
    assert.throws(() => buildPmSchema({root: "doc", marks: [], nodes: {doc: {shape: "flow", children: ["text"], default: "text"}, text: {shape: "text"}}}), /Invalid ProseMirror node name/);
});


test("tree preflight rejects invalid root shapes and unknown children without mutation", () => {
    for (const invalid of [
        {...schema, nodes: {...schema.nodes, manuscript: {shape: "atom" as const}}},
        {...schema, nodes: {...schema.nodes, manuscript: {shape: "flow" as const, children: ["missing"], default: "prose-line"}}},
    ]) {
        const before = structuredClone(invalid);
        const result = inspectEditorSchema(invalid, semantic);
        assert.equal(result.supported, false); assert.equal(result.semantic, false);
        assert.equal(result.schemaVersion, null);
        assert.ok(result.diagnostics.some(d => d.feature === "schema" && d.severity === "error"));
        assert.deepEqual(invalid, before);
    }
});

test("spreadsheet profiles separate semantic editing from preservation without changing schema identity", () => {
    const sheet = {domain: "spreadsheet", version: 1, fields: {caption: {type: "string", default: ""}, amount: {type: "number", default: 0, min: 0}, approved: {type: "boolean", default: false}, payload: {type: "scalar", default: null}}} as const;
    const before = structuredClone(sheet);
    const profile = {fields: {caption: {mode: "semantic", editorType: "string"}, amount: {mode: "semantic", editorType: "number"}, approved: {mode: "semantic", editorType: "boolean"}, payload: {mode: "semantic", editorType: "scalar"}}} as const;
    const semanticSheet = inspectSpreadsheetSchema(sheet, profile);
    assert.equal(semanticSheet.supported, true); assert.equal(semanticSheet.semantic, true);
    const opaqueSheet = inspectSpreadsheetSchema(sheet, {fields: {...profile.fields, payload: {mode: "opaque"}}});
    assert.equal(opaqueSheet.supported, true); assert.equal(opaqueSheet.semantic, false);
    assert.equal(opaqueSheet.schemaVersion, semanticSheet.schemaVersion);
    assert.ok(opaqueSheet.diagnostics.some(d => d.path === "fields.payload" && d.severity === "warning"));
    assert.deepEqual(sheet, before);
    const mismatch = inspectSpreadsheetSchema(sheet, {fields: {...profile.fields, amount: {mode: "semantic", editorType: "string"}, payload: {mode: "semantic", editorType: "number"}}});
    assert.equal(mismatch.supported, false);
    assert.deepEqual(mismatch.diagnostics.map(d => d.path), ["fields.amount.editorType", "fields.payload.editorType"]);
    const missing = inspectSpreadsheetSchema(sheet, {fields: {missing: {mode: "opaque"}}});
    assert.equal(missing.supported, false);
    assert.ok(missing.diagnostics.some(d => d.path === "fields.caption"));
    assert.ok(missing.diagnostics.some(d => d.path === "fields.missing"));
    const invalid = inspectSpreadsheetSchema({...sheet, fields: {...sheet.fields, amount: {type: "number", default: "bad"}}} as never, profile);
    assert.equal(invalid.supported, false); assert.equal(invalid.schemaVersion, null);
    const absentType = inspectSpreadsheetSchema(sheet, {fields: {...profile.fields, amount: {mode: "semantic"}}});
    assert.equal(absentType.supported, false); assert.equal(absentType.diagnostics[0].feature, "fieldType");
    const generic = inspectSpreadsheetSchema(sheet, {fields: {...profile.fields, amount: {mode: "semantic", editorType: "scalar"}}});
    assert.equal(generic.supported, true);
});


test("new tree preflight rejects content on atom descriptors and preserves valid UI and span mappings", () => {
    const invalid = {...schema, nodes: {...schema.nodes, attachment: {shape: "atom" as const, children: ["missing"]}}};
    const before = structuredClone(invalid);
    const result = inspectEditorSchema(invalid, semantic);
    assert.equal(result.supported, false); assert.equal(result.semantic, false);
    assert.match(result.diagnostics[0].message, /nodes.attachment.children.*atom/);
    assert.deepEqual(invalid, before);
    const spanSchema: DocumentSchema = {...schema, nodes: {...schema.nodes,
        "prose-line": {...schema.nodes["prose-line"], ui: {label: "Prose", placeholder: "Write"}},
        citationSpan: {shape: "span", mark: "citation", attr: "source", ui: {label: "Citation"}},
    }};
    const profile: EditorSchemaCapabilities = {...semantic, shapes: [...semantic.shapes, "span"], nodes: {...semantic.nodes, citationSpan: {mode: "semantic"}}};
    assert.equal(inspectEditorSchema(spanSchema, profile).supported, true);
});
