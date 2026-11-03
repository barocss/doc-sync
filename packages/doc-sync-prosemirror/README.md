# @barocss/doc-sync-prosemirror

Draft package. This workspace is private and has not been published. `publishConfig.access` records the intended public registry access. Remove `private` only in a separately approved registry release.

Run `npm install` and `npm run build` from the repository root with Node 24. The package exports ESM JavaScript and TypeScript declarations from `dist`. `npm run check:packages` packs all library packages and installs the tarballs into isolated consumers.

Install this package with `@barocss/doc-sync` and its required editor peers listed in `package.json`. The package does not bundle core or editor code.

The draft internal compatibility range is `>=0.0.0 <0.1.0`. A binding patch can advance within this range without changing core or sibling package versions. This is a local artifact policy, not registry release evidence. A future 0.1 minor release must set and verify its own supported ranges.

`new PmBinding(client, info)` accepts `Client` from
`@barocss/doc-sync/client`, `LocalClient`, or the legacy `SyncClient`.
The binding keeps the exact `.client` reference and creates a separate host for
each view. A `Client` without a transport edits in memory. Add a transport to
use synchronization with the same binding constructor.

`PmHostBinding` still accepts an explicit `EditorHost`. Call `dispose()` on
unmount to remove that view's observer. The client can remain in use by other
views.
