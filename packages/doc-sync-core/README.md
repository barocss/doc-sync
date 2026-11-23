# @barocss/doc-sync-core

Draft package. This workspace is private and has not been published. `publishConfig.access` records the intended public registry access. Remove `private` only in a separately approved registry release.

Run `npm install` and `npm run build` from the repository root with Node 24. The package exports ESM JavaScript and TypeScript declarations from `dist`. `npm run check:packages` packs all six packages and installs the tarballs into isolated consumers.

The core has no external runtime dependencies. Public entries are the root, `/sync`, `/server`, `/node`, `/editor`, and `/engine`. Root and sync imports do not require an editor.

`SyncClient` accepts `engineFactory: typescriptClientEngineFactory` from `/engine` or `/sync`. The selected engine owns live document and History state and drives the client, editor hosts and input sessions. TypeScript is the default and the only production implementation. The separate immutable `typescriptEngine` API remains an experiment. See [ENGINE-CONTRACT.md](./ENGINE-CONTRACT.md) for ownership, checkpoint and compatibility rules. No Rust/WASM backend is supplied.

The draft internal compatibility range is `>=0.0.0 <0.1.0`. A binding patch can advance within this range without changing facade or sibling package versions. This is a local artifact policy, not registry release evidence. A future 0.1 minor release must set and verify its own supported ranges.
