# Five-package migration verification

Base: `d624a56d7ea5389fd9f67d1277637838bb343475`. The candidate is uncommitted.
`source-seal.json` records the tested runtime, manifests, and release-check scripts.
`validation.json` records the result boundaries and compressed artifact hashes.

The library now consists of the actual `@barocss/doc-sync` core and four
independent ProseMirror, Tiptap, Slate, and Lexical binding packages. Core has
eight entry points and no runtime or editor dependencies. All five packages
remain private at `0.0.0`. No commit, push, registry publication, or new remote
Pages deployment is established by this report.

| Check | Result | Boundary |
| --- | --- | --- |
| Workspace regressions | 1,326 PASS, two platform SKIPs | 1,328 distinct cases. The full run found one docs example-selector failure. After fixing its selector, the affected docs suite passed 36/36. Unchanged non-doc groups retain their full-run results. |
| Core suite | 959/959 PASS | Includes all previous 956 cases and three actor-profile regressions. |
| Root types and five-package build | PASS | Source type checking and compiled ESM/declarations. |
| Packed consumers | Seven cases PASS | Five tarballs, dependency-free core, four bindings, combined native Tiptap, and independent Slate patch. Public profile type imports compile. |
| Changesets rehearsal | PASS | Temporary-copy 0.1.0 versions and peer ranges; Slate-only 0.1.1 patch; source versions/lock unchanged; private flags retained. No publish. |
| Chrome | Eight native binding cases PASS | ProseMirror, Slate, Lexical, Tiptap in local and queued in-page sync modes. Trusted input, selection, undo/redo, history ownership, reconnect, and refresh. |
| Count-mode invariants | 32 paired rows PASS | Same candidate legacy/unified routes at 10k/100k. Models, History, counts, native stats match. Required operation comparison 28/28; four external pairs have an existing recorder-route exception. |
| CRDT source preservation | 17/17 exact byte matches | Compared former core files at base HEAD with relocated core files. |
| Docs | 36 tests PASS; 45 pages, 2,072 links | English and local-path checks pass. |

Chrome bundle SHA-256:
`13ca5adf71a3a993f381b4215068b2b2262664403c177faf2eb1b31f5e049f23`.
The fresh bundle contains contributing modules from exactly the five packages.
Local mode has zero hub/subscription/send/presence counters. Both modes have no
page or console errors in the completed retry. The browser session was closed.

The first Chrome attempt timed out in automation after three local cases passed.
Its captured application state remained healthy. It is retained separately from
the completed serial retry. Optional fresh storage-browser checks did not finish
because of automation timeouts and are **NOT_RUN/incomplete**. Existing local
state regressions passed in the core suite; that is not a new browser-storage
acceptance result.

Timing, browser paint latency, operating-system IME, HTTP document-server Chrome
restarts, new live Codex runs, and new Rust differential runs were **NOT_RUN** in
this migration. Previous Node Slate and Chrome local p95 flags remain
**INVESTIGATE**. Count-mode and source identity do not clear those timing flags.

Actor IDs remain replica identities. Optional copied/frozen profiles add name,
color, avatar, userId, human/bot kind, and bounded JSON metadata. They do not
authorize edits or enter document/History checkpoints. Presence uses profile
defaults while retaining explicit display-field overrides. Local restore accepts
the current profile separately and preserves its saved actor ID.

Historical receipts and benchmark results retain their original source paths and
hashes. The active benchmark layout helper can select a detached old core layout.
The first release still needs a license decision, final metadata, npm publishing
identity, and explicit publication approval. The private MCP application's
pre-existing Zod advisory is outside the five dependency-free-core/binding package
transition and remains a separate compatibility task.
