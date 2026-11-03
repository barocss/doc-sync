import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {DocHub} from '@barocss/doc-sync/server';
import {Client} from '@barocss/doc-sync/client';
import {PROTOCOL_VERSION} from '@barocss/doc-sync/sync';
import {CANVAS_SCHEMA, CANVAS_SAMPLE, makeCanvasScene} from '../../../fixtures/graphic-canvas-schema.ts';
const HERE = fileURLToPath(new URL('.', import.meta.url));
const MAX_BODY = 8 * 1024 * 1024;
/** This server has no persistence. Each process owns its own bounded document rooms. */
export function createGraphicServer({maxRooms = 16} = {}) {
    const rooms = new Map(), sizes = new Map();
    function room(name, count = null) {
        let hub = rooms.get(name);
        if (hub) return hub;
        if (rooms.size >= maxRooms) throw new Error('Room limit reached');
        hub = new DocHub({schema: CANVAS_SCHEMA});
        const seed = new Client({schema: CANVAS_SCHEMA, actor: 'graphic-seed'});
        const scene = count === null ? CANVAS_SAMPLE : makeCanvasScene(count);
        const ops = seed.edit([{op: 'insert', at: [0], content: scene.children ?? []}]);
        if (ops.length) hub.submit({actor: seed.actor, seq: 1, ops});
        seed.dispose(); rooms.set(name, hub); sizes.set(name, count); return hub;
    }
    const streams = new Set();
    const server = createServer(async (req, res) => {
        const send = (code, value) => { res.writeHead(code, {'content-type': 'application/json', 'cache-control': 'no-store'}); res.end(JSON.stringify(value)); };
        try {
            const url = new URL(req.url, 'http://localhost');
            if (!['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) return send(403, {error: 'Local access only'});
            if (req.headers.origin && !/^http:\/\/(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/.test(req.headers.origin)) return send(403, {error: 'Local origin required'});
            if (url.pathname === '/api/graphic/rooms' && req.method === 'POST') {
                let bytes = 0, chunks = [];
                for await (const chunk of req) { bytes += chunk.length; if (bytes > 1024) return send(413, {error: 'Payload limit'}); chunks.push(chunk); }
                let body; try { body = JSON.parse(Buffer.concat(chunks).toString()); } catch { return send(400, {error: 'Malformed JSON'}); }
                if (!body || typeof body.doc !== 'string' || !/^[\w~-]{1,80}$/.test(body.doc) || !['sample', 100, 1000, 5000].includes(body.count)) return send(400, {error: 'Invalid room request'});
                const count = body.count === 'sample' ? null : body.count;
                if (rooms.has(body.doc) && sizes.get(body.doc) !== count) return send(409, {error: 'Room already exists with a different initial scene'});
                const existed = rooms.has(body.doc); room(body.doc, count); return send(existed ? 200 : 201, {doc: body.doc, count: body.count, created: !existed, storage: 'memory'});
            }
            const match = /^\/api\/docs\/([\w~-]{1,80})\/(stream|changes|ack|presence|leave|state)$/.exec(url.pathname);
            if (!match) {
                if (req.method !== 'GET') return send(405, {error: 'Method not allowed'});
                const files = {'/': ['index.html', 'text/html'], '/index.html': ['index.html', 'text/html'], '/main.js': ['../../../output/graphic-demo/main.js', 'text/javascript'], '/style.css': ['style.css', 'text/css']};
                const file = files[url.pathname]; if (!file) return send(404, {error: 'Not found'});
                const content = await readFile(resolve(HERE, file[0])); res.writeHead(200, {'content-type': file[1], 'cache-control': 'no-store'}); return res.end(content);
            }
            const [, name, action] = match;
            if (action === 'state' && req.method === 'GET') { const hub = rooms.get(name); return hub ? send(200, {model: hub.doc.toJSON(), serverSeq: hub.serverSeq, epoch: hub.epoch, schemaVersion: hub.schemaVersion, storage: 'memory'}) : send(404, {error: 'Room not found'}); }
            const protocol = action === 'stream' ? url.searchParams.get('protocol') : req.headers['x-doc-sync-protocol'];
            if (protocol !== String(PROTOCOL_VERSION)) return send(426, {error: 'Unsupported protocol', protocol: PROTOCOL_VERSION});
            let count = null;
            if (url.searchParams.has('count')) { count = Number(url.searchParams.get('count')); if (![1000, 5000].includes(count)) return send(400, {error: 'Invalid scene count'}); }
            const hub = room(name, count);
            if (action === 'stream') {
                if (req.method !== 'GET') return send(405, {error: 'Method not allowed'});
                const actor = url.searchParams.get('actor'), since = Number(url.searchParams.get('since') ?? 0), version = url.searchParams.get('schemaVersion');
                if (!actor || !/^[\w~-]{1,100}$/.test(actor) || !Number.isSafeInteger(since) || since < 0 || since > hub.serverSeq) return send(400, {error: 'Invalid stream'});
                if (version !== hub.schemaVersion) return send(409, {error: 'Schema mismatch'});
                hub.connect(actor, since);
                res.writeHead(200, {'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive'});
                streams.add(res);
                const event = value => res.write(`data: ${JSON.stringify(value)}\n\n`);
                event(hub.hello(since, url.searchParams.get('epoch') ?? undefined));
                if (since && url.searchParams.get('epoch') === hub.epoch) for (const envelope of hub.log.slice(since)) event({type: 'change', envelope});
                const stop = hub.listen(event), timer = setInterval(() => res.write(': ping\n\n'), 15000);
                req.on('close', () => { clearInterval(timer); stop(); streams.delete(res); hub.disconnect(actor); hub.dropPresence(actor); });
                return;
            }
            if (req.method !== 'POST') return send(405, {error: 'Method not allowed'});
            if (req.headers['x-doc-sync-schema'] !== hub.schemaVersion) return send(409, {error: 'Schema mismatch'});
            if (req.headers['x-doc-sync-epoch'] !== hub.epoch) return send(409, {error: 'Epoch mismatch'});
            let bytes = 0, chunks = [];
            for await (const chunk of req) { bytes += chunk.length; if (bytes > MAX_BODY) { send(413, {error: 'Payload limit'}); req.resume(); return; } chunks.push(chunk); }
            let body; try { body = JSON.parse(Buffer.concat(chunks).toString()); } catch { return send(400, {error: 'Malformed JSON'}); }
            if (!body || typeof body !== 'object' || typeof body.actor !== 'string' || !/^[\w~-]{1,100}$/.test(body.actor)) return send(400, {error: 'Invalid actor'});
            if (action === 'changes') {
                if (!Number.isSafeInteger(body.seq) || body.seq < 1 || !Array.isArray(body.ops) || body.ops.length > 100000) return send(400, {error: 'Invalid change'});
                try { const envelope = hub.submit(body); return send(200, {serverSeq: envelope?.serverSeq ?? null}); }
                catch (error) { return send(409, {error: error.message}); }
            }
            if (action === 'ack') {
                if (!Number.isSafeInteger(body.serverSeq) || body.serverSeq < 0 || body.serverSeq > hub.serverSeq || !(body.pin === null || Number.isSafeInteger(body.pin) && body.pin >= 1)) return send(400, {error: 'Invalid ack'});
                hub.ack(body);
            } else if (action === 'presence') {
                if (JSON.stringify(body).length > 20000 || body.anchor !== null || body.focus !== null || typeof body.name !== 'string' || typeof body.color !== 'string') return send(400, {error: 'Invalid presence'});
                hub.setPresence(body);
            } else if (action === 'leave') hub.leave(body.actor);
            else return send(404, {error: 'Not found'});
            send(200, {});
        } catch (error) { if (!res.headersSent) send(400, {error: error.message}); else res.destroy(); }
    });
    server.on('close', () => { for (const stream of streams) stream.destroy(); });
    return {server, rooms, close: async () => { for (const stream of streams) stream.destroy(); await new Promise((ok, fail) => server.close(error => error ? fail(error) : ok())); }};
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const {server} = createGraphicServer(); const port = Number(process.env.GRAPHIC_PORT ?? 5420);
    server.listen(port, '127.0.0.1', () => console.log(`Graphic demo (memory only): http://127.0.0.1:${server.address().port}`));
}
