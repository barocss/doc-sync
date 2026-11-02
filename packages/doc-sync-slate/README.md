# @barocss/doc-sync-slate

Draft package. This workspace is private and has not been published. `publishConfig.access` records the intended public registry access. Remove `private` only in a separately approved registry release.

Run `npm install` and `npm run build` from the repository root with Node 24. The package exports ESM JavaScript and TypeScript declarations from `dist`. `npm run check:packages` packs all six packages and installs the tarballs into isolated consumers.

Install this package with `@barocss/doc-sync-core` and its required editor peers listed in `package.json`. The package does not bundle core or editor code.

The draft internal compatibility range is `>=0.0.0 <0.1.0`. A binding patch can advance within this range without changing facade or sibling package versions. This is a local artifact policy, not registry release evidence. A future 0.1 minor release must set and verify its own supported ranges.

`SlateHostBinding` accepts the shared `EditorHost` contract. Use
`createSyncClientEditorHost(client)` from `@barocss/doc-sync-core/editor`
for the current TypeScript backend. The legacy binding constructor and exact
`.client` reference remain supported. Call `dispose()` on unmount.
This interface does not provide a selectable Rust/WASM backend.
