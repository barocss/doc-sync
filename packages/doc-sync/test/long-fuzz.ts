import assert from "node:assert/strict";
import {mkdir, writeFile} from "node:fs/promises";
import {dirname} from "node:path";
import {pathToFileURL} from "node:url";
import * as cmd from "../src/crdt/commands.ts";
import {DEMO_SCHEMA} from "../../../fixtures/demo-schema.ts";
import {MemoryNet, rng} from "./harness.ts";
import type {Envelope} from "../src/sync/protocol.ts";

/** A bounded in-memory replay test. It does not claim disk durability or lease recovery. */
export const runLongFuzz = async (options: {ops: number; peers: number; seed: number}) => {
    const startedAt = new Date().toISOString();
    const random = rng(options.seed);
    const counters = {wireOps: 0, changes: 0, batches: 0, snapshotJoins: 0, replayRestarts: 0, gcEntries: 0, duplicateSubmissions: 0};
    assert.ok(Number.isSafeInteger(options.ops) && options.ops >= 64, "ops must be an integer >= 64");
    assert.ok(Number.isSafeInteger(options.peers) && options.peers >= 2 && options.peers <= 16, "peers must be 2..16");
    assert.ok(Number.isSafeInteger(options.seed) && options.seed >= 1, "seed must be a positive integer");

    while (counters.wireOps < options.ops) {
        let net = new MemoryNet();
        let epoch = 0;
        const watch = () => {
            net.hub.onAppend = envelope => {
                if (envelope.change) {
                    counters.wireOps += envelope.change.ops.length;
                    counters.changes += 1;
                } else counters.gcEntries += 1;
            };
        };
        const join = () => Array.from({length: options.peers}, (_, i) => {
            const client = net.add(`batch${counters.batches}_epoch${epoch}_peer${i}`);
            client.connect();
            counters.snapshotJoins += 1;
            return client;
        });
        watch();
        let clients = join();
        await net.settle();
        const target = Math.min(options.ops, counters.wireOps + 512);
        let turns = 0;
        let restarted = false;
        const compare = () => clients.forEach(client => {
            assert.deepEqual(client.doc.toJSON(), net.hub.doc.toJSON(), `seed ${options.seed}, batch ${counters.batches}, turn ${turns}, actor ${client.actor}`);
            assert.equal(client.pending.length, 0);
        });

        while (counters.wireOps < target) {
            const client = clients[Math.floor(random() * clients.length)];
            const texts = client.doc.blocks().flatMap((block, b) => block.kind === "text" ? [{block, b}] : []);
            const {block, b} = texts[Math.floor(random() * texts.length)];
            const offset = Math.floor(random() * (block.chars.length + 1));
            const roll = random();

            if (roll < 0.48 || !block.chars.length) {
                client.commit(cmd.insertText(client.doc, {b, o: offset}, random() < 0.5 ? "가" : "x"));
            } else if (roll < 0.76) {
                const at = Math.min(offset, block.chars.length - 1);
                client.commit(cmd.deleteRange(client.doc, {b, o: at}, {b, o: at + 1}));
            } else if (roll < 0.88) {
                client.commit(cmd.setMark(client.doc, {b, o: 0}, {b, o: block.chars.length}, "bold", random() < 0.5));
            } else if (texts.length < 12) {
                client.commit(cmd.splitBlock(client.doc, {b, o: offset}));
            } else if (client.history.canUndo) client.undo();
            else client.commit(cmd.insertText(client.doc, {b, o: offset}, "z"));

            turns += 1;
            // Deliver only some queues between bursts. Each actor's FIFO is preserved.
            if (turns % 3 === 0) net.up();
            if (turns % 5 === 0) net.down(clients[Math.floor(random() * clients.length)].actor);
            if (turns % 16 === 0) {
                await net.settle();
                compare();
                const last = [...net.hub.log].reverse().find(envelope => envelope.change);
                if (last?.change) {
                    const snapshot = net.hub.doc.snapshot();
                    assert.equal(net.hub.submit(last.change), null);
                    assert.deepEqual(net.hub.doc.snapshot(), snapshot);
                    counters.duplicateSubmissions += 1;
                }
                clients.forEach(c => c.history.clear());
                // Refresh ack pins after dropping history.
                clients.forEach(c => net.hub.ack({actor: c.actor, serverSeq: c.serverSeq, pin: null}));
                net.hub.gc();
                await net.settle();
                compare();
            }
            if (!restarted && turns >= 32) {
                await net.settle();
                compare();
                // Serialize the complete accepted log before replacing the hub and peers.
                const durableLog: Envelope[] = JSON.parse(JSON.stringify(net.hub.log));
                const model = net.hub.doc.toJSON();
                clients.forEach(c => c.disconnect());
                net = new MemoryNet();
                for (const envelope of durableLog) {
                    if (envelope.change) net.hub.submit(envelope.change);
                    else net.hub.replayGc(envelope.gc);
                }
                assert.deepEqual(net.hub.doc.toJSON(), model, "complete-log replay preserves the model");
                assert.deepEqual(net.hub.log, durableLog);
                epoch += 1;
                watch();
                clients = join();
                await net.settle();
                compare();
                counters.replayRestarts += 1;
                restarted = true;
            }
        }
        await net.settle();
        compare();
        clients.forEach(c => c.disconnect());
        counters.batches += 1;
    }
    assert.ok(counters.replayRestarts > 0 && counters.snapshotJoins >= options.peers * 2);
    return {
        passed: true, startedAt, completedAt: new Date().toISOString(), options, counters,
        coverage: ["eight-peer configuration supported", "causally ordered delayed delivery", "duplicate Change rejection", "stable GC model checks", "JSON complete-log hub replacement", "fresh-peer snapshot joins"],
        excluded: ["expired-lease history discard and snapshot recovery", "disk/process crash durability", "long-lived single-document million-op history", "OS IME", "two-week CI observation"],
    };
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    const args = process.argv.slice(2);
    const value = (name: string, fallback: string): string => {
        const index = args.indexOf(name);
        return index < 0 ? fallback : args[index + 1] ?? "";
    };
    const output = value("--out", "output/long-fuzz/result.json");
    const options = {ops: Number(value("--ops", "1000000")), peers: Number(value("--peers", "8")), seed: Number(value("--seed", "1"))};
    await mkdir(dirname(output), {recursive: true});
    try {
        const result = await runLongFuzz(options);
        await writeFile(output, JSON.stringify(result, null, 2) + "\n");
        console.log(JSON.stringify(result));
    } catch (error) {
        await writeFile(output, JSON.stringify({passed: false, options, completedAt: new Date().toISOString(), error: error instanceof Error ? error.stack : String(error)}, null, 2) + "\n");
        throw error;
    }
}
