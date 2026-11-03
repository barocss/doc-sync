import assert from "node:assert/strict";
import {test} from "node:test";
import type {GraphicSchema} from "../dist/index.js";
import {buildPmSchema, toPmJSON, fromPmJSON, pmPosToPath, pathToPmPos, PmHostBinding, PmBinding} from "../../doc-sync-prosemirror/dist/index.js";
import {buildLexicalSchema, LexicalHostBinding, LexicalBinding, toLexicalJSON, fromLexicalJSON, readLexicalModel, $toLexical, $fromLexical, $createModelNode, $readModelNode, $lexicalSelection, $lexicalPoint, $setLexicalSelection} from "../../doc-sync-lexical/dist/index.js";
import {fromSlate, toSlate, SlateHostBinding, SlateBinding, slatePointToModel, modelPointToSlate, slateRangeToModel, modelRangeToSlate} from "../../doc-sync-slate/dist/index.js";
import {createTiptapExtensions} from "../../doc-sync-tiptap/dist/index.js";

const graphic: GraphicSchema = {domain: "graphic", root: "canvas", nodes: {canvas: {shape: "container", children: []}}, marks: []};
for (const [name, action] of [
    ["ProseMirror", () => buildPmSchema(graphic)],
    ["Lexical", () => buildLexicalSchema(graphic)],
    ["Slate export", () => toSlate(graphic, {type: "canvas", children: []})],
    ["Slate import", () => fromSlate(graphic, [])],
    ["Tiptap", () => createTiptapExtensions(graphic)],
] as const) test(`${name} rejects graphic schemas with an explicit canvas-binding error`, () => {
    assert.throws(action, /Graphic schemas require a canvas binding/);
});

// Fabricated metadata must not bypass domain checks or trigger native editor work.
const noAccess = new Proxy({}, {get: (_target, key) => {throw new Error(`Unexpected native access: ${String(key)}`);}});
const host = new Proxy({schema: graphic}, {get: (target, key) => {
    if (key === "schema") return target.schema;
    throw new Error(`Unexpected host access: ${String(key)}`);
}});
const lexicalInfo = new Proxy({schema: graphic}, {get: (target, key) => {
    if (key === "schema") return target.schema;
    throw new Error(`Unexpected schema info access: ${String(key)}`);
}});
for (const [name, action] of [
    ["PM export", () => toPmJSON(graphic, {type: "canvas", children: []})],
    ["PM import", () => fromPmJSON(noAccess as never, graphic, {type: "canvas"})],
    ["PM position import", () => pmPosToPath(graphic, noAccess as never, 0, {type: "canvas", children: []})],
    ["PM position export", () => pathToPmPos(graphic, noAccess as never, [0], {type: "canvas", children: []})],
    ["PM host", () => new PmHostBinding(host as never, noAccess as never)],
    ["PM client", () => new PmBinding(host as never, noAccess as never)],
    ["Lexical host with supplied info", () => new LexicalHostBinding(host as never, noAccess as never, {info: lexicalInfo as never})],
    ["Lexical client with supplied info", () => new LexicalBinding(host as never, noAccess as never, {info: lexicalInfo as never})],
    ["Slate point import", () => slatePointToModel(graphic, noAccess as never, noAccess as never)],
    ["Slate point export", () => modelPointToSlate(graphic, noAccess as never, [0])],
    ["Slate range import", () => slateRangeToModel(graphic, noAccess as never, null)],
    ["Slate range export", () => modelRangeToSlate(graphic, noAccess as never, null)],
    ["Lexical selection read", () => $lexicalSelection(lexicalInfo as never)],
    ["Lexical point mapping", () => $lexicalPoint(lexicalInfo as never, [0])],
    ["Lexical selection update", () => $setLexicalSelection(lexicalInfo as never, null)],
    ["Slate host", () => new SlateHostBinding(host as never, noAccess as never)],
    ["Slate client", () => new SlateBinding(host as never, noAccess as never)],
    ["Lexical export with supplied info", () => toLexicalJSON(lexicalInfo as never, {type: "canvas", children: []})],
    ["Lexical import with supplied info", () => fromLexicalJSON(lexicalInfo as never, noAccess as never)],
    ["Lexical read with supplied info", () => readLexicalModel(noAccess as never, lexicalInfo as never)],
    ["Lexical live export with supplied info", () => $toLexical(lexicalInfo as never, {type: "canvas", children: []})],
    ["Lexical live import with supplied info", () => $fromLexical(lexicalInfo as never)],
    ["Lexical node export with supplied info", () => $createModelNode(lexicalInfo as never, {type: "canvas", children: []})],
    ["Lexical node import with supplied info", () => $readModelNode(lexicalInfo as never, noAccess as never)],
] as const) test(`${name} rejects graphics before editor, host, or session access`, () => {
    assert.throws(action, /Graphic schemas require a canvas binding/);
});
