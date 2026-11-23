# Agent presence in three editors

## Scope and checks

The Word-style rich sample ran on a local demo server with three native editor panels in Chrome 156.0.8078.48. A separate MCP stdio process published an agent name, color and text selection. The browser harness checked caret and selection elements in Slate, Lexical and ProseMirror, the user's existing Slate selection, two simultaneous agents and removal after one leaves, forward and backward ranges, a collapsed caret and hiding presence. A user-side insertion before the selection moved the displayed caret in all three panels; the local replicas and server converged. The MCP integration and session tests separately checked invalid and stale paths, unchanged document revision, token-following after user insertion, and rejection of a selection spanning separate table cells.

A separate actual Codex CLI session called `set_presence` for a named selection. The three Chrome panels displayed the `Codex` label and selection, and removed them after the process left. The tool reports `sent` with delivery `unconfirmed`; browser observation supplies the separate delivery evidence in this run. Presence is transient and the agent must update its reported location explicitly. No model edits or automatic movement prediction were tested in this Codex trial.

Chrome also passed 90 native-editing checks and 37 schema-transition checks. These do not prove real OS IME behavior, production service operation or all selections. The Slate and Lexical overlay hides positions it cannot resolve, including some non-text points. The MCP tool limits selections to endpoints in one visible document line or slot. Large documents and sustained multi-agent presence updates were not benchmarked.

## One timing sample

The harness recorded host wall time just before calling `set_presence`, then observed the first matching caret and selection DOM for each panel, and the second subsequent `requestAnimationFrame` callback. The second callback is a rendering-opportunity proxy, not evidence of physical pixels displayed. This was one sample on a shared local host and is not a percentile or production latency target.

| Editor | MCP call start to matching DOM | MCP call start to second animation frame |
| --- | ---: | ---: |
| Slate | 34 ms | 66 ms |
| Lexical | 17 ms | 49 ms |
| ProseMirror | 19 ms | 49 ms |

Node 24.22.1, Chrome 156.0.8078.48, Darwin arm64, local demo server, Word-style sample. The timed run overlapped other local test work. It does not include language-model inference, remote network latency or a before/after comparison. Full figures and geometries are in [result.json](result.json). Local screenshots, Chrome logs, actual Codex JSONL and first failed harness attempt are in `output/validation/agent-presence-20261028/` on the test host.

## Source identity

SHA-256: MCP session `9e5cc36c2533b3288483a176f76e56775454679784986dfa31aed6b7883ec939`, MCP server `fc0be46b0e4a369ae70720c1d9cedc2386752e90400e104731fe248e4f106915`, product presence overlay `9095c58ae4893a30221e5c35267b170c181bfbd1c315a6528f85e4a0f3a3c74b`, product editor `f1575754ea57fdf7c4ddf787898c31246a1182e40e6dd274b258c026d0e0e94b`, Lexical selection `0a9eb02d5a42c3e61a957ece13e2cee4524f32b6e2854af765fd655b3daf5ced`, browser bundle `11d9294e8999fac65f734b43b720a1aff3516c1834a1142c1f2819b87de0730b`. Installed dependencies and shared host state were not frozen.
