import assert from "node:assert/strict";
import {test} from "node:test";
import * as cmd from "../src/crdt/commands.ts";
import {Doc} from "../src/crdt/doc.ts";
import {compareTicket, keyOf} from "../src/crdt/ticket.ts";
import {DEMO_SCHEMA} from "../../../fixtures/demo-schema.ts";
import {MemoryNet} from "./harness.ts";
import type {NodeJSON, Op} from "../src/crdt/doc.ts";
import type {Ticket} from "../src/crdt/ticket.ts";
import type {SyncClient} from "../src/sync/client.ts";

// Independent edits are all authored before any delivery. Commit order changes
// server acceptance order, without reordering an actor's sequence or dependencies.
type Run = NonNullable<NodeJSON["runs"]>[number];
type Peers = Record<string, SyncClient>;
const r = (text: string, marks: Record<string, boolean> = {}): Run => ({text, marks});
const document = (...paragraphs: Run[][]): NodeJSON => ({
    type: "content", children: paragraphs.map(runs => ({type: "paragraph", runs})),
});
const m = (...runs: Run[]): NodeJSON => document(runs);
const plain = (text: string): NodeJSON => m(r(text));
const B = {bold: true}, I = {italic: true}, BI = {bold: true, italic: true};
const orders = [["A", "B"], ["B", "A"]] as const;
const p = (o: number) => ({b: 0, o});
const mark = (c: SyncClient, from: number, to: number, key = "bold", value = true) =>
    cmd.setMark(c.doc, p(from), p(to), key, value);
const del = (c: SyncClient, from: number, to: number) => cmd.deleteRange(c.doc, p(from), p(to));
const insert = (c: SyncClient, at: number, text: string) => cmd.insertText(c.doc, p(at), text, {});

const check = (net: MemoryNet, expected: NodeJSON, stage: string): void => {
    for (const [actor, doc] of [["server", net.hub.doc] as const, ...net.clients.map(c => [c.actor, c.doc] as const)]) {
        assert.deepEqual(doc.toJSON(), expected, stage + ": " + actor);
        assert.deepEqual(Doc.fromSnapshot("fresh", doc.snapshot(), DEMO_SCHEMA).toJSON(), expected, stage + ": snapshot " + actor);
    }
    net.clients.forEach(c => assert.equal(c.pending.length, 0, stage + ": pending " + c.actor));
};

const withNet = async (names: string[], text: string, body: (net: MemoryNet, peers: Peers, ids: Ticket[]) => Promise<void>) => {
    const net = new MemoryNet(), peers: Peers = {};
    try {
        for (const name of names) { peers[name] = net.add(name); peers[name].connect(); }
        await net.settle();
        peers[names[0]].commit(insert(peers[names[0]], 0, text));
        await net.settle();
        net.clients.forEach(c => c.clearHistory());
        await net.settle();
        check(net, plain(text), "seed");
        const ids = peers[names[0]].doc.textAt(p(0)).chars.map(c => c.id);
        for (const c of net.clients) assert.deepEqual(c.doc.textAt(p(0)).chars.map(c => c.id), ids, "same original IDs");
        await body(net, peers, ids);
    } finally { net.clients.forEach(c => c.disconnect()); }
};

const idsOf = (ops: Op[], kind: "set" | "del"): string[] =>
    ops.flatMap(op => op.t === kind ? op.ids.map(keyOf) : []);
const targets = (ops: Op[], kind: "set" | "del", ids: Ticket[]): void =>
    assert.deepEqual(idsOf(ops, kind), ids.map(keyOf), kind + ": original target IDs");
const insertion = (ops: Op[], text: string, origin: Ticket): Ticket => {
    const texts = ops.filter(op => op.t === "text");
    assert.equal(texts.length, 1);
    assert.equal(texts[0].text, text);
    assert.deepEqual(texts[0].origin, origin, "insertion references the original observed token");
    return texts[0].id;
};
const accepted = (net: MemoryNet, since: number): string[] => net.hub.log.slice(since).flatMap(e => e.change ? [e.change.actor] : []);
const commitOrdered = async (net: MemoryNet, peers: Peers, edits: Record<string, Op[]>, order: readonly string[]) => {
    const since = net.hub.serverSeq;
    order.forEach(actor => { assert.ok(edits[actor].length); peers[actor].commit(edits[actor]); });
    await net.settle();
    assert.deepEqual(accepted(net, since), order, "actual server acceptance order");
};
const action = async (net: MemoryNet, c: SyncClient, kind: "undo" | "redo", expected: NodeJSON, skip = false) => {
    const since = net.hub.serverSeq;
    c[kind]();
    await net.settle();
    assert.deepEqual(accepted(net, since), skip ? [] : [c.actor], kind + ": server acceptance");
    check(net, expected, kind + " " + c.actor);
};
const setOp = (ops: Op[]) => {
    const sets = ops.filter(op => op.t === "set");
    assert.equal(sets.length, 1);
    return sets[0];
};
const owns = (net: MemoryNet, id: Ticket, key: string, ticket: Ticket) => {
    for (const doc of [net.hub.doc, ...net.clients.map(c => c.doc)]) assert.deepEqual(doc.setTicket(id, key), ticket);
};

for (const range of [2, 1]) for (const editOrder of orders) for (const undoOrder of orders) {
    test("I01 delete/format/insert range=" + range + " server=" + editOrder.join("") + " undo=" + undoOrder.join(""), async () => {
        await withNet(["A", "B", "C"], "abc", async (net, c, ids) => {
            const edits = {A: del(c.A, 2, 3), B: mark(c.B, range, 3), C: insert(c.C, 2, "X")};
            targets(edits.A, "del", [ids[2]]); targets(edits.B, "set", ids.slice(range));
            insertion(edits.C, "X", ids[1]);
            const merged = range === 1 ? m(r("a"), r("b", B), r("X")) : plain("abX");
            const revived = range === 1 ? m(r("a"), r("b", B), r("X"), r("c", B)) : m(r("abX"), r("c", B));
            await commitOrdered(net, c, edits, editOrder[0] === "A" ? ["A", "B", "C"] : ["C", "B", "A"]);
            check(net, merged, "concurrent merge");
            await action(net, c[undoOrder[0]], "undo", undoOrder[0] === "A" ? revived : plain("abX"));
            await action(net, c[undoOrder[1]], "undo", plain("abXc"));
            const redoOrder = [...undoOrder].reverse();
            await action(net, c[redoOrder[0]], "redo", redoOrder[0] === "B" ? revived : plain("abX"));
            await action(net, c[redoOrder[1]], "redo", merged);
        });
    });
}

for (const editOrder of orders) for (const undoOrder of orders) {
    test("I02 overlapping deletions/insert server=" + editOrder.join("") + " undo=" + undoOrder.join(""), async () => {
        await withNet(["A", "B", "C"], "abcd", async (net, c, ids) => {
            const edits = {A: del(c.A, 1, 3), B: del(c.B, 2, 3), C: insert(c.C, 2, "X")};
            targets(edits.A, "del", ids.slice(1, 3)); targets(edits.B, "del", [ids[2]]);
            insertion(edits.C, "X", ids[1]);
            await commitOrdered(net, c, edits, editOrder[0] === "A" ? ["A", "B", "C"] : ["C", "B", "A"]);
            check(net, plain("aXd"), "concurrent merge");
            await action(net, c[undoOrder[0]], "undo", plain(undoOrder[0] === "A" ? "abXd" : "aXd"));
            await action(net, c[undoOrder[1]], "undo", plain("abXcd"));
            const redoOrder = [...undoOrder].reverse();
            await action(net, c[redoOrder[0]], "redo", plain(redoOrder[0] === "B" ? "abXd" : "aXd"));
            await action(net, c[redoOrder[1]], "redo", plain("aXd"));
        });
    });
}

for (const value of [true, false]) for (const editOrder of orders) for (const undoOrder of orders) {
    test("I03 observed later write value=" + value + " server=" + editOrder.join("") + " undo=" + undoOrder.join(""), async () => {
        await withNet(["A", "B", "C"], "abc", async (net, c, ids) => {
            const edits = {A: del(c.A, 2, 3), B: mark(c.B, 1, 3), C: insert(c.C, 2, "X")};
            targets(edits.A, "del", [ids[2]]); targets(edits.B, "set", ids.slice(1)); insertion(edits.C, "X", ids[1]);
            await commitOrdered(net, c, edits, editOrder[0] === "A" ? ["A", "B", "C"] : ["C", "B", "A"]);
            check(net, m(r("a"), r("b", B), r("X")), "concurrent merge");
            const later = mark(c.C, 1, 2, "bold", value);
            targets(later, "set", [ids[1]]);
            const ticket = setOp(later).at;
            await commitOrdered(net, c, {C: later}, ["C"]);
            const hidden = value ? m(r("a"), r("b", B), r("X")) : plain("abX");
            const revived = value ? m(r("a"), r("b", B), r("X"), r("c", B)) : m(r("abX"), r("c", B));
            const undone = value ? m(r("a"), r("b", B), r("Xc")) : plain("abXc");
            check(net, hidden, "later write observed by all");
            owns(net, ids[1], "bold", ticket);
            await action(net, c[undoOrder[0]], "undo", undoOrder[0] === "A" ? revived : hidden);
            owns(net, ids[1], "bold", ticket);
            await action(net, c[undoOrder[1]], "undo", undone);
            owns(net, ids[1], "bold", ticket);
            const redoOrder = [...undoOrder].reverse();
            await action(net, c[redoOrder[0]], "redo", redoOrder[0] === "B" ? revived : hidden);
            owns(net, ids[1], "bold", ticket);
            await action(net, c[redoOrder[1]], "redo", hidden);
            owns(net, ids[1], "bold", ticket);
        });
    });
}

for (const editOrder of orders) for (const undoOrder of orders) {
    test("I04 same-value winner/loser undo server=" + editOrder.join("") + " undo=" + undoOrder.join(""), async () => {
        await withNet(["A", "B"], "abc", async (net, c, ids) => {
            const edits = {A: mark(c.A, 1, 3), B: mark(c.B, 1, 3)};
            targets(edits.A, "set", ids.slice(1)); targets(edits.B, "set", ids.slice(1));
            assert.equal(setOp(edits.A).at.lamport, setOp(edits.B).at.lamport);
            assert.ok(compareTicket(setOp(edits.B).at, setOp(edits.A).at) > 0);
            await commitOrdered(net, c, edits, editOrder);
            const bold = m(r("a"), r("bc", B));
            check(net, bold, "B wins the same value");
            owns(net, ids[1], "bold", setOp(edits.B).at);
            for (const actor of undoOrder) await action(net, c[actor], "undo", actor === "A" && undoOrder[0] === "A" ? bold : plain("abc"), actor === "A");
            // The winner restores its observed prior value; a losing write is not re-elected.
            let expected = plain("abc");
            for (const actor of [...undoOrder].reverse()) {
                if (actor === "B") expected = bold;
                await action(net, c[actor], "redo", expected, actor === "A");
            }
        });
    });
}

for (const undoOrder of orders) {
    test("I05 causal insertion inherits marks undo=" + undoOrder.join(""), async () => {
        await withNet(["A", "B"], "abc", async (net, c, ids) => {
            const format = mark(c.A, 1, 3); targets(format, "set", ids.slice(1));
            await commitOrdered(net, c, {A: format}, ["A"]);
            check(net, m(r("a"), r("bc", B)), "A format observed");
            const input = cmd.insertText(c.B.doc, p(2), "X"); insertion(input, "X", ids[1]);
            await commitOrdered(net, c, {B: input}, ["B"]);
            const all = m(r("a"), r("bXc", B));
            check(net, all, "B insertion inherited bold");
            await action(net, c[undoOrder[0]], "undo", undoOrder[0] === "A" ? m(r("ab"), r("X", B), r("c")) : m(r("a"), r("bc", B)));
            await action(net, c[undoOrder[1]], "undo", plain("abc"));
            const redoOrder = [...undoOrder].reverse();
            await action(net, c[redoOrder[0]], "redo", redoOrder[0] === "B" ? m(r("ab"), r("X", B), r("c")) : m(r("a"), r("bc", B)));
            await action(net, c[redoOrder[1]], "redo", all);
        });
    });
}

for (const editOrder of orders) for (const undoOrder of orders) {
    test("I06 different mark keys server=" + editOrder.join("") + " undo=" + undoOrder.join(""), async () => {
        await withNet(["A", "B"], "abcd", async (net, c, ids) => {
            const edits = {A: mark(c.A, 1, 3), B: mark(c.B, 2, 4, "italic")};
            targets(edits.A, "set", ids.slice(1, 3)); targets(edits.B, "set", ids.slice(2));
            await commitOrdered(net, c, edits, editOrder);
            const all = m(r("a"), r("b", B), r("c", BI), r("d", I));
            const onlyItalic = m(r("ab"), r("cd", I)), onlyBold = m(r("a"), r("bc", B), r("d"));
            check(net, all, "both keys");
            await action(net, c[undoOrder[0]], "undo", undoOrder[0] === "A" ? onlyItalic : onlyBold);
            await action(net, c[undoOrder[1]], "undo", plain("abcd"));
            const redoOrder = [...undoOrder].reverse();
            await action(net, c[redoOrder[0]], "redo", redoOrder[0] === "A" ? onlyBold : onlyItalic);
            await action(net, c[redoOrder[1]], "redo", all);
        });
    });
}

test("I07 undo insertion preserves a causal child and restores current remote marks", async () => {
    await withNet(["A", "B"], "ab", async (net, c, ids) => {
        const x = insert(c.A, 1, "X"), xId = insertion(x, "X", ids[0]);
        await commitOrdered(net, c, {A: x}, ["A"]); check(net, plain("aXb"), "X observed by B");
        const y = insert(c.B, 2, "Y"), format = mark(c.B, 1, 2);
        insertion(y, "Y", xId); targets(format, "set", [xId]);
        await commitOrdered(net, c, {B: [...y, ...format]}, ["B"]);
        const formatted = m(r("a"), r("X", B), r("Yb"));
        check(net, formatted, "B child and mark");
        const ticket = setOp(format).at;
        await action(net, c.A, "undo", plain("aYb"));
        owns(net, xId, "bold", ticket);
        await action(net, c.A, "redo", formatted);
        owns(net, xId, "bold", ticket);
    });
});

for (const editOrder of orders) {
    test("I08 same-key true/false LWW server=" + editOrder.join(""), async () => {
        await withNet(["A", "B"], "abc", async (net, c, ids) => {
            const edits = {A: mark(c.A, 1, 3), B: mark(c.B, 1, 3, "bold", false)};
            targets(edits.A, "set", ids.slice(1)); targets(edits.B, "set", ids.slice(1));
            assert.equal(setOp(edits.A).at.lamport, setOp(edits.B).at.lamport);
            assert.ok(compareTicket(setOp(edits.B).at, setOp(edits.A).at) > 0);
            await commitOrdered(net, c, edits, editOrder);
            check(net, plain("abc"), "B false wins");
            ids.slice(1).forEach(id => owns(net, id, "bold", setOp(edits.B).at));
        });
    });
}

const linkModel = (url: string): NodeJSON => m({type: "inline-hyperlink", attrs: {url}, runs: [r("b")]});
const urls = ["https://zero.example", "https://one.example", "https://two.example"];
for (const undoActor of ["A", "Z"]) for (const undoFirst of [false, true]) {
    test("I09 unseen remote link competes with undo actor=" + undoActor + " undoFirst=" + undoFirst, async () => {
        await withNet(["A", "Z"], "b", async (net, c, ids) => {
            const remoteActor = undoActor === "A" ? "Z" : "A", u = c[undoActor], remote = c[remoteActor];
            const base = cmd.setLink(u.doc, p(0), p(1), urls[0]); targets(base, "set", ids);
            await commitOrdered(net, c, {[undoActor]: base}, [undoActor]);
            check(net, linkModel(urls[0]), "initial link observed");
            net.clients.forEach(client => client.clearHistory()); await net.settle();
            const own = cmd.setLink(u.doc, p(0), p(1), urls[1]); targets(own, "set", ids);
            await commitOrdered(net, c, {[undoActor]: own}, [undoActor]);
            check(net, linkModel(urls[1]), "own link observed before the independent phase");
            const later = cmd.setLink(remote.doc, p(0), p(1), urls[2]); targets(later, "set", ids);
            const since = net.hub.serverSeq;
            if (!undoFirst) remote.commit(later);
            u.undo(); // No delivery: this actor has not received the remote replacement.
            const undo = setOp(u.pending.at(-1)!.ops);
            targets([undo], "set", ids);
            assert.equal(undo.value, urls[0]);
            assert.equal(undo.at.lamport, setOp(later).at.lamport, "tie is real, not a manufactured Ticket");
            if (undoFirst) remote.commit(later);
            await net.settle();
            assert.deepEqual(accepted(net, since), undoFirst ? [undoActor, remoteActor] : [remoteActor, undoActor]);
            const undoWins = undoActor === "Z";
            assert.equal(compareTicket(undo.at, setOp(later).at) > 0, undoWins);
            check(net, linkModel(undoWins ? urls[0] : urls[2]), "ordinary LWW, not unconditional remote preservation");
            owns(net, ids[0], "link", undoWins ? undo.at : setOp(later).at);
            await action(net, u, "redo", linkModel(undoWins ? urls[1] : urls[2]), !undoWins);
        });
    });
}

for (const editOrder of orders) for (const undoOrder of orders) {
    test("I10 simultaneous Enter aliases server=" + editOrder.join("") + " undo=" + undoOrder.join(""), async () => {
        await withNet(["A", "B"], "abcd", async (net, c, ids) => {
            const edits = {A: cmd.splitBlock(c.A.doc, p(2)), B: cmd.splitBlock(c.B.doc, p(2))};
            const nodes = [edits.A, edits.B].map(ops => {
                const list = ops.filter(op => op.t === "node");
                assert.equal(list.length, 1); assert.deepEqual(list[0].origin, ids[1]);
                return list[0];
            });
            assert.equal(nodes[0].boundary, nodes[1].boundary, "same observed boundary");
            assert.notDeepEqual(nodes[0].id, nodes[1].id, "independent markers");
            await commitOrdered(net, c, edits, editOrder);
            const split = document([r("ab")], [r("cd")]);
            check(net, split, "both markers produce one boundary");
            await action(net, c[undoOrder[0]], "undo", split);
            await action(net, c[undoOrder[1]], "undo", plain("abcd"));
            for (const actor of [...undoOrder].reverse()) await action(net, c[actor], "redo", split);
        });
    });
}
