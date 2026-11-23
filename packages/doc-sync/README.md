# @barocss/doc-sync

Draft package. This workspace is private and has not been published. `publishConfig.access` records the intended public registry access. Remove `private` only in a separately approved registry release.

Run `npm install` and `npm run build` from the repository root with Node 24. The package exports ESM JavaScript and TypeScript declarations from `dist`. `npm run check:packages` packs all six packages and installs the tarballs into isolated consumers.

Compatibility facade. The root, `/sync`, `/server`, and `/node` use `@barocss/doc-sync-core`. `/prosemirror`, `/tiptap`, `/slate`, and `/lexical` require the matching `@barocss/doc-sync-<editor>` package and its required peers. Binding peers are optional so core-only installations do not install editors.

The draft internal compatibility range is `>=0.0.0 <0.1.0`. A binding patch can advance within this range without changing facade or sibling package versions. This is a local artifact policy, not registry release evidence. A future 0.1 minor release must set and verify its own supported ranges.
