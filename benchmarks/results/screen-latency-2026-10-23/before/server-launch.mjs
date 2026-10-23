import {appendFileSync} from 'node:fs';
import {performance} from 'node:perf_hooks';
import {DocHub} from "/var/folders/kd/q2hh9cdj51zblmfh_3pd0p_h0000gn/T/doc-sync-screen-baseline-8noz55db/packages/doc-sync/src/server/index.ts";
import {Doc} from "/var/folders/kd/q2hh9cdj51zblmfh_3pd0p_h0000gn/T/doc-sync-screen-baseline-8noz55db/packages/doc-sync/src/index.ts";

const output = new URL('./server-events.jsonl', import.meta.url);
let current = null;
for (const name of ['check', 'apply', 'toJSON']) {
  const original = Doc.prototype[name];
  Doc.prototype[name] = function (...args) {
    const start = performance.now();
    try { return original.apply(this, args); }
    finally {
      if (current) {
        const slot = current.methods[name] ??= {calls: 0, totalMs: 0};
        slot.calls++;
        slot.totalMs += performance.now() - start;
      }
    }
  };
}
const submit = DocHub.prototype.submit;
DocHub.prototype.submit = function (change) {
  const row = {actor: change.actor, seq: change.seq, ops: change.ops.length, epochStart: performance.timeOrigin + performance.now(), methods: {}};
  current = row;
  const start = performance.now();
  try { return submit.call(this, change); }
  finally {
    row.submitMs = performance.now() - start;
    row.epochEnd = performance.timeOrigin + performance.now();
    current = null;
    appendFileSync(output, JSON.stringify(row) + '\n');
  }
};
await import("/var/folders/kd/q2hh9cdj51zblmfh_3pd0p_h0000gn/T/doc-sync-screen-baseline-8noz55db/apps/demo/server.ts");
