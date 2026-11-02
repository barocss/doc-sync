# Client API and native input measurements

Baseline: `0bc37f9af7ed41b2d268ebff51bc0e75e5b69f46` in an independently installed and built worktree. Candidate: the source-frozen working tree recorded in `raw/verification/source-freeze.json.gz`. No commit or registry release is implied.

Run Node 24.22.1. The browser uses actual Google Chrome 156 in headless mode. Builds, correctness tests and browser measurements do not overlap the Node timing intervals. Chrome timing runs after Node timing stops. This is a workstation result, not exclusive machine control or a physical display measurement.

## Correctness and packages

- Final whole-workspace confirmation: **1,310 cases, 1,308 PASS, two platform SKIPs, zero FAIL**. Library 793, Core 152, Lexical 7, Slate 4, bot 53, demo 85, docs 35, MCP 181 (179 PASS, two SKIPs). Root type checking passes.
- Six tarballs and seven isolated consumers pass runtime/type, class identity, direct Client binding and legacy compatibility checks.
- Default final Chrome functional run passes all four bindings in local and sync modes, shared/per-participant History, offline/foreign edits/reconnect, input/delete, forward/back/caret selection, prefix restoration, remount/reset/refresh and error/network isolation gates.
- One earlier MCP after-accept process test received unexpected HTML. Its cause was not established. Isolated recovery tests, the entire MCP rerun and the final full-workspace confirmation passed; all logs are retained.

## Unified Client overhead

Real headless ProseMirror compares old LocalClient/SyncClient against Client with local/sync backends. Sync stays disconnected with zero transport calls. The eight scenarios are insert, delete, mark, selection, composition, external edit, undo and redo, at 10k/100k characters. Fixtures have 100 characters per paragraph.

All **32 paired scenario/count rows** pass model and History parity and generated-operation parity (except the explicitly different external-edit entry route). Ordinary edit/selection snapshot, restore, model and native reconstruction counts do not increase. Composition retains its existing one snapshot/restore. Operation counts are independent evidence from timing.

The first 10-sample timing comparison retains **8/32 INVESTIGATE flags**. ABBA uses two captures per side, 20 samples per cell. All six local focused rows pass; sync ABBA retains 10k composition and the 100k external-edit tail. A final matched ABBA investigation with 30 samples per capture (60 per side) puts both within the original guard. No original result was discarded or relabeled.

| Final focused sync case | Baseline median | Client median | Baseline p95 | Client p95 |
| --- | ---: | ---: | ---: | ---: |
| 10,000 composition | 10.549 ms | 10.798 ms | 16.415 ms | 18.068 ms |
| 100,000 external | 2.082 ms | 2.200 ms | 3.095 ms | 3.317 ms |

Node guards were fixed before the first capture: median increase at most max(10%, 0.1 ms), p95 increase at most max(15%, 0.2 ms). These narrower repeated checks do not turn every original timing into PASS. No persistent Client-only cost was established in this PM scope; network, startup, bundle size and broad product latency are not qualified.

## Native input ownership fix

Both sides use raw disconnected SyncClient. This isolates Slate/Lexical native input changes from the facade. The fixed input/model/history oracles and count checks pass all 16 editor/size/scenario cells. Basic insert/prefix/delete use zero snapshot/restore calls; marked range replacement uses one snapshot and one restore in both versions. All measured cells call Doc.toJSON once. Internal codec conversions are not instrumented.

The first timing retains 2/16 tail flags. A six-capture A-B-B-A-A-B run pools 24 samples per side. It retains **1/16 INVESTIGATE flags**; a uniform performance PASS is not established.

| 100k native input | Baseline median | Candidate median | Baseline p95 | Candidate p95 |
| --- | ---: | ---: | ---: | ---: |
| Slate insert_text | 19.170 ms | 5.985 ms | 21.394 ms | 7.154 ms |
| Slate plain_prefix | 19.542 ms | 6.391 ms | 20.336 ms | 7.004 ms |
| Slate delete | 19.435 ms | 6.096 ms | 20.877 ms | 7.147 ms |
| Slate replace_marks | 178.031 ms | 160.772 ms | 186.740 ms | 171.327 ms |
| Lexical insert_text | 31.259 ms | 18.450 ms | 34.933 ms | 20.368 ms |
| Lexical plain_prefix | 31.785 ms | 18.822 ms | 32.985 ms | 19.617 ms |
| Lexical delete | 31.851 ms | 18.314 ms | 34.762 ms | 20.268 ms |
| Lexical replace_marks | 188.145 ms | 175.422 ms | 195.961 ms | 184.073 ms |

Unresolved: **Slate 10,000 insert_text p95 2.123 → 4.481 ms**, while median improves 1.333 → 0.947 ms. High candidate values occur at the first measured sample in two captures. A warmup/JIT or allocation explanation is only a hypothesis; no causal profile established it. The original threshold remains in force.

The first benchmark probe incorrectly assumed zero snapshots for marked replacement; the baseline itself used one. The corrected oracle compares candidate counts with the baseline and retains strict zero for basic text input. A second probe exposed that programmatic Lexical selection does not set typing format; setup now explicitly selects the intended format before timing. Both failed receipts are preserved. These were harness corrections, not runtime fixes or relaxed timing thresholds.

## Chrome input to DOM

Result: **INVESTIGATE**. The full run has 320 trusted insertions: two warmups and eight measured samples for each of four source editors, two modes, two sizes and two API routes. Every input observes all four target views. There are 64 paired DOM comparison cells; **5 cross the declared guard**.

The current-code `api=legacy` control shares the native fixes. It does not measure the native fix against old source, and its local Tiptap support is new. The independent Node native comparison above supplies that separate baseline. Sync uses queued in-page DocHub transports, not HTTP or a restarted document server.

The clock starts at trusted beforeinput, then records each view reaching the expected DOM text. No diagnostic model snapshot runs in that interval. Two animation-frame callbacks report a rendering opportunity; they do not measure physical paint. DOM guards declared before timing: median max(10%, 1 ms), p95 max(15%, 2 ms). RAF2 values have no strict PASS gate.

| Mode / size / source | Legacy max target median | Client max target median | Legacy max target p95 | Client max target p95 |
| --- | ---: | ---: | ---: | ---: |
| local / 10,000 / ProseMirror | 5.400 ms | 5.500 ms | 6.400 ms | 9.600 ms |
| local / 10,000 / Slate | 5.100 ms | 4.900 ms | 6.000 ms | 9.700 ms |
| local / 10,000 / Lexical | 5.000 ms | 5.200 ms | 7.200 ms | 7.300 ms |
| local / 10,000 / Tiptap | 6.000 ms | 5.600 ms | 10.700 ms | 9.900 ms |
| local / 100,000 / ProseMirror | 33.700 ms | 34.100 ms | 37.500 ms | 35.800 ms |
| local / 100,000 / Slate | 34.300 ms | 32.600 ms | 37.500 ms | 37.700 ms |
| local / 100,000 / Lexical | 33.200 ms | 33.800 ms | 45.600 ms | 42.000 ms |
| local / 100,000 / Tiptap | 34.200 ms | 35.100 ms | 40.600 ms | 44.300 ms |
| sync / 10,000 / ProseMirror | 6.800 ms | 6.800 ms | 10.400 ms | 10.200 ms |
| sync / 10,000 / Slate | 6.900 ms | 6.800 ms | 10.900 ms | 9.800 ms |
| sync / 10,000 / Lexical | 7.400 ms | 6.900 ms | 9.600 ms | 8.200 ms |
| sync / 10,000 / Tiptap | 7.700 ms | 7.500 ms | 9.500 ms | 10.500 ms |
| sync / 100,000 / ProseMirror | 38.600 ms | 36.900 ms | 48.700 ms | 55.200 ms |
| sync / 100,000 / Slate | 43.400 ms | 41.100 ms | 58.900 ms | 48.900 ms |
| sync / 100,000 / Lexical | 54.900 ms | 48.700 ms | 65.900 ms | 67.600 ms |
| sync / 100,000 / Tiptap | 41.600 ms | 42.800 ms | 60.200 ms | 44.800 ms |

Original crossing cells (same source and target pairing):

| Mode / size | Source → target | Median before → after | p95 before → after |
| --- | --- | ---: | ---: |
| local / 10,000 | ProseMirror → Slate | 5.400 → 5.500 ms | 6.400 → 9.600 ms |
| local / 10,000 | Slate → ProseMirror | 2.400 → 2.300 ms | 3.100 → 5.200 ms |
| local / 10,000 | Slate → Slate | 5.100 → 4.900 ms | 6.000 → 9.700 ms |
| local / 10,000 | Slate → Lexical | 2.400 → 2.300 ms | 3.100 → 5.200 ms |
| local / 10,000 | Slate → Tiptap | 2.400 → 2.300 ms | 3.100 → 5.300 ms |

The first two Chrome timing attempts stopped on cursor/first-block selector assumptions, before complete paired measurements. A third partial attempt was interrupted for preflight and is NOT_QUALIFIED. No partial attempt is pooled into the final full run. Native-key setup and trusted Tiptap input/undo pass all eight routes; the faster final setup also verifies native DOM and logical caret positions in all 32 editor/route combinations. Final timing uses a trusted click and preparatory helper selection outside the clock, then trusted input. All receipts remain separate. Functional Chrome checks passed independently. OS IME, browser composition, mobile editing, physical display latency, HTTP document-server restart and rich-schema browser performance remain outside this demo.

## Reproduce and inspect

See [Client benchmark commands](../../client-api.md), [native input commands](../../native-input-identity.md), and `apps/demo/client/README.md` for Chrome setup and controls. Use the same harness, Node version, payload, scenario and warmup/sample arguments on both targets. Keep builds and other deliberate CPU workloads outside measurements.

[summary.json](./summary.json) contains paired rows and all status fields. [artifacts.json](./artifacts.json) maps every gzip artifact to the exact original SHA-256 and byte count. Decompress a raw file with `gzip -dc FILE.gz`; it contains the original receipt, not a rewritten summary. Source and served-bundle hashes bind correctness and timing to the recorded candidate.
