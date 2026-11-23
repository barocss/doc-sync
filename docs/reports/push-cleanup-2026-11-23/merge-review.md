# Documentation merge resolution — 2026-11-23

Reviewed the exact index stages 1 (merge base), 2 (local source checkpoint
`ee9b6dd`) and 3 (incoming `origin/main`, `ecf3f0a`) for both conflicted files.
Only `README.md` and `apps/docs/src/roadmap.md` were resolved here.

The root README keeps the incoming concise structure, executable local Client
snippet, package table, schema/preflight links, AI/bot entry, lifecycle guidance,
and documentation/check commands. A dedicated native SDK section preserves the
local bounded schema, model-path/batch/strict-ID/grid/column APIs and catalog
prototype. It links the full guides rather than restoring the replaced long
README. The catalog's five focused plus 30 inherited tests remain explicitly
historical prototype evidence; production Client/WASM and broader gates stay open.

The public roadmap keeps both the local native model-path/schema-editing section
and incoming AI delivery slices, issue links, conservative schema interruption,
and two-actor schema corpus. The incoming statement that all local native work
is uncommitted is replaced with the separate evidence boundary appropriate to
the integrated source checkpoint. It does not upgrade either lane's acceptance.

Conflict markers are absent and scoped `git diff --check` passes. No Cargo/npm
checks were run here. Files remain unstaged for root review and merge completion.
No product source, sealed reports, other agent files, Git refs, or index entries
were changed by this resolution task.
