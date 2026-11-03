import assert from 'node:assert/strict';
import {spawn, type ChildProcess} from 'node:child_process';
import {once} from 'node:events';
import {mkdtemp, readFile, writeFile, mkdir, stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createServer, request} from 'node:http';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {test} from 'node:test';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
import {NodeHttpTransport} from '@barocss/doc-sync/node';
import {SyncClient} from '@barocss/doc-sync/sync';
import {DEMO_SCHEMA} from '../../../fixtures/demo-schema.ts';
import {IntentJournal} from '../src/journal.ts';

const entry = resolve(process.env.DOC_SYNC_TEST_MCP_ENTRYPOINT ?? fileURLToPath(new URL('../src/main.ts', import.meta.url)));
const fixture = fileURLToPath(new URL('./startup-lifecycle-fixture.mjs', import.meta.url));
const demoEntry = fileURLToPath(new URL('../../demo/server.ts', import.meta.url));
const document = 'startup-lifecycle', actor = 'startup-agent';
const evidence = resolve(process.env.DOC_SYNC_TEST_EVIDENCE ?? `output/mcp-startup-proof/test-run-${Date.now()}`);
await mkdir(evidence, {recursive: true});
const sources: Record<string, string> = {};
for (const path of [entry, entry.replace(/main\.ts$/, 'session.ts'), entry.replace(/main\.ts$/, 'journal.ts'), entry.replace(/main\.ts$/, 'stdio-lifetime.ts'), fixture, fileURLToPath(import.meta.url)]) {
    try { sources[path] = createHash('sha256').update(await readFile(path)).digest('hex'); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
}
await writeFile(join(evidence, 'source.json'), JSON.stringify({entry, node: process.version, origin: process.env.DOC_SYNC_TEST_SOURCE_LABEL ?? (process.env.DOC_SYNC_TEST_MCP_ENTRYPOINT ? 'archived HEAD 0de9f0ffc06d8be94e448222c0575a99d6ae9a66' : 'current worktree'), sources}, null, 2));
type ChildLane = {
    client: Client; transport: StdioClientTransport; connected: Promise<void>;
    errors(): string; child(): ChildProcess;
    exited(): Promise<{code: number | null; signal: NodeJS.Signals | null}>;
    eof(): void; close(): Promise<void>;
};
let serial = 0;
function deadline<T>(p: Promise<T>, label: string, ms = 5000): Promise<T> {
    let timer: ReturnType<typeof setTimeout>;
    return Promise.race([p, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error(`Deadline: ${label}`)), ms); })]).finally(() => clearTimeout(timer));
}
async function until(check: () => boolean, label: string) {
    const end = Date.now() + 5000;
    while (!check()) { if (Date.now() >= end) throw new Error(`Deadline: ${label}`); await new Promise(r => setTimeout(r, 10)); }
}
async function stop(child: ChildProcess) {
    if (child.exitCode !== null || child.signalCode !== null) return;
    const exit = once(child, 'exit'); child.kill('SIGTERM');
    try { await deadline(exit, `SIGTERM pid ${child.pid}`, 1500); }
    catch { child.kill('SIGKILL'); await deadline(exit, `SIGKILL pid ${child.pid}`, 1500); }
}
async function environment() {
    const root = await mkdtemp(join(tmpdir(), 'doc-sync-startup-test-'));
    const id = ++serial;
    const demo = spawn(process.execPath, [demoEntry], {env: {...process.env, PORT: '0', DATA_DIR: join(root, 'server'), NO_SCHEMA: '', DOC_PROFILE: ''}, stdio: ['ignore', 'pipe', 'pipe']});
    let stdout = '', stderr = '';
    demo.stdout!.on('data', chunk => { stdout += chunk; });
    demo.stderr!.on('data', chunk => { stderr += chunk; });
    const children: ChildLane[] = [];
    let activeStreams = 0, streams = 0, conditional = 0, leave = 0;
    let holdConditional = false, holdResponse = false, accepted = false;
    let releaseResponse: (() => void) | undefined;
    let proxy: ReturnType<typeof createServer> | undefined;
    try {
        await until(() => /http:\/\/localhost:\d+(?=\r?\n)/.test(stdout), 'demo readiness');
        const origin = stdout.match(/http:\/\/localhost:\d+(?=\r?\n)/)![0].replace('localhost', '127.0.0.1');
        proxy = createServer((req, res) => {
            const isStream = !!req.url?.includes('/stream');
            const isConditional = req.method === 'POST' && !!req.url?.endsWith('/conditional');
            if (isStream) { streams++; activeStreams++; res.once('close', () => activeStreams--); }
            if (req.url?.endsWith('/leave')) leave++;
            if (isConditional) { conditional++; if (holdConditional) { req.resume(); return; } }
            const upstream = request(`${origin}${req.url}`, {method: req.method, headers: {...req.headers, host: new URL(origin).host}}, response => {
                if (isConditional && holdResponse) {
                    let body = ''; response.on('data', c => { body += c; });
                    response.on('end', () => {
                        accepted = response.statusCode === 200 && JSON.parse(body).status === 'accepted';
                        releaseResponse = () => { res.writeHead(response.statusCode ?? 502, response.headers); res.end(body); };
                    });
                    return;
                }
                res.writeHead(response.statusCode ?? 502, response.headers); response.pipe(res);
            });
            upstream.on('error', () => { if (!res.headersSent) res.writeHead(502); res.end(); });
            res.once('close', () => upstream.destroy()); req.pipe(upstream);
        });
        proxy.listen(0, '127.0.0.1'); await once(proxy, 'listening');
        const port = (proxy.address() as {port: number}).port;
        const url = `http://127.0.0.1:${port}`;
        const journalDir = join(root, 'journal'), journalPath = join(journalDir, `${document}.json`);
        function launch(extra: Record<string, string> = {}, clientName = 'startup-lifecycle-test'): ChildLane {
            const env = Object.fromEntries(Object.entries(process.env).filter((v): v is [string, string] => v[1] !== undefined));
            const transport = new StdioClientTransport({command: process.execPath, args: ['--import', fixture, entry], env: {...env,
                DOC_SYNC_TEST_MCP_ENTRYPOINT: entry, DOC_SYNC_URL: url, DOC_SYNC_DOCUMENT: document,
                DOC_SYNC_ACTOR: actor, DOC_SYNC_JOURNAL_DIR: journalDir, DOC_SYNC_SCHEMA: '',
                DOC_SYNC_DISCOVER_SCHEMA: '', DOC_SYNC_JOURNAL: '', DOC_SYNC_MISSION_BRIDGE: '', DOC_SYNC_TEST_START_FAULT: '', ...extra}, stderr: 'pipe'});
            const client = new Client({name: clientName, version: '1'});
            let errors = '', child: ChildProcess;
            let exited: Promise<{code: number | null; signal: NodeJS.Signals | null}>;
            let exitRecord: unknown;
            const start = transport.start.bind(transport);
            transport.start = async () => {
                await start();
                // Test-only access: SDK owns spawning; EOF must not call SDK.close's kill escalation.
                child = (transport as unknown as {_process: ChildProcess})._process;
                exited = new Promise(resolve => child.once('exit', (code, signal) => { exitRecord = {pid: child.pid, code, signal}; resolve({code, signal}); }));
                transport.stderr!.on('data', c => { errors += c; });
            };
            const connected = client.connect(transport); void connected.catch(() => undefined);
            const result: ChildLane = {client, transport, connected, errors: () => errors,
                child: () => child, exited: () => exited,
                eof: () => child.stdin!.end(),
                async close() {
                    const beforeCleanup = {pid: child?.pid, exitCode: child?.exitCode, signal: child?.signalCode, activeStreams, streams, conditional, leave};
                    if (child) await stop(child);
                    await client.close().catch(() => undefined);
                    await writeFile(join(evidence, `case-${id}-child-${children.indexOf(result)}.json`), JSON.stringify({entry, root, beforeCleanup, exit: exitRecord, stderr: errors}, null, 2));
                }};
            children.push(result); return result;
        }
        return {root, origin, url, journalDir, journalPath, launch,
            counts: () => ({activeStreams, streams, conditional, leave, accepted}),
            release: () => { assert.ok(releaseResponse, 'accepted response barrier'); releaseResponse(); },
            hold: (mode: 'before' | 'after' | 'none') => { holdConditional = mode === 'before'; holdResponse = mode === 'after'; accepted = false; },
            async schema(delay = 250) {
                const path = join(root, 'async-schema.mjs');
                await writeFile(path, `process.stderr.write('lifecycle:schema-wait\\n');\nawait new Promise(r => setTimeout(r, ${delay}).unref());\nprocess.stderr.write('lifecycle:schema-export\\n');\nexport default ${JSON.stringify(DEMO_SCHEMA)};\n`);
                return path;
            },
            async close() {
                try { for (const child of children) await child.close(); }
                finally {
                    proxy!.closeAllConnections(); await new Promise<void>(r => proxy!.close(() => r()));
                    await stop(demo);
                    await writeFile(join(evidence, `case-${id}-server.json`), JSON.stringify({pid: demo.pid, exitCode: demo.exitCode, signal: demo.signalCode, stderr, root, counts: {activeStreams, streams, conditional, leave}}, null, 2));
                    // Keep private synthetic data for inspection. Never delete user logs.
                }
            }};
    } catch (error) { proxy?.closeAllConnections(); proxy?.close(); await stop(demo); throw error; }
}
async function call(client: Client, name: string, args: Record<string, unknown> = {}) {
    return client.callTool({name, arguments: args}, undefined, {timeout: 12000}) as Promise<{isError?: boolean; structuredContent?: any}>;
}
async function value(client: Client, name: string, args: Record<string, unknown> = {}) {
    const result = await call(client, name, args); assert.ok(!result.isError, JSON.stringify(result)); return result.structuredContent;
}
async function state(origin: string) { return (await fetch(`${origin}/api/docs/${document}/state`)).json() as Promise<any>; }
function text(state: any) { return state.model.children[0].runs.map((r: any) => r.text ?? '').join(''); }
async function foreignEdit(origin: string) {
    const transport = new NodeHttpTransport(document, 'foreign-startup', origin);
    const client = new SyncClient('foreign-startup', transport, {schema: DEMO_SCHEMA}); client.connect();
    try {
        await until(() => !!client.epoch && client.schemaVerified, 'foreign snapshot');
        client.commit(client.doc.edit([{op: 'insert', at: [0, 0], content: 'Foreign '}]).ops);
        await until(() => client.pending.length === 0, 'foreign accepted edit');
    } finally { client.disconnect(); await transport.leave(); }
}
async function unlocked(path: string) {
    const inode = (await stat(`${path}.lock`)).ino;
    const journal = await IntentJournal.open(path, {document, actor});
    await journal.close(); assert.equal((await stat(`${path}.lock`)).ino, inode, 'lock inode must not be deleted');
}

test('async supported schema preserves early initialize bytes and owns startup stdin', {timeout: 12000}, async () => {
    const env = await environment();
    try {
        const child = env.launch({DOC_SYNC_SCHEMA: await env.schema()});
        await deadline(child.connected, 'async schema MCP initialize');
        assert.match(child.errors(), /lifecycle:schema-export/);
        assert.ok((await child.client.listTools()).tools.length > 0);
        const read = await value(child.client, 'read_document'); assert.ok(read.revision.epoch);
        child.eof(); const exit = await deadline(child.exited(), 'ready EOF natural exit');
        assert.deepEqual(exit, {code: 0, signal: null}); await until(() => env.counts().activeStreams === 0, 'ready SSE close');
        await unlocked(env.journalPath);
    } finally { await env.close(); }
});

// The only changed input is a valid SDK client name. Both sizes use the same
// supported module and unreferenced wait; neither changes protocol limits.
for (const bytes of [8, 262144]) {
    test(`async schema preserves ${bytes}-byte early SDK initialize through bootstrap backpressure`, {timeout: 12000}, async () => {
        const env = await environment();
        try {
            const before = await state(env.origin);
            const name = '01234567'.repeat(bytes / 8);
            const hash = createHash('sha256').update(name).digest('hex');
            const child = env.launch({DOC_SYNC_SCHEMA: await env.schema(700), DOC_SYNC_TEST_OBSERVE_INPUT: 'on'}, name);
            await deadline(child.connected, 'backpressure schema MCP initialize');
            const diagnostic = child.errors();
            assert.match(diagnostic, /lifecycle:schema-export/);
            assert.ok(diagnostic.includes(`lifecycle:initialize:${bytes}:${hash}`), 'real SDK parser receives exact early client name');
            if (bytes > 65536) {
                const pause = diagnostic.match(/lifecycle:backpressure:(\d+):(\d+)/);
                assert.ok(pause, 'raw stdin really paused on the bootstrap proxy before SDK start');
                assert.ok(Number(pause[1]) >= 65536 || Number(pause[2]) >= 65536, 'proxy reached its 64 KiB high-water mark');
                assert.ok(diagnostic.indexOf(pause[0]) < diagnostic.indexOf('lifecycle:schema-export'), 'backpressure precedes schema completion');
                assert.ok(diagnostic.indexOf(pause[0]) < diagnostic.indexOf('lifecycle:stdio-start'), 'backpressure precedes SDK consumer');
            }
            assert.equal((await deadline(child.client.listTools(), 'backpressure tools readiness')).tools.length, 13);
            const read = await deadline(value(child.client, 'read_document'), 'backpressure read readiness');
            assert.ok(read.revision.epoch);
            const after = await state(env.origin);
            assert.deepEqual(after.model, before.model, 'initialize and read must not change the model');
            assert.equal(after.serverSeq, before.serverSeq);
            assert.equal(env.counts().conditional, 0);
            child.eof();
            assert.deepEqual(await deadline(child.exited(), 'backpressure ready EOF natural exit'), {code: 0, signal: null});
            await until(() => env.counts().activeStreams === 0, 'backpressure ready SSE close');
            await unlocked(env.journalPath);
        } finally { await env.close(); }
    });
}

test('buffered large initialize plus bootstrap EOF releases lease and local ownership', {timeout: 12000}, async () => {
    const env = await environment();
    try {
        const before = await state(env.origin);
        const child = env.launch({DOC_SYNC_SCHEMA: await env.schema(700), DOC_SYNC_TEST_OBSERVE_INPUT: 'on'}, '01234567'.repeat(32768));
        await until(() => child.errors().includes('lifecycle:backpressure:'), 'bootstrap backpressure barrier');
        assert.ok(!child.errors().includes('lifecycle:schema-export'), 'EOF is sent during the real schema wait');
        child.eof();
        assert.deepEqual(await deadline(child.exited(), 'buffered bootstrap EOF natural exit'), {code: 0, signal: null});
        // Do not await SDK connect after intentionally ending its writable pipe.
        // Its initialized-notification send can await a drain that EOF cannot emit.
        // Natural child exit and upstream/resource assertions are the EOF oracle.
        await until(() => env.counts().activeStreams === 0, 'buffered EOF SSE close');
        assert.equal(env.counts().conditional, 0);
        const after = await state(env.origin);
        assert.deepEqual(after.model, before.model);
        assert.equal(after.serverSeq, before.serverSeq);
        // EOF may be hidden behind paused input until the SDK begins consuming.
        // If session startup acquired a writer before EOF became visible, it must
        // be reacquirable without deleting its lock or changing durable state.
        if (child.errors().includes('lifecycle:session-ready')) await unlocked(env.journalPath);
        const resumed = env.launch();
        await deadline(resumed.connected, 'buffered EOF restart');
        assert.equal((await value(resumed.client, 'recovery_status')).status, 'clear');
        assert.equal((await resumed.client.listTools()).tools.length, 13);
        assert.deepEqual((await state(env.origin)).model, before.model);
        resumed.eof();
        assert.deepEqual(await deadline(resumed.exited(), 'buffered EOF restart natural exit'), {code: 0, signal: null});
    } finally { await env.close(); }
});

test('actual stdio start rejection after live SSE cleans stream and writer ownership', {timeout: 12000}, async () => {
    const env = await environment();
    try {
        const child = env.launch({DOC_SYNC_TEST_START_FAULT: 'on'});
        await until(() => child.errors().includes('lifecycle:fault:stdio-start'), 'actual start fault');
        assert.ok(env.counts().streams > 0, 'fault must follow actual live SSE');
        const exit = await deadline(child.exited(), 'failed startup natural exit');
        assert.equal(exit.signal, null); assert.notEqual(exit.code, 0);
        assert.match(child.errors(), /Synthetic actual StdioServerTransport.start rejection/);
        assert.match(child.errors().split('\n').filter(line => !line.startsWith('lifecycle:')).join('\n'), /stdio[- ](?:connect|start)|phase[=: ].*stdio/i, 'production phase diagnostic');
        await until(() => env.counts().activeStreams === 0, 'failed startup SSE close');
        await unlocked(env.journalPath);
    } finally { await env.close(); }
});

test('EOF during async schema bootstrap admits no edit and exits without upstream work', {timeout: 12000}, async () => {
    const env = await environment();
    try {
        const child = env.launch({DOC_SYNC_SCHEMA: await env.schema()});
        await until(() => child.errors().includes('lifecycle:schema-wait'), 'schema entry barrier');
        child.eof(); const exit = await deadline(child.exited(), 'bootstrap EOF');
        assert.deepEqual(exit, {code: 0, signal: null});
        assert.equal(env.counts().conditional, 0); assert.equal(env.counts().activeStreams, 0);
        assert.equal((await state(env.origin)).serverSeq, 0);
    } finally { await env.close(); }
});

for (const mode of ['before', 'after'] as const) {
    test(`durable ${mode}-accept intent survives failed startup and EOF restart without duplicate or foreign loss`, {timeout: 30000}, async () => {
        const env = await environment();
        try {
            env.hold(mode);
            const first = env.launch(); await deadline(first.connected, 'initial handshake');
            const initial = await value(first.client, 'read_document');
            const pending = call(first.client, 'edit_document', {base: initial.revision, edits: [{op: 'insert', at: [0, 0], content: 'AI'}]}).catch(() => undefined);
            await until(() => env.counts().conditional === 1 && (mode === 'before' || env.counts().accepted), 'durable conditional barrier');
            const intent = await readFile(env.journalPath), checkpoint = await readFile(`${env.journalPath}.checkpoint`);
            const record = JSON.parse(intent.toString()); assert.equal(record.actor, actor); assert.deepEqual(record.base, initial.revision);
            assert.ok(record.change); assert.ok(record.generation);
            // Crash creates the established durable recovery input, not the startup trigger.
            first.child().kill('SIGKILL'); await deadline(first.exited(), 'owned crash exit'); await deadline(pending, 'pending call closes');
            env.hold('none'); await foreignEdit(env.origin);
            const foreign = await state(env.origin); assert.equal(text(foreign), mode === 'after' ? 'Foreign AI' : 'Foreign ');
            const fault = env.launch({DOC_SYNC_TEST_START_FAULT: 'on'});
            await until(() => fault.errors().includes('lifecycle:fault:stdio-start'), 'restart stdio fault');
            const failure = await deadline(fault.exited(), 'restart fault exit'); assert.notEqual(failure.code, 0); assert.equal(failure.signal, null);
            if (mode === 'before') {
                assert.deepEqual(await readFile(env.journalPath), intent, 'failed startup preserves exact pending intent');
                assert.deepEqual(await readFile(`${env.journalPath}.checkpoint`), checkpoint, 'failed startup preserves pending checkpoint');
            }
            const resumed = env.launch(); await deadline(resumed.connected, 'recovery handshake');
            const recovery = await value(resumed.client, 'recovery_status');
            assert.equal(env.counts().conditional, 1, 'startup does not resend conditional');
            if (mode === 'before') {
                assert.equal(recovery.status, 'recovery_required');
                assert.deepEqual(recovery.record.change, record.change); assert.deepEqual(recovery.record.base, record.base);
                assert.equal((await call(resumed.client, 'edit_document', {base: initial.revision, edits: [{op: 'insert', at: [0, 0], content: 'duplicate'}]})).isError, true);
            } else {
                assert.equal(recovery.status, 'clear');
                assert.deepEqual((await state(env.origin)).model, foreign.model, 'accepted receipt prevents duplicate');
                assert.equal((await value(resumed.client, 'undo')).status, 'confirmed'); assert.equal(text(await state(env.origin)), 'Foreign ');
                assert.equal((await value(resumed.client, 'redo')).status, 'confirmed'); assert.equal(text(await state(env.origin)), 'Foreign AI');
            }
            resumed.eof(); assert.deepEqual(await deadline(resumed.exited(), 'recovered EOF exit'), {code: 0, signal: null});
            await unlocked(env.journalPath);
            const last = env.launch(); await deadline(last.connected, 'EOF restart handshake');
            const lastRecovery = await value(last.client, 'recovery_status');
            assert.equal(lastRecovery.status, mode === 'before' ? 'recovery_required' : 'clear');
            if (mode === 'before') {
                assert.deepEqual(await readFile(env.journalPath), intent, 'EOF restart preserves exact pending bytes');
                assert.deepEqual(await readFile(`${env.journalPath}.checkpoint`), checkpoint, 'EOF restart preserves pending checkpoint');
                assert.equal(env.counts().leave, 0, 'uncertain intent never sends leave');
            }
            assert.equal(env.counts().conditional, 1, 'EOF restart never replays pending');
            assert.equal(text(await state(env.origin)), mode === 'after' ? 'Foreign AI' : 'Foreign ');
            last.eof(); await deadline(last.exited(), 'last EOF exit');
        } finally { await env.close(); }
    });
}


test('ready EOF drains already admitted accepted work before closing durable ownership', {timeout: 16000}, async () => {
    const env = await environment();
    try {
        env.hold('after');
        const child = env.launch(); await deadline(child.connected, 'ready handshake');
        const initial = await value(child.client, 'read_document');
        const editing = call(child.client, 'edit_document', {base: initial.revision, edits: [{op: 'insert', at: [0, 0], content: 'AI'}]}).catch(() => undefined);
        await until(() => env.counts().accepted, 'accepted response held after durable intent');
        assert.ok((await readFile(env.journalPath)).length);
        child.eof(); await until(() => child.errors().includes('lifecycle:stdin-end'), 'ready EOF observed');
        env.release();
        assert.deepEqual(await deadline(child.exited(), 'admitted drain natural exit'), {code: 0, signal: null});
        await deadline(editing, 'admitted request settles');
        await until(() => env.counts().activeStreams === 0, 'admitted stream close');
        await unlocked(env.journalPath);
        assert.equal(text(await state(env.origin)), 'AI');
        env.hold('none');
        const resumed = env.launch(); await deadline(resumed.connected, 'admitted EOF restart');
        assert.equal((await value(resumed.client, 'recovery_status')).status, 'clear');
        assert.equal(env.counts().conditional, 1, 'no duplicate on admitted-work restart');
        assert.equal(text(await state(env.origin)), 'AI');
        resumed.eof(); assert.deepEqual(await deadline(resumed.exited(), 'admitted restart EOF'), {code: 0, signal: null});
    } finally { await env.close(); }
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    test(`${signal} during schema bootstrap closes normally without an input error`, {timeout: 12000}, async () => {
        const env = await environment();
        try {
            const child = env.launch({DOC_SYNC_SCHEMA: await env.schema()});
            await until(() => child.errors().includes('lifecycle:schema-wait'), 'signal schema barrier');
            assert.equal(child.child().kill(signal), true);
            assert.deepEqual(await deadline(child.exited(), 'signal bootstrap exit'), {code: 0, signal: null});
            assert.doesNotMatch(child.errors(), /MCP (?:input|startup|cleanup) failure/);
            assert.equal(env.counts().activeStreams, 0);
            assert.equal(env.counts().conditional, 0);
            assert.equal((await state(env.origin)).serverSeq, 0);
        } finally { await env.close(); }
    });
}

test('ready signal and EOF share idempotent cleanup and release durable ownership', {timeout: 12000}, async () => {
    const env = await environment();
    try {
        const child = env.launch();
        await deadline(child.connected, 'ready signal handshake');
        assert.equal(child.child().kill('SIGTERM'), true);
        child.eof();
        assert.deepEqual(await deadline(child.exited(), 'ready signal exit'), {code: 0, signal: null});
        assert.doesNotMatch(child.errors(), /MCP (?:input|startup|cleanup) failure/);
        await until(() => env.counts().activeStreams === 0, 'ready signal SSE close');
        await unlocked(env.journalPath);
        const resumed = env.launch();
        await deadline(resumed.connected, 'ready signal restart');
        assert.equal((await value(resumed.client, 'recovery_status')).status, 'clear');
        resumed.eof();
        assert.deepEqual(await deadline(resumed.exited(), 'ready signal restart exit'), {code: 0, signal: null});
    } finally { await env.close(); }
});
