# Recovery reservation metadata retention

## Result

An isolated test compared two configurations of the same working-tree source. Each configuration executed 48 reservation create/release cycles, one document edit, and one independent active reservation.

| Compaction threshold | JSONL size | `recoveryPin` records |
| --- | ---: | ---: |
| 10,000 events, no compaction in this workload | 10,343 bytes | 97 |
| 8 events | 812 bytes | 1 |

In this single paired workload, the file was approximately 92% smaller with the lower threshold. This is a comparison of configurations, not a comparison against a different source revision. The default threshold is 128, not 8. The measurements are file sizes, not heap usage, throughput, request latency, or a production capacity estimate.

In a separate threshold-8 process test with additional document and recovery activity, the log was 1,753 bytes with three `recoveryPin` records after 24 cycles and 1,758 bytes with three records after 48 cycles. Active reservation snapshots and document entries account for the other bytes. Random UUIDs were different between runs but had the same length.

## Conditions and correctness

- Darwin arm64, Node v24.22.1, single local demo server, isolated temporary storage and loopback ports.
- Test: `apps/mcp/test/reservation-retention-process.test.ts`; diagnostics are in the workspace test log under `output/validation/recovery-retention-20261027-SWu7RT/`.
- Both configurations retained the document and exact conditional receipt. Their active reservation remained protected after a server SIGKILL and restart.
- Additional process tests exercised an MCP restart, GC protection, old-era requests, an interrupted empty checkpoint, release pending, and another participant's edits. Negative checkpoint cases used deliberately constructed fixtures.
- Each configuration was measured once. The comparison does not establish a timing or memory distribution.

## Boundaries

The compaction threshold bounds released-reservation metadata only in the normal compaction path. Document changes, GC records, schema transitions, exact receipts, and active reservations remain and can grow. Compaction synchronously reads, replays, compares, and rewrites the full log, which can increase request latency and peak memory for large logs; those costs were not measured here.

Legacy logs without a durable generation are not compacted. Some pre-existing legacy IDs prevent a safe era transition, so compaction is deferred and metadata can continue to grow. Older clients cannot create new unversioned IDs after an era is sealed. A legacy log that reused an ID before this change retains its old delayed-release ambiguity. OS-level rename and directory-fsync fault injection, power-loss behavior, multiple server processes, and authentication remain outside this test.

The working tree was uncommitted on base `be9f346dfde740f5da95b9a18d200bae22bf7360`. Source hashes and raw test logs are in the validation directory above. No release or deployment is implied.
