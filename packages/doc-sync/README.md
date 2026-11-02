# @barocss/doc-sync

Draft package. This workspace is private and has not been published. `publishConfig.access` records the intended public registry access. Remove `private` only in a separately approved registry release.

Run `npm install` and `npm run build` from the repository root with Node 24. The package exports ESM JavaScript and TypeScript declarations from `dist`. `npm run check:packages` packs all six packages and installs the tarballs into isolated consumers.

Compatibility facade. The root, `/client`, `/sync`, `/server`, and `/node` use `@barocss/doc-sync-core`. `/prosemirror`, `/tiptap`, `/slate`, and `/lexical` require the matching `@barocss/doc-sync-<editor>` package and its required peers. Binding peers are optional so core-only installations do not install editors.

The draft internal compatibility range is `>=0.0.0 <0.1.0`. A binding patch can advance within this range without changing facade or sibling package versions. This is a local artifact policy, not registry release evidence. A future 0.1 minor release must set and verify its own supported ranges.

`Client` is available at the root and `/client`. It uses a local backend without
a transport and the existing SyncClient with one. The same four client-facing
bindings accept either mode and create hosts internally. Existing constructors
and low-level hosts remain supported. See the repository Client guide.

Client(local) supports captureState/fromState for explicit JSON save/open through
caller storage, including document identities, actor, clock and History. Sync
recovery remains separate. See the repository local storage guide.
