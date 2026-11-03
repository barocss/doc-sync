# Custom schemas and editor mappings

Define the shared data rules first. Then define how each editor displays and
edits those rules. All replicas of one model need the same data schema identity.
They can use different editor mappings.

| Layer | Contains | Shared between replicas? |
| --- | --- | --- |
| Data schema | Node or cell-field names, types, defaults, constraints and allowed children | Yes |
| Editor mapping | Native node names, renderers, inputs, commands and selection conversion | No |
| Session | Actor identity, history, pending changes and transport | Managed per replica |

Keep application rendering functions outside the schema. The existing tree
`ui` metadata remains supported and remains part of schema identity. Moving
existing `ui` data out of a schema changes its identity; do not do this during
an active session without a supported transition.

## Stored data and live interaction

DocumentSchema, GraphicSchema and SpreadsheetSchema describe accepted document
data. Keep transient cursor, selection, drag and typing previews in a separate
presence protocol. A view can choose its preview renderer without changing the
replicated schema identity.

For example, a numeric cell can temporarily contain the input text `-` or `1e`.
The peer may display that text while the committed model still contains a
number. Validate the final parsed value when the user commits it. Do not relax
the stored field rule merely to admit partial input.

| State | Contract | Lifetime |
| --- | --- | --- |
| Accepted cell or object value | Data schema and existing CRDT operations | Stored, synchronized and part of History |
| Active typing or selection | Validated presence target, field, bounded text, actor identity and sequence | Temporary; cleared on cancel/disconnect |
| A draft that must survive restart | Separate application persistence and recovery policy | Application-defined; ephemeral presence alone is insufficient |

The current spreadsheet adapter can also send optional UTF-16 text caret and
selection positions inside its preview. Document token selection and Graphic
pointer/object selection use their own adapters. Shared text/drag draft
rendering is not implied by metadata transport.

Presence still needs validation. Check target IDs, schema/mode binding, declared
field names, text length and update order. This is a transport contract, not a
new data shape or schema flag. The spreadsheet demo implements this separation;
it does not add a universal draft API to every public editor binding. Read
[Spreadsheet live previews](../guide/presence#spreadsheet-live-previews).

## Document nodes

`DocumentSchema` uses the existing tree shapes. Applications choose the names.
This schema can be supplied to a local or synchronized `Client`:

<!-- custom-document-example -->
```ts
import {Client} from "@barocss/doc-sync/client";
import type {DocumentSchema} from "@barocss/doc-sync";

const schema = {
    domain: "document", root: "article", marks: ["emphasis"], nodes: {
        article: {shape: "flow", children: ["body-line", "notice"], default: "body-line"},
        "body-line": {shape: "text", attrs: {speaker: {default: "author"}}},
        notice: {shape: "atom", attrs: {message: {default: ""}}},
    },
} as const satisfies DocumentSchema;

const client = new Client({schema});
client.edit([{op: "insert", at: [0, 0], content: "A shared article"}]);
```

Changing a type name also changes the schema identity. Treat a rename as a
migration, rather than a view label change. For a supported additive transition,
follow [Change an open editor's schema](../guide/schema-transition).

## Check an editor mapping

A shape describes storage. It does not install an editor node, command or
renderer. Declare the features that your adapter actually handles:

<!-- custom-editor-example -->
```ts
import {inspectEditorSchema} from "@barocss/doc-sync/editor";

const result = inspectEditorSchema(schema, {
    domains: ["document"], shapes: ["flow", "text", "atom"],
    nodes: {
        article: {mode: "semantic", nativeName: "document"},
        "body-line": {
            mode: "semantic", nativeName: "paragraph",
            attrs: {speaker: "semantic"},
        },
        notice: {mode: "opaque", attrs: {message: "preserve"}},
    },
    marks: {emphasis: "semantic"},
});
if (!result.supported) throw new Error(JSON.stringify(result.diagnostics));
// supported is true; semantic is false because notice is an opaque view.
```

`semantic` means the adapter declares meaningful rendering and editing.
`opaque` and `preserve` mean data is retained without that semantic support.
They produce warnings. Missing node, attribute, shape or mark handling produces
errors. Applications that require complete editing can require both
`result.supported` and `result.semantic`.

This is a preflight of declarations. It does not verify that a supplied renderer
works, or register one in an editor. Test the actual conversion, editing,
selection and History paths as well.

| Editor | Mapping work |
| --- | --- |
| ProseMirror | Build the native schema with `buildPmSchema`; supply suitable DOM and input behavior. Hyphens normalize to underscores. Colliding normalized names and the reserved native `text` name are rejected. |
| Tiptap | Use `createTiptapExtensions` and `DocSync`; generated ProseMirror names follow the same checks. Arbitrary StarterKit schemas are not interchangeable. |
| Slate | Use `toSlate`/`fromSlate` and the binding; provide element and leaf renderers, void behavior and input commands for custom nodes. |
| Lexical | Use `buildLexicalSchema`, its node classes and binding; configure the paragraph type for a renamed default block. Preserve model attributes through its codecs. |
| Custom editor | Map model paths and stable anchors to your input/selection representation through the editor host. |
| Canvas or grid | Provide a separate scene or cell adapter. Document text bindings reject graphic schemas and do not accept `SpreadsheetSchema`. |

The same custom document fixture is tested through native ProseMirror, Slate
and Lexical states, with Tiptap extension generation. This is headless
conversion proof; it does not prove a complete custom-node browser interface
for every editor.

## Graphic objects

Use `createGraphicSchema()` for the built-in graphic contract. For application
node names, bind the ID helpers to the actual `GraphicSchema`:

<!-- custom-graphic-example -->
```ts
import {Doc, createGraphicHelpers} from "@barocss/doc-sync";
import type {GraphicSchema} from "@barocss/doc-sync";

const scene = {
    domain: "graphic", root: "stage", marks: [], nodes: {
        stage: {shape: "container", children: ["layer", "dot"]},
        layer: {shape: "container", children: ["dot"]},
        dot: {shape: "atom", attrs: {radius: {default: 1, min: 0}}},
    },
} as const satisfies GraphicSchema;
const objects = createGraphicHelpers(scene);
const doc = new Doc("designer", scene);
doc.edit([objects.insert(doc, null, 0, objects.createNode("dot", {radius: 4}))]);
const id = objects.objectAt(doc, [0]).id;
doc.edit([objects.update(doc, id, "dot", {radius: 8})]);
const current = objects.findObject(doc, id);
```

The factory supports stored `container`, `text` and `atom` descriptors.
Unsupported descriptors reject before editing. Helpers return ordinary edits;
apply them through the owner of synchronization and History. These helpers
currently need a TypeScript `Doc`, not a portable `Client` object port.

IDs refer to stored objects. Lookups resolve their current paths after moves;
a deleted ID does not silently select a different object. Lookup traverses the
visible object tree and can cost O(objects). This API is not an indexed lookup
performance guarantee. The factory validates data, not geometry, layout,
reference interpretation or rendering.

## Spreadsheet fields

`SpreadsheetSchema` is a separate experimental data contract. It is not a third
member of the existing tree `Schema` union. Its primitive stores only writes and
retained metadata, not every coordinate in the logical extent.

<!-- custom-spreadsheet-example -->
```ts
import {
    SparseSheet, createSpreadsheetSchema, spreadsheetSchemaVersion,
} from "@barocss/doc-sync";
import {inspectSpreadsheetSchema} from "@barocss/doc-sync/editor";

const tasks = createSpreadsheetSchema({domain: "spreadsheet", version: 1, fields: {
    title: {type: "string", default: "Untitled", maxLength: 30},
    progress: {type: "number", default: 0, min: 0, max: 100},
    archived: {type: "boolean", default: false},
}});
const mapping = inspectSpreadsheetSchema(tasks, {fields: {
    title: {mode: "semantic", editorType: "string"},
    progress: {mode: "semantic", editorType: "number"},
    archived: {mode: "semantic", editorType: "boolean"},
}});
if (!mapping.supported || !mapping.semantic) throw new Error("Incomplete sheet view");
const options = {sheetId: "tasks", rows: 1_000_000_000, columns: 16_384, schema: tasks};
const alice = new SparseSheet({...options, actor: "alice"});
const bob = new SparseSheet({...options, actor: "bob"});
bob.receive(alice.setCell(999_999_999, 16_383, {title: "Launch", progress: 25}));
const emptyTitle = bob.getCellValue(0, 0, "title"); // "Untitled"; no allocation
const version = spreadsheetSchemaVersion(tasks);
const restored = SparseSheet.fromState(alice.captureState());
```

Fields accept `string`, finite `number`, `boolean` or a scalar union. Optional
constraints are `values`, numeric `min`/`max`, and string `maxLength` in UTF-16
units. Enum choices are non-null. A schema contains 1–128 fields; each enum has
1–256 choices. Descriptors must be finite JSON data, with no functions or accessors.

`null` clears a stored field. `getCell` returns stored visible values;
`getCellValue` resolves the declared default without allocating a cell. Defaults
are not broadcast as writes. Concurrent writes merge per field. Local undo
checks the exact current writer and preserves another actor's change.

Custom operations carry a canonical `schemaVersion`. Custom checkpoints include
the descriptor and identity and use the v2 format. Wrong identities, unknown
fields, invalid values and corrupt replay state reject before mutation.
Identity is independent of object key order. The descriptor's `version: 1`
identifies its format; it is not an application migration counter.

Omitting `schema` keeps the legacy five-field v1 state and operation format.
Explicitly supplying even the default descriptor opts into schema-bound v2.
These modes are not interchangeable. Select the mode before editing.

Fixed-axis `SparseSheet` does not implement structural edits. The separate
[`StructuralSheet`](./spreadsheet-structure) uses the same custom field
descriptor with stable axis identities. Neither API implements `Client`,
`DocHub`, live schema transitions, formulas, durable transport or GC. See the
[sparse API and collaborative demo](./spreadsheets).

## Native Rust support

The private native Cargo SDK loads supported descriptors without rebuilding the
engine. Each document owns its compiled schema. Distinct schemas can coexist.

| API | Supported custom data | Remaining boundary |
| --- | --- | --- |
| `RuntimeSchema` + `RuntimeDocument` | Graphic container/text/atom types, names, attributes, field registers and boolean marks | No renderer, graphic selection or Client adapter |
| Same runtime API, document domain | Flat root flow with custom text/atom names, scalar attributes and boolean marks | Nested flows, tables, groups, inline/span, value marks and advanced rules reject during compilation |
| `SpreadsheetSchema` + `RuntimeSheet` | Arbitrary scalar field registry, defaults, constraints, schema-bound operations, History and checkpoint replay | Fixed numeric axes; no Client, formulas or GC |

Unsupported descriptors return an error with a schema path. The six older
`SchemaPreset` document APIs and fixed graphic APIs remain available. They do
not imply that all tree shapes are supported by the runtime API.

See [Rust runtime examples](../guide/rust#runtime-custom-schemas) for Cargo use.
These APIs are native Rust only. They do not provide a WASM CRDT engine, npm
engine selector, live schema transition or cross-runtime transport adapter.


## Shared maps and lists

Use [Shared maps and lists](../guide/shared-data) when your application needs
keywise records or ordered shared values without supplying an application
Schema. Use Client with createDataSchema and client.data. This access layer still uses a fixed internal encoding Schema. Its optional
local value validator does not replace authoritative remote admission or make
existing domain schemas interchangeable. Collaborative text keeps using
existing text nodes; Map string values are atomic.
