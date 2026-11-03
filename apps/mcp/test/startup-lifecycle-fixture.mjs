// Test-only preload. No production switch or synthetic journal wait.
import {createHash} from 'node:crypto';
import {StdioServerTransport} from '@modelcontextprotocol/sdk/server/stdio.js';
import {pathToFileURL} from 'node:url';
import {dirname, join} from 'node:path';
const entry = process.env.DOC_SYNC_TEST_MCP_ENTRYPOINT;
if (!entry) throw new Error('Lifecycle fixture requires an explicit entrypoint');
const {DocumentSession} = await import(pathToFileURL(join(dirname(entry), 'session.ts')).href);
const startSession = DocumentSession.prototype.start;
DocumentSession.prototype.start = async function (...args) {
    const result = await startSession.apply(this, args);
    process.stderr.write('lifecycle:session-ready\n');
    return result;
};
// Observe only. Do not attach a data listener, resume stdin, or add a live handle.
if (process.env.DOC_SYNC_TEST_OBSERVE_INPUT === 'on') {
    let destination;
    let started = false;
    const pipe = process.stdin.pipe;
    const pause = process.stdin.pause;
    process.stdin.pipe = function (target, ...args) {
        destination = target;
        return pipe.call(this, target, ...args);
    };
    process.stdin.pause = function (...args) {
        if (!started && destination && (destination.readableLength >= 65536 || destination.writableLength >= 65536)) {
            process.stderr.write(`lifecycle:backpressure:${destination.readableLength}:${destination.writableLength}\n`);
        }
        return pause.apply(this, args);
    };
    const startObserved = StdioServerTransport.prototype.start;
    StdioServerTransport.prototype.start = function (...args) {
        started = true;
        const onmessage = this.onmessage;
        this.onmessage = (message, ...rest) => {
            if (message.method === 'initialize') {
                const name = message.params.clientInfo.name;
                process.stderr.write(`lifecycle:initialize:${Buffer.byteLength(name)}:${createHash('sha256').update(name).digest('hex')}\n`);
            }
            return onmessage?.(message, ...rest);
        };
        return startObserved.apply(this, args);
    };
}
const start = StdioServerTransport.prototype.start;
StdioServerTransport.prototype.start = async function (...args) {
    process.stderr.write('lifecycle:stdio-start\n');
    if (process.env.DOC_SYNC_TEST_START_FAULT === 'on') {
        // Session.start has already completed, including real journal acquisition.
        process.stderr.write('lifecycle:fault:stdio-start\n');
        throw new Error('Synthetic actual StdioServerTransport.start rejection');
    }
    return start.apply(this, args);
};
process.on('beforeExit', code => process.stderr.write(`lifecycle:beforeExit:${code}\n`));
process.on('exit', code => process.stderr.write(`lifecycle:exit:${code}\n`));

// An end listener records EOF but does not resume or consume stdin.
process.stdin.once('end', () => process.stderr.write('lifecycle:stdin-end\n'));
