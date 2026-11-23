# Operations and performance

The demo server and private hosted MCP service provide integration references. Static grants and single-host recovery do not provide a complete production deployment.

| Area | What to plan for |
| --- | --- |
| Access | The [private hosted MCP service](../ai/hosted) has static bearer grants. Application document-server authorization, transport security, and tenant isolation remain deployment responsibilities. |
| Storage | Select and operate durable storage, backups, restore procedures, and retention policies. Test failure modes on the actual storage system. |
| Recovery | The MCP journal supports macOS and Linux on private local storage; Linux requires `/usr/bin/flock`. Each journal record is limited to 16 MiB. Use a stable, separate journal directory for each participant. Protect its document contents. |
| Lifecycle | Monitor pending edits, recovery reservations, garbage collection, reconnects, and unresolved outcomes. Never interpret an unknown receipt as rejection. |
| Capacity | Measure with your own document sizes, edit history, concurrent clients, network, editor, and hardware. Include browser rendering and memory, not only core operations. |

See [Troubleshooting](./troubleshooting) and the [recovery plan](../reference/recovery-plan) before operating a durable session.

## Example measurement: long edit history

A local demo-server benchmark used a 5,093,156-byte log with 30,000 CRDT changes and one visible character. It measures log replay and separate document I/O, not rendering a large document. On an Apple M3 Max with Node 24, two warmups and 12 recorded samples per version gave these HTTP response medians:

| Request | Before | After |
| --- | ---: | ---: |
| First state request for the cold log | 258.56 ms | 263.52 ms |
| Append to a different warm document during replay | 263.31 ms | 13.94 ms |

The cold request did not get faster in this run. The host was shared, runs were sequential, and the 12-sample nearest-rank p95 is the maximum. These numbers do not establish production latency or browser responsiveness. The [full report](https://github.com/barocss/doc-sync/blob/main/benchmarks/results/cold-recovery-2026-10-27/report.md) records the workload, checks, source hashes, and limitations. See [Performance evidence](../performance) for browser and core measurements and their separate scopes.
