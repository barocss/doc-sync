# Sequential integration results — 2026-10-23

HEAD during measurement was `8d0f887`. This report covers the uncommitted working tree on that HEAD. Starting source was frozen with other work's model/paragraph DOM reuse WIP, and preservation was checked. No commit or push occurred during measurement. Later final checks before main integration are in [HANDOFF §5.8](../../../HANDOFF.md#58-final-checks-before-main-integration-2026-10-23).

## Implementation

- SyncClient narrows comparison/validation only for safe single-text-block receipt. Structure, old concurrent insertions, batches depending on new tokens, multiple blocks, hidden cells, virtual blocks, and undo/redo retain the full path. Validation and full-replacement fallback contracts stay unchanged.
- Text longer than 256 UTF-16 units clears its line cache once. This removes block-array copying for every character. Stored IDs, order, wire, and GC stay unchanged.
- String-insertion undo records all UTF-16 IDs. It preserves other actors' input and deletion. This does not resolve all model-coordinate unit differences.
- PmBinding reuses internal model and PM conversion when Doc object and version match. Selection/Presence callbacks remain. Snapshot/reset/IME draft replacement is detected separately.
- Added draft specifications, property tests, a bounded 8-replica long-run harness, and 8-shard nightly CI.

## Before/after receiving comparison

| Initial characters | before p95 ms | after p95 ms | Full-model reads/event |
|---|---:|---:|---:|
| 10000 | 20.253 | 0.781 | 2 → 0 |
| 100000 | 186.249 | 1.174 | 2 → 0 |

Each document size had 5 warmups and 30 measured samples. Timing covers synchronous event receipt through subscription callback completion. Mirror application, network, and DOM are excluded. Mirrors were checked outside timing each time and matched sending/receiving models. Fallback was 0. Equal external load is not guaranteed, so this does not establish product SLO approval. Raw data is in `remote-events/`.

Baseline bulk single paste did not complete within the 120-second case limit. After completed at local 128.358ms and remote 113.309ms, with matching models. Each is one sample. Timeout is not converted to latency or a speedup ratio. The [baseline report](report.md) gives the shared script and smaller alternating measurements.

## Actual screen

Timing starts at key-event creation and ends at the second rAF after remote DOM confirmation. It is not physical display timing. Initial size was 100,000 characters and 625 paragraphs, with 5 warmups and 30 measured samples per direction.

| headed Chrome | Before cache p95 ms | After cache p95 ms |
|---|---:|---:|
| Demo → PM | 573.2 | 291.0 |
| PM → demo | 361.2 | 259.8 |

Actual models and displays matched before and after. After included 70 inputs with warmups, matching final models, pending 0, and fallback 0. But before had sharply increased external CPU load and overlapping tests. After ran once our long workload ended, while external apps continued. The decrease is not attributed solely to the PM cache. Earlier headless p95 270.0/271.6ms used a different mode and cannot be compared directly. Local raw data is in `output/playwright/roadmap-latency-*`; Git stores only summaries and source hashes.

Tests confirmed that unchanged PM selection/Presence does not repeat model reads and conversion. Actual screens still showed hundreds of ms latency. No all-path improvement or product performance target pass is claimed.

## Tests and timing

| Evidence | Result | Scope |
|---|---|---|
| Final default npm test | Core 138 + demo 10, failures 0 | Includes bulk and PM cache |
| Extended FUZZ_SEEDS=3000 PM_SEEDS=300 | Core 128 + demo 10, failures 0 | Before large-text optimization and PM cache |
| Final focused PM/300 seeds | 19 passed | Cache, Presence, PM 2/3 replicas |
| Final focused bulk positions | 4 passed | Returned block immutability, position, model, snapshot, retransmission |
| Compatibility unit tests | 31 passed | Adapter input, conversion, diagnostics |
| Final Chrome CDP | Inputs 84 + general regressions 20 passed | Not OS keyboard input |
| Operation records | 30 checked | Separate from original input diagnostics |
| Local long-run harness | 8 shards, 8 replicas each, 1,000,021 total wire Ops passed | About 512 Ops per document batch; not actual CI execution |
| Type check and separate compatibility bundle build | Passed | Final source |

One initial reset timeout was preserved. HEAD control, current-source repeats, and a revised test waiting for all 5 reset receipts passed. The initial cause was not established as a product regression. Final Z, model equality, and pending/failures checks were not weakened.

## Remaining gates

Wall-clock observation reached 1,800,060ms, but not all 1800 rounds or 1Hz cadence. Last durable converged checkpoint was 1320 rounds and 5280 edits per engine. Exact termination round and timer lateness are unknown. Three engines and checks shared one process, so the miss is not attributed to one engine. After termination, wall-clock bounds and tick recording were fixed and 8 harness tests passed. No new 30-minute run occurred.

Two large Yorkie cases, memory targets, actual target editors/OS IME, lease-expiry recovery, operational protections, schema migration, and two weeks of actual CI remain. G0/G1 and the full roadmap are incomplete. Existing continuous storage, binary format, and move-policy decisions stand. See [status](../../../docs/roadmap-status.md) and [HANDOFF](../../../HANDOFF.md).

Commands: [stage0 README](../../stage0/README.md), `npm run remote --workspace @doc-sync/benchmarks -- --out results/new-path.json`, and `node packages/doc-sync/test/long-fuzz.ts --ops 125000 --peers 8 --seed 1 --out output/new-path.json`. Final local receipt: `output/validation/roadmap-execution-20261023/validation.json`.
