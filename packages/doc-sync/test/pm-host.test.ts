import assert from "node:assert/strict";
import {test} from "node:test";
import {TextSelection} from "prosemirror-state";
import {PmHostBinding, PmBinding, buildPmSchema} from "../../doc-sync-prosemirror/dist/index.js";
import {createSyncClientEditorHost} from "../../doc-sync-core/dist/editor/index.js";
import {Doc} from "../../doc-sync-core/dist/crdt/doc.js";
import type {EditorHost} from "../../doc-sync-core/dist/editor/index.js";
import {MemoryNet} from "./harness.ts";

// A consumer sees only the public contract. Concrete backend fields are inaccessible.
function hostOnly(source: EditorHost): EditorHost {
    return new Proxy(source, {get(target, key, receiver) {
        if (!(key in target)) throw new Error(`Non-contract backend access: ${String(key)}`);
        return Reflect.get(target, key, receiver);
    }});
}

test("PM Host consumes the contract for local, remote, history and presence; legacy client identity remains exact", async t => {
    const net = new MemoryNet();
    const a = net.add("pm-host-a"), b = net.add("pm-host-b");
    a.connect(); b.connect(); await net.settle();
    t.after(() => { a.disconnect(); b.disconnect(); });
    const info = buildPmSchema(a.schema);
    const host = hostOnly(createSyncClientEditorHost(a));
    const binding = new PmHostBinding(host, info);
    const remote = new PmBinding(b, info);
    t.after(() => { binding.dispose(); remote.dispose(); });
    assert.equal(remote.client, b);
    assert.equal(binding.host, host);
    binding.dispatch(binding.state.tr.insertText("hello", 1));
    await net.settle();
    assert.equal(remote.state.doc.textContent, "hello");
    remote.dispatch(remote.state.tr.insertText("!", 6));
    await net.settle();
    assert.equal(binding.state.doc.textContent, "hello!");
    binding.undo(); await net.settle();
    assert.equal(binding.state.doc.textContent, "!");
    binding.redo(); await net.settle();
    assert.equal(binding.state.doc.textContent, "hello!");
    const anchor = host.captureAnchor([0, 2]);
    assert.ok(anchor);
    assert.deepEqual(host.locateAnchor(anchor, "retained"), [0, 2]);
    a.others.set(b.actor, {actor: b.actor, name: "Peer", color: "blue", anchor, focus: null});
    const cursor = binding.cursorPlugin();
    assert.ok(cursor.props.decorations?.call(cursor, binding.state));
});

test("PM Host keeps app observers additive and releases only its own observer", async t => {
    const net = new MemoryNet();
    const client = net.add("pm-host-observers");
    client.connect(); await net.settle(); t.after(() => client.disconnect());
    let appCalls = 0;
    client.onModelEvents = () => { appCalls++; };
    const host = createSyncClientEditorHost(client);
    const first = new PmHostBinding(hostOnly(host), buildPmSchema(client.schema));
    const second = new PmHostBinding(hostOnly(host), buildPmSchema(client.schema));
    t.after(() => { first.dispose(); second.dispose(); });
    let firstPulls = 0, secondPulls = 0;
    first.onChange = () => { firstPulls++; };
    second.onChange = () => { secondPulls++; };
    client.onModelEvents?.([], {cause: "remote", fallback: false});
    assert.deepEqual([appCalls, firstPulls, secondPulls], [1, 1, 1]);
    first.dispose();
    client.onModelEvents?.([], {cause: "remote", fallback: false});
    assert.deepEqual([appCalls, firstPulls, secondPulls], [2, 1, 2]);
    second.dispose();
    client.onModelEvents?.([], {cause: "remote", fallback: false});
    assert.deepEqual([appCalls, firstPulls, secondPulls], [3, 1, 2]);
});

test("a failing app callback cannot leave PM behind an accepted remote edit", async t => {
    const net = new MemoryNet(), a = net.add("pm-host-error-a"), b = net.add("pm-host-error-b");
    a.connect(); b.connect(); await net.settle();
    t.after(() => { a.disconnect(); b.disconnect(); });
    const failure = new Error("app model notification failed");
    a.onModelEvents = () => { throw failure; };
    const binding = new PmHostBinding(createSyncClientEditorHost(a), buildPmSchema(a.schema));
    t.after(() => binding.dispose());
    b.commit(b.doc.edit([{op: "insert", at: [0, 0], content: "remote"}]).ops);
    await assert.rejects(net.settle(), error => error === failure);
    assert.equal(binding.state.doc.textContent, "remote");
    assert.deepEqual(a.doc.toJSON(), b.doc.toJSON());
    // Ordinary notifications propagate to the caller. Only accepted conditional
    // finalization captures notificationErrors. Preserve that existing contract.
    assert.deepEqual(a.notificationErrors, []);
    a.onModelEvents = null;
    await net.settle();
});

test("PM Host invalidates equal-revision model generations and preserves deleteRange no-op versus fallback", async t => {
    const net = new MemoryNet();
    const client = net.add("pm-host-cache");
    client.connect(); await net.settle(); t.after(() => client.disconnect());
    const source = createSyncClientEditorHost(client);
    let deleteResult: ReturnType<EditorHost["deleteRange"]> = [];
    let deletes = 0, applies = 0;
    const host: EditorHost = {...source,
        deleteRange: () => { deletes++; return deleteResult; },
        apply: edits => { applies++; return source.apply(edits); },
    };
    const binding = new PmHostBinding(hostOnly(host), buildPmSchema(client.schema));
    t.after(() => binding.dispose());
    // Two paragraphs create a cross-block range rather than the adjacent join case.
    source.apply([{op: "insert", at: [0, 0], content: "abc"}, {op: "split", at: [0, 3]}, {op: "insert", at: [1, 0], content: "def"}]);
    binding.pull();
    const transaction = binding.state.tr.delete(2, 7);
    // Isolate translation: reconciliation would correctly repair this intentional backend no-op.
    const translate = (binding as unknown as {translate(step: typeof transaction.steps[number], before: typeof transaction.doc, after: typeof transaction.doc): unknown}).translate.bind(binding);
    const beforeApplies = applies;
    assert.deepEqual(translate(transaction.steps[0], binding.state.doc, transaction.doc), []);
    assert.equal(deletes, 1); assert.equal(applies, beforeApplies);
    deleteResult = null;
    translate(transaction.steps[0], binding.state.doc, transaction.doc);
    assert.equal(deletes, 2); assert.ok(applies > beforeApplies);
    const seed = new Doc("replacement", client.schema);
    seed.edit([{op: "insert", at: [0, 0], content: "reset"}]);
    // Adapter stamps use identity even when a replacement has the same numeric revision.
    Object.defineProperty(seed, "version", {value: client.doc.version, writable: true});
    client.doc = seed;
    binding.pull();
    assert.equal(binding.state.doc.textContent, "reset");
    binding.dispatch(binding.state.tr.setSelection(TextSelection.create(binding.state.doc, 2)));
});
