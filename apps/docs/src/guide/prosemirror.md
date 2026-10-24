# ProseMirror

The optional binding builds a ProseMirror schema from the document schema and converts transactions to model operations. ProseMirror packages are peer dependencies of this entry point.

## Create the binding

```ts
import {EditorView} from "prosemirror-view";
import {buildPmSchema, PmBinding} from "@barocss/doc-sync/prosemirror";

const info = buildPmSchema(schema);
const binding = new PmBinding(client, info);
const view = new EditorView(document.querySelector("#editor"), {
    state: binding.state,
    dispatchTransaction: binding.dispatch,
});
binding.view = view;
binding.onChange = () => view.updateState(binding.state);
```

Use the CRDT client's history for collaboration-aware undo and redo. Do not add a separate ProseMirror history as the authority for shared changes.

This is a minimal mount. Supply the keyboard and editing plugins required by your editor. Wire undo and redo keys to `client.undo()` and `client.redo()`. See the [complete demo](https://github.com/barocss/doc-sync/blob/main/apps/demo/ui/pm-app.ts) for plugin and toolbar wiring.

## Transaction handling

Common insertion, deletion, split, merge, and mark steps are converted directly where possible. Other steps use model comparison. The binding checks canonical results and reconciles the editor when needed.

Remote updates use a replacement transaction for the changed range. ProseMirror maps its selection through that transaction. Model and conversion caches depend on both the `Doc` instance and its version, so snapshot or reset replacement does not reuse the wrong document.

## Merged cells and model reads

ProseMirror contains only visible table cells. The shared document retains covered cells, including their content, marks and attributes. `PmBinding` supplies the current model as a reference during conversion. Merging cells therefore preserves covered content for unmerge and collaboration-aware history.

If your application calls the conversion helper directly, pass the matching full model as its fourth argument:

```ts
import {canonical} from "@barocss/doc-sync";
import {fromPmJSON} from "@barocss/doc-sync/prosemirror";

const model = canonical(schema, fromPmJSON(info, schema, view.state.doc.toJSON(), client.doc.toJSON()));
```

A native document alone cannot reconstruct content that it does not contain. Returned covered-cell data is copied from the reference. Application commands that edit the core document directly should call `binding.pull()` after committing their operations to refresh the view.

## Input limits

Automated Chrome tests include remote edits during simulated composition and cursor mapping. They are not a substitute for real OS keyboard and IME acceptance tests. The basic `/pm` demo and the Slate/Lexical compatibility demo have separate input implementations.

See [status and limits](../status) before using the binding in a production editor.
