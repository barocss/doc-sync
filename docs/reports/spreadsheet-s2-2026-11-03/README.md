# Spreadsheet S2: stable rows and columns

The inherited changes were committed first as
`9334e591e25e9ff641eed8c6cd7c65ce9de4724a`, after 1,462 workspace tests passed
with two expected platform skips. See [the baseline record](baseline.md).
New S2 changes remain uncommitted. No push, registry publication or deployment
is part of this delivery. Older reports remain unchanged.

## Delivered contract

`StructuralSheet` is a separate experimental TypeScript API exported from the
core package. Fixed-axis `SparseSheet` behavior and v1/v2 formats are unchanged.

- Initial row/column axes use one implicit interval each, regardless of logical
  size. IDs identify an initial/inserted source and offset in that source.
- Cells key their immutable row ID, column ID and field. Insert/delete/move does
  not rewrite cell identity. Deletes hide cells while retaining peer data.
- Structural targets contain observed identity spans. Move destination is the
  visible index after removing the target range. Concurrent unobserved inserts
  are not silently absorbed into a range.
- Axis actions replay in Lamport/actor Ticket order over intervals. Opposing
  moves still produce a sequence, without a parent graph cycle.
- Structural undo/redo toggles only the owner's original action. Peer
  inserts/moves/deletes remain active. Cell undo uses the existing exact writer
  fence and linked compensation, including foreign same-value writes.
- One clock, ledger, pending queue and local History cover both axes and cells.
  S2 state uses its own replay-validated `doc-sync-structural-sheet-v1` format.
- Fresh batches validate completely before mutation. Ticket collisions, actor
  forks, invalid schema/value/source/axis/offset/history references reject.
  Exact acknowledgement must match a pending prefix.
- Client receive can retain unseen earlier causal references for reordered
  delivery. Server receive consistently requires known fresh references.
  Strict mode does not retroactively validate duplicates previously admitted
  in non-strict mode. Arbitrary invalid operation unions are not a convergence
  contract. Checkpoint validation proves consistency, not authenticity.

## Editor and server integration

The opt-in demo URL is `?axes=stable` in a fresh room. Custom Tasks/Sensors fields
also work. The server binds mode/schema before accepting a room and uses strict
known-reference admission. Default S1 protocol, receipts and existing endpoints
remain compatible. Build/server output is isolated by SPREADSHEET_OUTPUT_DIR.

Native input and inspector targets capture stable IDs at editing start. Remote
insert/move does not redirect them. A deleted target retains the actual native
input and prevents committing into a neighbor. Dirty blurred inspector input is
preserved. Native selection range endpoints and remote presence remain anchored
to IDs. Selection restoration waits until active input commits/cancels; it
suppresses synthetic selected events and normalizes widget-only range flags.
Normal projection/status refresh performs zero whole-range reads.

The desktop toolbar supplies row/column insert/delete/move with one selected
axis item per click; the core API also supports ranges. Native VTable conversion,
projection and selection do not qualify a renderer performance budget.

## Qualification

| Check | Final result | Boundary |
| --- | --- | --- |
| Fresh workspace invocation | 1,511 cases: 1,509 PASS, 2 expected SKIP, 0 FAIL | Core1,099; Lexical7; Slate4; Bot53; Demo124; Docs43; MCP181/179PASS |
| Root TypeScript | PASS | Final production source |
| Package consumer/artifact checks | PASS | Five existing public packages; no new package |
| Axis unit/property checks | 6/6 PASS | Dense ID oracle, 70 actions/20 shuffled deliveries, 100 concurrent permutations, billion-axis sparsity |
| Structural wrapper | 14/14 PASS | Hidden peer values, writer fences, History, exact state/pending and atomic invalid batches |
| Mixed wrapper property tests | 20/20 PASS | Each seed40 actions, five shuffled third-replica deliveries, restore/pending |
| Desktop Chrome | 76 checks PASS | Structural21, S1 default20, custom29, Escape6; same final bundle |
| Documentation | 43/43 PASS; 52 built pages / 2,400 checked links | English/local-path checks; no hosted deployment |

The qualified workspace command was `npm run test --workspaces --if-present`
with packages already built and frozen. Earlier failures are retained:

1. One old recovery-start test assumed saved mission status meant asynchronous
   session/claim cleanup had finished. Source inspection confirmed the intended
   recovering/blocked boundary. The test now polls actual settled API status
   within its existing deadline and retains pending/restart assertions. No bot
   production behavior changed.
2. Intermediate docs/demo runs overlapped package prepack rebuilding dist and
   failed transient imports. Sequential/frozen-artifact runs passed. These are
   orchestration failures, not omitted source failures.
3. A real native selection border defect was fixed: stable IDs and values moved,
   but the widget border stayed behind. Native ranges now remap on refresh.
   Subsequent headless waits stalled until Chrome produced a frame. Final proof
   explicitly requests screenshots before native view assertions and retains
   all earlier attempts. Widget range comparisons ignore internal flags.

Final emitted bundle SHA-256:
`ada76174d37af1d18edb2ecf57caa3f6b27004b8aa2135fef904564e78409aa9`.

Desktop proof covers trusted keyboard/pointer and structural controls, both
peers and Node oracle, own undo/redo, range IDs/borders/shading, dirty and native
drafts, zero full-range reads, and empty page/console error lists. Screenshots
were visually inspected. Frames were requested explicitly. No latency, GPU
completion or physical-paint measurement is claimed.

**Scope correction:** The latest user instruction excludes mobile testing.
Earlier completed raw receipts contain 78 checks, including two mobile checks
performed before that instruction. They are preserved as historical evidence,
but excluded from the current 76-check desktop acceptance. No mobile action ran
after the instruction. The CLI scripts now default to desktop and their small
mobile-gating edits received syntax checks only. Runtime/bundle did not change.
Raw receipts include exact executed script copies; final CLI source hashes
therefore differ only for this later scope edit.

## Node performance and storage observations

Nine fresh `--expose-gc` Node24.22.1 processes on Apple M3 Max use symmetric
row/column extents 1,000 / 1 million / 1 billion and 0/25/100 structural actions.
Each initial axis has one run, zero cell registers and zero retained operations.
Post-GC initial heap deltas are 5,584–6,120 bytes and include measurement noise.
This is actual heap observation, not JSON size, and not a whole-app memory bound.

Across the nine cases, point-edit p50 is 0.0260–0.029625 ms and p95 is
0.040416–0.052875 ms. Capture p50 is 0.865–1.746 ms. Replay p50 is
11.506–53.391 ms, excluding JSON parse. Each capture/replay fixture also retains
120 warmup/sample point writes. More retained structural actions cost more.
The diagnostic includes raw samples, sources, built hashes and environment.

These observations do not establish a speedup, browser latency, large-history
budget or Rust/WASM parity. Untimed view diagnostics sometimes exceed one
frame; view projection needs dedicated profiling. Structural axis replay grows
with history/runs. Range reads scan retained registers; journal, History and
pending storage are not compacted. Native S2, shared Client/DocHub integration,
formulas, GC, persistence and full S5/S6 qualification remain open.

## Run and evidence

```sh
npm ci
npm run build
npm run dev:spreadsheet
# Open /?axes=stable&room=stable-example
node benchmarks/spreadsheet-s2.mjs
```

The qualified isolated preview is at `http://127.0.0.1:5438`, exec66923,
`output/spreadsheet-s2-qualified`. Use a fresh room for another mode/schema.
The server and browser remain memory-only; page reload/server death do not
recover pending work. Existing user tabs/services and original pending/History
were preserved. No live migration was attempted.

Browser overview: `output/spreadsheet-s2-qualified/verification.json`.
Node diagnostic: `output/spreadsheet-s2-node-performance-20261103/receipt.json`.
`evidence/` archives logs, exact scripts, raw receipts and screenshots, including
prior failures. `source-seal.json` pins final source/docs/tests/bundle; the
`evidence-index.json` hashes archived files. Source proof and known limits are
also in HANDOFF §5.123.
