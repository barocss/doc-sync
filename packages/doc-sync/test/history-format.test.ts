import assert from "node:assert/strict";
import {test} from "node:test";
import * as cmd from "../src/crdt/commands.ts";
import {Doc} from "../src/crdt/doc.ts";
import {History} from "../src/crdt/history.ts";
import {DEMO_SCHEMA} from "../../../fixtures/demo-schema.ts";
import {MemoryNet} from "./harness.ts";
import type {NodeJSON} from "../src/crdt/doc.ts";
import type {SyncClient} from "../src/sync/client.ts";
import type {Ticket} from "../src/crdt/ticket.ts";

type Run = NonNullable<NodeJSON["runs"]>[number];
const r = (text: string, marks: Record<string, boolean> = {}): Run => ({text, marks});
const model = (...runs: Run[]): NodeJSON => ({type: "content", children: [{type: "paragraph", runs}]});
const plain = (text: string) => model(r(text));
const bold = {bold: true};
const pos = (o: number) => ({b: 0, o});
const format = (c: SyncClient, from: number, to: number, value: boolean, key = "bold") =>
    cmd.setMark(c.doc, pos(from), pos(to), key, value);
const owns = (net: MemoryNet, id: Ticket, key: string, ticket: Ticket) => {
    for (const doc of [net.hub.doc, ...net.clients.map(c => c.doc)]) assert.deepEqual(doc.setTicket(id, key), ticket);
};
const linkModel = (url: string | null): NodeJSON => url
    ? model({type: "inline-hyperlink", attrs: {url}, runs: [r("a")]}, r("b"))
    : plain("ab");
const checkpoint = async (net: MemoryNet, expected: NodeJSON, stage: string) => {
    await net.settle();
    for (const [actor, doc] of [["server", net.hub.doc] as const, ...net.clients.map(c => [c.actor, c.doc] as const)]) {
        assert.deepEqual(doc.toJSON(), expected, stage + ": " + actor);
        assert.deepEqual(Doc.fromSnapshot("fresh", doc.snapshot(), DEMO_SCHEMA).toJSON(), expected, stage + ": snapshot " + actor);
    }
    net.clients.forEach(c => assert.equal(c.pending.length, 0, stage + ": pending " + c.actor));
};
const setup = async (text: string, body: (net: MemoryNet, a: SyncClient, b: SyncClient) => Promise<void>) => {
    const net = new MemoryNet(), a = net.add("A"), b = net.add("B");
    try {
        a.connect(); b.connect(); await net.settle();
        a.commit(cmd.insertText(a.doc, pos(0), text), null);
        await checkpoint(net, plain(text), "seed without history");
        await body(net, a, b);
    } finally { a.disconnect(); b.disconnect(); }
};

test("HF01 sequential on/off undo/undo redo/redo and repeat", async () => {
    await setup("ab", async (net, a) => {
        a.commit(format(a, 0, 1, true));
        await checkpoint(net, model(r("a", bold), r("b")), "on");
        a.commit(format(a, 0, 1, false));
        await checkpoint(net, plain("ab"), "off");
        for (let cycle = 0; cycle < 3; cycle += 1) {
            a.undo(); await checkpoint(net, model(r("a", bold), r("b")), "undo off " + cycle);
            a.undo(); await checkpoint(net, plain("ab"), "undo on " + cycle);
            assert.equal(a.history.canUndo, false);
            a.redo(); await checkpoint(net, model(r("a", bold), r("b")), "redo on " + cycle);
            a.redo(); await checkpoint(net, plain("ab"), "redo off " + cycle);
            assert.equal(a.history.canRedo, false);
        }
    });
});

test("HF02 multiple same-key sets in one commit reverse together", async () => {
    await setup("ab", async (net, a) => {
        const on = format(a, 0, 1, true), off = format(a, 0, 1, false);
        a.commit([...on, ...off]);
        await checkpoint(net, plain("ab"), "one group on then off");
        for (let cycle = 0; cycle < 3; cycle += 1) {
            a.undo(); await checkpoint(net, plain("ab"), "undo both steps " + cycle);
            assert.equal(a.history.canUndo, false);
            a.redo(); await checkpoint(net, plain("ab"), "redo both steps " + cycle);
            assert.equal(a.history.canRedo, false);
        }
    });
});

test("HF03 overlapping ranges restore each target's different previous value", async () => {
    await setup("abcd", async (net, a) => {
        a.commit(format(a, 0, 2, true));
        await checkpoint(net, model(r("ab", bold), r("cd")), "ab on");
        a.commit(format(a, 1, 3, false));
        await checkpoint(net, model(r("a", bold), r("bcd")), "bc off");
        for (let cycle = 0; cycle < 2; cycle += 1) {
            a.undo(); await checkpoint(net, model(r("ab", bold), r("cd")), "undo bc off " + cycle);
            a.undo(); await checkpoint(net, plain("abcd"), "undo ab on " + cycle);
            a.redo(); await checkpoint(net, model(r("ab", bold), r("cd")), "redo ab on " + cycle);
            a.redo(); await checkpoint(net, model(r("a", bold), r("bcd")), "redo bc off " + cycle);
        }
    });
});

test("HF04 sequential overlapping different keys remain independent", async () => {
    await setup("abcd", async (net, a) => {
        const abBold = model(r("ab", bold), r("cd"));
        const both = model(r("a", bold), r("b", {bold: true, italic: true}), r("c", {italic: true}), r("d"));
        const last = model(r("a", bold), r("bc", {italic: true}), r("d"));
        a.commit(format(a, 0, 2, true)); await checkpoint(net, abBold, "bold ab");
        a.commit(format(a, 1, 3, true, "italic")); await checkpoint(net, both, "italic bc");
        a.commit(format(a, 1, 2, false)); await checkpoint(net, last, "bold b off");
        for (let cycle = 0; cycle < 2; cycle += 1) {
            a.undo(); await checkpoint(net, both, "undo b off");
            a.undo(); await checkpoint(net, abBold, "undo italic bc");
            a.undo(); await checkpoint(net, plain("abcd"), "undo bold ab");
            a.redo(); await checkpoint(net, abBold, "redo bold ab");
            a.redo(); await checkpoint(net, both, "redo italic bc");
            a.redo(); await checkpoint(net, last, "redo b off");
        }
    });
});

test("HF05 sequential link values and removal undo/redo", async () => {
    await setup("ab", async (net, a) => {
        const first = "https://one.example", second = "https://two.example";
        for (const url of [first, second, null]) {
            a.commit(cmd.setLink(a.doc, pos(0), pos(1), url));
            await checkpoint(net, linkModel(url), "link " + url);
        }
        for (let cycle = 0; cycle < 2; cycle += 1) {
            for (const url of [second, first, null]) {
                a.undo(); await checkpoint(net, linkModel(url), "undo link " + url);
            }
            for (const url of [first, second, null]) {
                a.redo(); await checkpoint(net, linkModel(url), "redo link " + url);
            }
        }
    });
});

test("HF06 sequential block types use the same ownership rule", async () => {
    await setup("ab", async (net, a) => {
        const expected = (type: string): NodeJSON => ({type: "content", children: [{type, runs: [r("ab")]}]});
        for (const type of ["heading1", "quote", "paragraph"]) {
            a.commit(cmd.setBlockType(a.doc, 0, type)); await checkpoint(net, expected(type), "type " + type);
        }
        for (let cycle = 0; cycle < 2; cycle += 1) {
            for (const type of ["quote", "heading1", "paragraph"]) {
                a.undo(); await checkpoint(net, expected(type), "undo type " + type);
            }
            for (const type of ["heading1", "quote", "paragraph"]) {
                a.redo(); await checkpoint(net, expected(type), "redo type " + type);
            }
        }
    });
});

for (const value of [true, false]) {
    test("HF07 observed remote partial same-key write survives local history value=" + value, async () => {
        await setup("abcd", async (net, a, b) => {
            const id = a.doc.textAt(pos(0)).chars[1].id;
            a.commit(format(a, 0, 2, true)); await checkpoint(net, model(r("ab", bold), r("cd")), "ab on");
            a.commit(format(a, 0, 2, false)); await checkpoint(net, plain("abcd"), "ab off");
            b.commit(format(b, 1, 2, value));
            const ticket = b.doc.setTicket(id, "bold")!;
            const remoteOnly = value ? model(r("a"), r("b", bold), r("cd")) : plain("abcd");
            const restored = value ? model(r("ab", bold), r("cd")) : model(r("a", bold), r("bcd"));
            await checkpoint(net, remoteOnly, "remote b observed");
            for (let cycle = 0; cycle < 2; cycle += 1) {
                a.undo(); await checkpoint(net, restored, "undo off; remote b protected"); owns(net, id, "bold", ticket);
                a.undo(); await checkpoint(net, remoteOnly, "undo on; remote b protected"); owns(net, id, "bold", ticket);
                a.redo(); await checkpoint(net, restored, "redo on; remote b protected"); owns(net, id, "bold", ticket);
                a.redo(); await checkpoint(net, remoteOnly, "redo off; remote b protected"); owns(net, id, "bold", ticket);
            }
        });
    });
}

test("HF08 same-value remote write between undo and redo remains authoritative", async () => {
    await setup("ab", async (net, a, b) => {
        const id = a.doc.textAt(pos(0)).chars[0].id, on = model(r("a", bold), r("b"));
        a.commit(format(a, 0, 1, true)); await checkpoint(net, on, "on");
        a.commit(format(a, 0, 1, false)); await checkpoint(net, plain("ab"), "off");
        a.undo(); await checkpoint(net, on, "undo off");
        b.commit(format(b, 0, 1, true));
        const ticket = b.doc.setTicket(id, "bold")!;
        await checkpoint(net, on, "same value, different remote Ticket");
        a.undo(); await checkpoint(net, on, "older undo skips remote"); owns(net, id, "bold", ticket);
        a.redo(); await checkpoint(net, on, "older redo skips remote"); owns(net, id, "bold", ticket);
        a.redo(); await checkpoint(net, on, "newer redo skips remote"); owns(net, id, "bold", ticket);
    });
});

test("HF09 remote different-key write survives sequential local undo/redo", async () => {
    await setup("ab", async (net, a, b) => {
        const id = a.doc.textAt(pos(0)).chars[0].id;
        const on = model(r("a", bold), r("b"));
        const italic = model(r("a", {italic: true}), r("b"));
        const both = model(r("a", {bold: true, italic: true}), r("b"));
        a.commit(format(a, 0, 1, true)); await checkpoint(net, on, "bold on");
        a.commit(format(a, 0, 1, false)); await checkpoint(net, plain("ab"), "bold off");
        b.commit(format(b, 0, 1, true, "italic"));
        const ticket = b.doc.setTicket(id, "italic")!;
        await checkpoint(net, italic, "remote italic");
        a.undo(); await checkpoint(net, both, "undo bold off"); owns(net, id, "italic", ticket);
        a.undo(); await checkpoint(net, italic, "undo bold on"); owns(net, id, "italic", ticket);
        a.redo(); await checkpoint(net, both, "redo bold on"); owns(net, id, "italic", ticket);
        a.redo(); await checkpoint(net, italic, "redo bold off"); owns(net, id, "italic", ticket);
    });
});

test("HF10 unrecorded same-actor write is not owned by earlier history steps", async () => {
    await setup("ab", async (net, a) => {
        const id = a.doc.textAt(pos(0)).chars[0].id, on = model(r("a", bold), r("b"));
        a.commit(format(a, 0, 1, true)); await checkpoint(net, on, "on");
        a.commit(format(a, 0, 1, false)); await checkpoint(net, plain("ab"), "off");
        a.commit(format(a, 0, 1, true), null);
        const ticket = a.doc.setTicket(id, "bold")!;
        assert.equal(ticket.actor, a.actor);
        await checkpoint(net, on, "unrecorded same actor write");
        for (const kind of ["undo", "undo", "redo", "redo"] as const) {
            a[kind](); await checkpoint(net, on, kind + " must not claim unrecorded write"); owns(net, id, "bold", ticket);
        }
    });
});

test("HF11 another History with the same actor does not transfer ownership", async () => {
    await setup("ab", async (net, a) => {
        const id = a.doc.textAt(pos(0)).chars[0].id, on = model(r("a", bold), r("b"));
        a.commit(format(a, 0, 1, true)); await checkpoint(net, on, "main on");
        a.commit(format(a, 0, 1, false)); await checkpoint(net, plain("ab"), "main off");
        const other = new History(), ops = format(a, 0, 1, true);
        other.record(ops, a.doc, {caretBefore: "", caretAfter: ""});
        a.commit(ops, null);
        await checkpoint(net, on, "other History writes on");
        let ticket = a.doc.setTicket(id, "bold")!;
        a.undo(); await checkpoint(net, on, "main off undo skips other"); owns(net, id, "bold", ticket);
        a.undo(); await checkpoint(net, on, "main on undo skips other"); owns(net, id, "bold", ticket);
        a.commit(other.undo(a.doc).ops, null);
        ticket = a.doc.setTicket(id, "bold")!;
        await checkpoint(net, plain("ab"), "other History undo off");
        a.redo(); await checkpoint(net, plain("ab"), "main on redo skips other undo"); owns(net, id, "bold", ticket);
        a.redo(); await checkpoint(net, plain("ab"), "main off redo skips other undo"); owns(net, id, "bold", ticket);
        a.commit(other.redo(a.doc).ops, null);
        await checkpoint(net, on, "other History redo on");
    });
});

test("HF12 a new record discards redo without breaking retained undo", async () => {
    await setup("ab", async (net, a) => {
        const on = model(r("a", bold), r("b")), branch = model(r("a", bold), r("b", {italic: true}));
        a.commit(format(a, 0, 1, true)); await checkpoint(net, on, "on");
        a.commit(format(a, 0, 1, false)); await checkpoint(net, plain("ab"), "off");
        a.undo(); await checkpoint(net, on, "undo off");
        a.undo(); await checkpoint(net, plain("ab"), "undo on");
        a.redo(); await checkpoint(net, on, "redo on");
        a.commit(format(a, 1, 2, true, "italic")); await checkpoint(net, branch, "new branch");
        assert.equal(a.history.canRedo, false);
        a.redo(); await checkpoint(net, branch, "discarded off cannot redo");
        a.undo(); await checkpoint(net, on, "undo branch");
        a.undo(); await checkpoint(net, plain("ab"), "undo retained on");
        a.redo(); await checkpoint(net, on, "redo retained on");
        a.redo(); await checkpoint(net, branch, "redo branch");
    });
});

test("HF13 clearHistory prevents old steps and starts a new valid chain", async () => {
    await setup("ab", async (net, a) => {
        const on = model(r("a", bold), r("b"));
        a.commit(format(a, 0, 1, true)); await checkpoint(net, on, "old on");
        a.commit(format(a, 0, 1, false)); await checkpoint(net, plain("ab"), "old off");
        a.clearHistory(); await checkpoint(net, plain("ab"), "clear");
        assert.equal(a.history.canUndo, false); assert.equal(a.history.canRedo, false);
        a.undo(); a.redo(); await checkpoint(net, plain("ab"), "cleared actions");
        a.commit(format(a, 0, 1, true)); await checkpoint(net, on, "new on");
        a.commit(format(a, 0, 1, false)); await checkpoint(net, plain("ab"), "new off");
        a.undo(); await checkpoint(net, on, "new off undo");
        a.undo(); await checkpoint(net, plain("ab"), "new on undo");
        assert.equal(a.history.canUndo, false);
        a.redo(); await checkpoint(net, on, "new on redo");
        a.redo(); await checkpoint(net, plain("ab"), "new off redo");
    });
});

test("HF14 DEPTH 100 eviction keeps only retained steps reversible", async () => {
    await setup("ab", async (net, a) => {
        const on = model(r("a", bold), r("b"));
        // 103 separate groups evict the first three; their final value is on.
        for (let step = 1; step <= 103; step += 1) a.commit(format(a, 0, 1, step % 2 === 1));
        await checkpoint(net, on, "103 records");
        for (let step = 1; step <= 100; step += 1) {
            a.undo(); await checkpoint(net, step % 2 === 1 ? plain("ab") : on, "retained undo " + step);
        }
        assert.equal(a.history.canUndo, false);
        a.undo(); await checkpoint(net, on, "evicted records cannot undo");
        for (let step = 1; step <= 100; step += 1) {
            a.redo(); await checkpoint(net, step % 2 === 1 ? plain("ab") : on, "retained redo " + step);
        }
        assert.equal(a.history.canRedo, false);
        a.redo(); await checkpoint(net, on, "redo exhausted");
    });
});

test("HF15 one group restores mixed per-target prior values", async () => {
    await setup("abc", async (net, a) => {
        const first = format(a, 0, 2, true), second = format(a, 1, 3, false);
        a.commit([...first, ...second]);
        const final = model(r("a", bold), r("bc"));
        await checkpoint(net, final, "group with overlapping target sets");
        for (let cycle = 0; cycle < 2; cycle += 1) {
            a.undo(); await checkpoint(net, plain("abc"), "undo overlapping group");
            assert.equal(a.history.canUndo, false);
            a.redo(); await checkpoint(net, final, "redo overlapping group");
        }
    });
});

test("HF16 undo restoring a remote prior value does not revive an older local claim", async () => {
    await setup("ab", async (net, a, b) => {
        const on = model(r("a", bold), r("b"));
        a.commit(format(a, 0, 1, true)); await checkpoint(net, on, "older local on");
        b.commit(format(b, 0, 1, true)); await checkpoint(net, on, "remote same-value on observed");
        a.commit(format(a, 0, 1, false)); await checkpoint(net, plain("ab"), "newer local off");
        a.undo(); await checkpoint(net, on, "restore observed remote prior value");
        const ticket = a.doc.setTicket(a.doc.textAt(pos(0)).chars[0].id, "bold")!;
        a.undo(); await checkpoint(net, on, "older local on undo must skip");
        owns(net, a.doc.textAt(pos(0)).chars[0].id, "bold", ticket);
        a.redo(); await checkpoint(net, on, "older local redo must skip");
        a.redo(); await checkpoint(net, plain("ab"), "newer local off redo remains valid");
    });
});

test("HF17 a same-key branch discards redo and preserves the older live claim", async () => {
    await setup("ab", async (net, a) => {
        const on = model(r("a", bold), r("b"));
        a.commit(format(a, 0, 1, true)); await checkpoint(net, on, "older on");
        a.commit(format(a, 0, 1, false)); await checkpoint(net, plain("ab"), "old off");
        a.undo(); await checkpoint(net, on, "undo old off");
        assert.equal(a.history.canRedo, true);
        a.commit(format(a, 0, 1, false)); await checkpoint(net, plain("ab"), "new same-key off branch");
        assert.equal(a.history.canRedo, false);
        a.redo(); await checkpoint(net, plain("ab"), "discarded old off cannot redo");
        a.undo(); await checkpoint(net, on, "undo new off");
        a.undo(); await checkpoint(net, plain("ab"), "undo retained older on");
        assert.equal(a.history.canUndo, false);
        a.redo(); await checkpoint(net, on, "redo retained older on");
        a.redo(); await checkpoint(net, plain("ab"), "redo new off branch");
        assert.equal(a.history.canRedo, false);
    });
});

test("HF18 a same-value remote write after undo survives partial redo/undo", async () => {
    await setup("ab", async (net, a, b) => {
        const id = a.doc.textAt(pos(0)).chars[1].id;
        const partial = model(r("a", bold), r("b"));
        a.commit(format(a, 0, 2, true)); await checkpoint(net, model(r("ab", bold)), "both on");
        a.undo(); await checkpoint(net, plain("ab"), "both successfully undone");
        b.commit(format(b, 1, 2, false));
        const ticket = b.doc.setTicket(id, "bold")!;
        await checkpoint(net, plain("ab"), "remote same-value b off observed");
        for (let cycle = 0; cycle < 3; cycle += 1) {
            a.redo(); await checkpoint(net, partial, "partial redo " + cycle); owns(net, id, "bold", ticket);
            a.undo(); await checkpoint(net, plain("ab"), "partial undo " + cycle); owns(net, id, "bold", ticket);
        }
    });
});
