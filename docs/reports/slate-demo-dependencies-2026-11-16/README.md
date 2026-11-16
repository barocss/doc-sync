# Explicit Slate demo dependencies

Issue: https://github.com/barocss/doc-sync/issues/7

The client/local demos directly import Slate and Slate React but did not declare
these runtime dependencies. The four bundle failures were reproduced on detached
pre-change ba132a2. The fix adds exact demo dependencies: slate 0.146.0 (existing
core unchanged), slate-react 0.147.6 and slate-dom 0.147.3. Official npm peer metadata
allows Slate >=0.121.0 and React/React DOM >=18.2.0, matching the existing installation.
No existing locked package version was changed. Unrelated libc metadata was retained.

Validation: frozen `npm ci --ignore-scripts`, workspace build, full demo suite
152/152 PASS, and root TypeScript PASS. A dedicated manifest/lock regression also
checks explicit pinned runtimes; the existing client/local tests exercise real
bundling rather than stubs. No long-duration load or browser UI result is claimed.

The full dependency audit reports three existing vulnerable package entries (two moderate, one
high) in unchanged hono, @hono/node-server and zod entries. They are not Slate
runtime additions; this fix does not claim a clean overall security audit or run
an unrelated breaking `audit fix --force`.
