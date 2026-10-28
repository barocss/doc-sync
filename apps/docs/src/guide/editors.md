# Editor integration

Choose an editor binding, give it a `SyncClient`, and keep `doc.edit()` as the shared document interface. All bindings use the same document engine and collaboration history.

| Editor | Public entry point | Guide |
| --- | --- | --- |
| ProseMirror | `@barocss/doc-sync/prosemirror`: `PmBinding`, schema builder, conversion helpers | [ProseMirror](./prosemirror) |
| Slate | `@barocss/doc-sync/slate`: `SlateBinding`, schema codec, selection helpers | [Slate](./slate) |
| Lexical | `@barocss/doc-sync/lexical`: `LexicalBinding`, schema builder, codecs, selection helpers | [Lexical](./lexical) |
| Custom editor | `@barocss/doc-sync`: `doc.edit()` and model operations | [Editing](./editing) and [blocks](./blocks) |

These are subpaths of one library, not separate packages. Editor dependencies are optional peers. Install only the peers needed by the entry points you use. The core CRDT, synchronization client, and server do not depend on native editors.

## What the bindings handle

The bindings convert native changes into model edits, apply them locally once, and commit the resulting operations. Remote changes update native state without creating another local edit. Selection is restored through stable document identities rather than old native paths or node keys.

Slate and Lexical include composition drafts. Native input edits the draft while the live client keeps receiving remote changes. Completion commits the original draft operations and displays the combined model. Both use CRDT undo/redo and provide explicit disposal. Read each guide for its composition wiring and history policy.

The application still supplies its schema, native rendering, toolbar, editor plugins, transport, and lifecycle. A codec's ability to retain data does not supply every native editing gesture for that data.

When the server accepts a compatible schema change, a mounted editor must rebuild its native schema and binding. The [open-editor transition guide](./schema-transition) shows the shared lifecycle and selection conversions for all three editors. Follow the [runnable examples](./runnable-examples) to try each editor in the product demo.

Slate and Lexical retain unchanged root blocks during remote projection. They replace the interval between the common prefix and suffix, using the existing schema codecs. Slate checks its immutable child array and verifies normalization. Lexical invalidates its cache on native content updates and reads back projected content before caching an editor state. Composition, unknown native states and cell restoration keep their recovery paths.

This reduces repeated conversion and native tree construction. It is not a complete incremental renderer: a changed root container is still rebuilt, comparisons can scan the document, Lexical readback still converts the full model, and local native input retains conversion costs. See the [remote editor performance report](https://github.com/barocss/doc-sync/blob/main/benchmarks/results/native-receive-2026-10-24/report.md) for Chrome measurements across the three product profiles.

Read [editor design lessons](./editor-lessons) for architecture differences, the selection/composition/table problems we solved, and the regression cases that expose them.

The [Word, Notion and presentation profiles](./product-schemas) also test headless conversion of larger schemas. A separate native demo now checks structured editing with all three bindings. Product layout and file fidelity remain separate integration work.

## Compare the editors

The comparison app uses the public Slate and Lexical entry points. It opens two Slate editors, two Lexical editors, and one ProseMirror editor on one document, with a separate client identity for each.

```sh
npm install --prefix apps/demo/compat --workspaces=false --package-lock=false --cache /tmp/doc-sync-compat-npm-cache
npm run build --prefix apps/demo/compat
npm start --prefix apps/demo/compat
```

Open the URL printed by the server; its default port is 5412. Use a new `doc` query value for an isolated document. The app starts a separate backend and temporary data directory. It does not use the original demo `data/` directory.

## Read the evidence at its tested scope

Library tests cover schema conversion, native edits, remote updates without echo, selection mapping, history, composition, reset, reconnect, and disposal. They use real headless Slate and Lexical editors.

The comparison app's browser scripts check native/client/server equality and input behavior. Historical browser results belong to their source versions; they do not automatically certify a later binding change. Inspect each result status and browser error, not only a script's exit code.

CDP composition is simulated browser input. Actual OS IME acceptance, product performance targets, production authorization, and separate document capability work require their own evidence. See [status and limits](../status).

[Start with one editing API →](./editing)
