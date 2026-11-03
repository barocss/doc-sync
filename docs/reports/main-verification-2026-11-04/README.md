# Main publication verification

The integrated TypeScript workspace passes 2,110 cases: 2,108 PASS, zero FAIL,
two expected platform SKIPs and zero cancelled. The final run takes 107.599 s.
TypeScript passes in 8.802 s. The private native Cargo suites also pass: SDK 48,
shadow core 78 and storage experiment 13. Cargo 1.87.0 uses the locked manifests
in offline mode with separate output target directories. These native checks do
not establish a complete Rust/WASM editor, server, transport or MCP backend.

The Rust delivery is incomplete. The default Client, MCP, server and editor
bindings use TypeScript. Native Document/Graphic/SparseSheet and runtime schema
APIs provide only the subsets described in the Rust guide. Full nested schema
coverage, production recovery/GC parity, shared Client.data Map/List, complete
WASM CRDT SDK and selectable Rust/WASM bindings remain open. No crate or npm
registry release is part of this main publication.

The final source map covers 1,429 runtime/test/fixture/config files and is
unchanged during the final full run. Product code retains its preceding
qualification; this review also fixes test readiness and documents delivery limits. Package artifacts and 12
isolated consumers passed on that same runtime in the preceding checkpoint.
Earlier Chrome receipts retain their original source and scope; no new Chrome
or mobile run is claimed. Performance prototypes that failed their prospective
gates remain excluded from the production source. The historical MCP incident's
exact cause remains unknown; the separate reproduced recovery defects and their
fixes are recorded in the MCP restart report.

Compressed full logs and [results.json](results.json) preserve the test counts
and hashes. Documentation and remote CI are separate gates recorded in HANDOFF
and the commit's GitHub Actions runs.

## Final test-readiness correction

A subsequent precommit full run failed when a retention test received HTML 200
instead of JSON. Its exact request URL was not retained. A controlled two-owned-
server probe independently reproduces the same error class: a fragmented listen
banner reports real port 59587, but the old helper selects partial port 5958 and
contacts an HTML decoy. This does not prove the missing historical URL.

Twenty test files now require a complete newline after the URL port at all 22
matcher sites. Two live process cases cover the normal split and an occupied
prefix port. The latter leaves an existing listener untouched. The actual helper
control fails before the change; the corrected live/retention focus passes 9
cases. Retention JSON diagnostics now record URL, status, type and a bounded body
prefix on failure. The earlier failed full log remains archived.

After the final fix and independent review, all 2,110 cases pass or take their two
expected platform SKIPs. No source change occurred during this canonical final
run. This result replaces the earlier intermediate publication checks; it does
not erase their failure or claim the old MCP incident's exact cause.
