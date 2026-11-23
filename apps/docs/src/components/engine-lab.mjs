import {Doc} from '@barocss/doc-sync';
import {SyncClient} from '@barocss/doc-sync/sync';
import {DocHub} from '@barocss/doc-sync/server';

// Deliberately small schema: no table node, only paragraphs and bold text.
export const LAB_SCHEMA = {root: 'content', marks: ['bold'], nodes: {
    content: {shape: 'flow', children: ['paragraph'], default: 'paragraph'},
    paragraph: {shape: 'text'},
}};
export const LAB_STEPS = [
    ['Same schema, empty documents', 'A, B and the hub begin with one default paragraph.'],
    ['Hub rejects a table outside this schema', 'A separate test proposal contains a table. The hub rejects it before applying it; A and B are not changed.'],
    ['A types A and makes it bold', 'A applies locally and queues one change. Delivery is paused, so B and the hub are still empty.'],
    ['B independently types B', 'B has not received A. Both have a local change; the hub is still empty.'],
    ['Deliver both changes', 'The real hub validates and sequences both changes. Both real clients converge and their pending queues clear.'],
    ['A presses Undo locally', 'A removes its own insertion. B still shows the old state until the undo operations arrive.'],
    ['Deliver A’s Undo', 'Both clients now retain B’s insertion. Undo did not restore a global snapshot.'],
    ['Disconnect A; edit both sides', 'A adds ! offline. B adds ? and synchronizes with the hub. A retains its pending work.'],
    ['Reconnect A and deliver', 'The live client reconnects, receives missing changes and retries pending work. This is not process-restart recovery.'],
];
const turn = () => new Promise(resolve => setTimeout(resolve, 0));
export const modelText = model => model.children.map(node => (node.runs ?? []).map(run => run.text ?? '').join('')).join('\n');

// This controlled in-memory transport uses the production protocol objects.
// It is intentionally not a real HTTP server, packet-loss simulator or durable journal.
export async function createEngineLab() {
    const hub = new DocHub({schema: LAB_SCHEMA});
    let uplink = [], index = 0, rejection = '', closed = false;
    const boxes = [];
    const clients = ['A', 'B'].map(actor => {
        const box = {events: [], handler: null};
        boxes.push(box);
        const transport = {
            subscribe(since, handler, epoch) {
                box.handler = handler;
                const hello = hub.hello(since, epoch);
                box.events.push(hello);
                if (hello.type === 'hello' && !hello.snapshot && since > 0)
                    box.events.push(...hub.since(since).map(envelope => ({type: 'change', envelope})));
                hub.connect(actor, hello.type === 'hello' && hello.snapshot ? hub.serverSeq : since);
                const stop = hub.listen(event => box.events.push(event));
                return () => { stop(); hub.disconnect(actor); box.handler = null; box.events = []; };
            },
            async send(message) { if (!closed) uplink.push(message); },
            sendPresence() {},
        };
        return new SyncClient(actor, transport, {schema: LAB_SCHEMA, ackDelay: 0});
    });
    async function deliver() {
        for (let round = 0; round < 80; round++) {
            if (closed) return;
            await turn();
            const messages = uplink; uplink = [];
            for (const message of messages)
                message.kind === 'change' ? hub.submit(message.change) : hub.ack(message.ack);
            for (const box of boxes) {
                const events = box.events; box.events = [];
                for (const event of events) box.handler?.(event);
            }
            await turn();
            if (!uplink.length && boxes.every(box => !box.events.length)) return;
        }
        throw new Error('Demonstration transport did not settle');
    }
    const edit = (client, edits) => client.commit(client.doc.edit(edits).ops);
    clients.forEach(client => client.connect());
    await deliver();
    function snapshot() {
        return structuredClone({index, title: LAB_STEPS[index][0], explanation: LAB_STEPS[index][1], rejection,
            replicas: clients.map(client => ({name: client.actor, model: client.doc.toJSON(),
                online: client.online, pending: client.pending, serverSeq: client.serverSeq,
                canUndo: client.historyStatus().canUndo})),
            hub: {name: 'Hub', model: hub.doc.toJSON(), serverSeq: hub.serverSeq},
        });
    }
    return {
        snapshot,
        async next() {
            if (closed || index === LAB_STEPS.length - 1) return snapshot();
            const [a, b] = clients;
            switch (index + 1) {
                case 1:
                    try {
                        const proposal = Doc.fromSnapshot('invalid-proposal', hub.doc.snapshot(), LAB_SCHEMA);
                        const ops = proposal.edit([{op: 'insert', at: [1], content: [{type: 'table', children: []}]}]).ops;
                        hub.submit({actor: 'invalid-proposal', seq: 1, ops});
                    }
                    catch (error) { rejection = error.message; }
                    if (!rejection) throw new Error('Expected schema rejection did not occur');
                    break;
                case 2: edit(a, [{op: 'insert', at: [0, 0], content: 'A'}, {op: 'update', at: [0, 0], length: 1, attrs: {bold: true}}]); break;
                case 3: edit(b, [{op: 'insert', at: [0, 0], content: 'B'}]); break;
                case 4: await deliver(); break;
                case 5: a.undo(); break;
                case 6: await deliver(); break;
                case 7:
                    a.disconnect();
                    edit(a, [{op: 'insert', at: [0, 1], content: '!'}]);
                    edit(b, [{op: 'insert', at: [0, 1], content: '?'}]);
                    await deliver(); break;
                case 8: a.connect(); await deliver(); break;
            }
            index++;
            return snapshot();
        },
        close() { closed = true; clients.forEach(client => client.disconnect()); uplink = []; },
    };
}
