# Editor integration paths

The repository verifies four editor implementations. They share the same document engine and collaboration rules. Their integration APIs have different maturity levels.

## Choose a starting point

| Editor | Implementation | Example |
|---|---|---|
| ProseMirror | Public `PmBinding`, schema builder, and conversion helpers in `@barocss/doc-sync/prosemirror`. | [ProseMirror guide](./prosemirror) |
| Slate | Prototype adapter in the compatibility demo. It maps native operations, model state, selections, and composition drafts. | [Slate guide](./slate) |
| Lexical | Prototype adapter in the compatibility demo. It maps editor updates, model state, selections, and composition drafts. | [Lexical guide](./lexical) |
| Custom demo editor | Repository editor built directly on document commands and token positions. | [Model operations](./editing) and [demo source](https://github.com/barocss/doc-sync/tree/main/apps/demo/ui) |

Slate and Lexical adapters are working test/demo implementations. They are not additional public package entry points. The package does not export `SlateBinding` or `LexicalBinding`.

## Run the three-editor comparison

```sh
npm install --prefix apps/demo/compat --workspaces=false --package-lock=false --cache /tmp/doc-sync-compat-npm-cache
npm run build --prefix apps/demo/compat
npm start --prefix apps/demo/compat
```

Open the URL printed by the compatibility server (port 5412 by default). Two Slate editors, two Lexical editors, and one ProseMirror editor join the same CRDT document. A separate backend is started with the comparison demo. Keep this development server separate from production deployment.

## What the tests establish

The latest core integration verified 31 compatibility unit tests, 84 Chrome input cases, and 20 ordinary cases (18 native/model/server convergence checks and 2 probes). Another 30 operation traces were captured across the three editor implementations.

These checks cover tested text/table edits, remote changes, cursor restoration, reset, reconnect, undo/redo, and simulated composition paths. They do not establish universal support for every native editor command, real OS IME acceptance, or production readiness.

## Adapter responsibilities

1. Convert native editor state and operations into `NodeJSON` and model edits.
2. Apply local changes once and commit their wire operations.
3. Apply remote model events without feeding them back as new local edits.
4. Restore selections through stable token identities after remote updates.
5. Keep active composition drafts separate where required by the native editor.
6. Use collaboration history for shared undo/redo, and verify native/model/server convergence.

[Read the shared editing contract →](./editing)
