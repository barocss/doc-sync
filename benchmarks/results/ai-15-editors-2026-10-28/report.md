# Three editors and fifteen AI participants

## Workload and result

One local Word-profile sample document was open in Chrome 156.0.8078.48. The product demo mounted Slate, Lexical, and ProseMirror as three independent editor peers on one page. Fifteen separate MCP server processes acted as scripted AI clients. The harness assigned five actor IDs to each editor group; the server does not enforce or store those associations. No language model was used in this load run. Each actor had a unique ID and used an ephemeral session with its journal disabled.

All 15 agents read the same revision, then sent conditional inserts concurrently. The harness also dispatched one edit through each of the three editor peers while the 15-request wave was in progress. These three operations were scripted through the demo API, not simultaneous human keystrokes. Separate automated native input subsequently inserted a marker through each editor. The harness checked each of the 15 agent markers, three editor-operation markers, and three native-input markers occurred exactly once, and compared all native and client editor models and all 15 MCP replica models with the server.

| Check | Result |
| --- | --- |
| Initial 15 conditional edits | 1 confirmed, 14 rejected as stale, 0 unconfirmed |
| Rejected agents | All 14 reread the current document and confirmed a new edit |
| Three editor operations overlapping the initial wave | Passed; the operation interval was within the wave interval |
| User edits and agent edits after convergence | All markers present exactly once; models matched |
| Offline browser edit and agent edit | Slate retained one pending edit while the browser context was offline. An agent edit was confirmed separately. Both were present after reconnect; all replicas matched. |
| Agent undo and redo after reconnect | Undo removed that agent's later edit while retaining the offline user edit. Redo restored it. All replicas matched. |

Browser context network emulation disconnected all three editor peers; the MCP agents remained online. This is not an MCP process or server restart test. Automated keyboard input is not an OS IME or manual user test. The initial three editor operations use the demo's test hook. A preceding run without those three operations captured an automated Slate keystroke overlapping the agent wave; the other two keystrokes occurred afterward. Neither run proves simultaneous physical typing by three people.

## Local measurements

One recorded run on a shared Apple M3 Max, 36 GiB host, Darwin 24.6.0 arm64, Node 24.22.1. No warmup or confidence interval; these figures are not production capacity or latency targets.

| Measurement | Observed |
| --- | ---: |
| Start and connect 15 MCP processes, elapsed | 611.8 ms |
| Initial 15-request wave, elapsed | 64.8 ms |
| Initial request response latency, median / p95 | 43.6 / 64.7 ms |
| Fourteen sequential reread-and-retry edit calls, response latency median / p95 | 36.1 / 60.3 ms |
| One RSS sample for the 15 MCP processes, summed | 2,561,552 KiB (2,501.5 MiB) |
| One RSS sample per MCP process, range | 163,680–177,872 KiB |

The request latencies run from the test client issuing `edit_document` until it receives the MCP response. They do not measure language-model inference, remote user network latency, remote editor paint, or the time spent rereading before each retry. The p95 is nearest-rank; with 15 or 14 samples it is the maximum. Initial requests mix a confirmed edit with stale rejections and do not measure 15 accepted edits. The 15 agent RSS figures are a single snapshot, not peak memory; summing RSS can count shared memory more than once. Browser, proxy, server, and harness memory are excluded. The results do not establish performance at other document sizes, runtimes, or user counts.

The controlled overlap uses host wall-clock timestamps; it establishes overlap of the browser's scripted operation dispatch and the overall agent request wave, not server acceptance order. Only one wave and one reconnect were tested. There was no before/after performance comparison.

## Reproduce

From the repository root, with dependencies installed, local loopback binding allowed, Chrome installed, and the Playwright CLI wrapper available:

```sh
AI15_OUTPUT=output/validation/ai-15-editors-run \
PLAYWRIGHT_CLI=/absolute/path/to/playwright_cli.sh \
node benchmarks/ai-editor-concurrency.mjs
```

The runner creates a unique document and browser session, starts its own demo server and 15 MCP processes, and closes those processes and its own browser session. It writes detailed output to `AI15_OUTPUT`. The demo server uses temporary data directories. Protect any retained data as document content. The checked-in [result.json](result.json) removes temporary data-directory paths; local raw browser scripts, the initial failed run, and logs are in `output/validation/ai-15-editors-20261028*` on the test host.

Source SHA-256: harness `6201b4249e7a0a584dc1220cd906dc1932c5b38aef800a123ed88b0409cf3d8f`, product app `8cff150a82c93728be41797d9edefc6966eb98988d15976ea871c80ba85d831a`, MCP session `08404ff26bb7d797e4c28091858dcdbfd277a974e92a2788a2557764370ebac0`, browser bundle `55684b487a344292bed9312049adee4c4792598cf373a3471d80d97489abfad0`. Other dependencies were the local installed workspace packages. The first sandboxed start failed with `listen EPERM`; the later isolated runs were allowed to bind locally. The first permitted harness run failed because the CLI's page-code environment did not define `performance`; the timing code was corrected before the successful runs.
