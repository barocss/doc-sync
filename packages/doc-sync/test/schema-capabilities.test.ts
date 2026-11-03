import assert from "node:assert/strict";
import {test} from "node:test";
import type {GraphicSchema, Schema} from "../dist/index.js";
import {DocHub} from "../dist/server/hub.js";
import {SyncClient} from "../dist/sync/client.js";
import {CONTAINER_CAPABILITY, DOCUMENT_CAPABILITIES, PROTOCOL_VERSION} from "../dist/sync/protocol.js";
import type {ServerEvent, Transport} from "../dist/sync/protocol.js";

const document: Schema = {root: "doc", nodes: {doc: {shape: "flow", children: ["p"], default: "p"}, p: {shape: "text"}}, marks: []};
const graphic: GraphicSchema = {domain: "graphic", root: "canvas", nodes: {canvas: {shape: "container", children: ["object"]}, object: {shape: "atom"}}, marks: []};
function connected(schema: Schema) {
    let receive!: (event: ServerEvent) => void;
    const transport: Transport = {subscribe: (_since, handler) => {receive = handler; return () => {};}, send: async () => {}, sendPresence: () => {}};
    const client = new SyncClient("A", transport, {schema});
    client.connect();
    return {client, receive: (event: ServerEvent) => receive(event)};
}
function hello(schema?: Schema) {
    const event = new DocHub({schema}).hello(0);
    if (event.type !== "hello") throw new Error("Expected hello");
    return event;
}

test("legacy document hello retains protocol 3 and the original four capabilities", () => {
    assert.equal(PROTOCOL_VERSION, 3);
    assert.deepEqual(DOCUMENT_CAPABILITIES, ["placement-v1", "fields-v1", "annotations-v1", "cardinality-v1"]);
    const event = hello(document);
    assert.deepEqual(event.capabilities, DOCUMENT_CAPABILITIES);
    const {client, receive} = connected(document);
    receive(event);
    assert.equal(client.connectionError, null);
    assert.equal(client.schemaVerified, true);
    assert.equal(client.online, true);
    client.disconnect();
});

test("graphic hello requires and advertises container capability", () => {
    const event = hello(graphic);
    assert.deepEqual(event.capabilities, [...DOCUMENT_CAPABILITIES, CONTAINER_CAPABILITY]);
    const {client, receive} = connected(graphic);
    receive(event);
    assert.equal(client.connectionError, null);
    assert.equal(client.schemaVerified, true);
    assert.equal(client.online, true);
    assert.deepEqual(client.doc.toJSON(), {type: "canvas", children: []});
    client.disconnect();
});

test("graphic client rejects hello without container capability and retains local state", () => {
    const {client, receive} = connected(graphic);
    client.commit(client.doc.edit([{op: "insert", at: [0], content: [{type: "object"}]}]).ops);
    const before = client.doc.snapshot(), pending = structuredClone(client.pending);
    receive({...hello(graphic), capabilities: [...DOCUMENT_CAPABILITIES]});
    assert.equal(client.online, false);
    assert.match(client.connectionError!.message, /capabilities/);
    assert.deepEqual(client.doc.snapshot(), before);
    assert.deepEqual(client.pending, pending);
});

test("graphic client rejects an unverified schema-free server", () => {
    const {client, receive} = connected(graphic);
    const before = client.doc.snapshot();
    receive({...hello(), capabilities: [...DOCUMENT_CAPABILITIES, CONTAINER_CAPABILITY]});
    assert.equal(client.online, false);
    assert.equal(client.schemaVerified, false);
    assert.match(client.connectionError!.message, /schema version/);
    assert.deepEqual(client.doc.snapshot(), before);
});

test("legacy document client still accepts schema-free legacy capabilities", () => {
    const {client, receive} = connected(document);
    receive(hello());
    assert.equal(client.connectionError, null);
    assert.equal(client.schemaVerified, false);
    assert.equal(client.online, true);
    client.disconnect();
});
