# Document rules and persistent ranges

A shape describes how a node stores content. Rules describe how that content can appear. The same nine shapes support required children, field-level attributes, persistent annotations and block placement.

## Child counts

Add `childRules` to a flow. Each key must name one of that flow's declared children. Bounds are integers from 0 to 1000. An omitted minimum means 0. An omitted maximum means no upper bound.

```ts
const schema: Schema = {
    root: "document",
    marks: [],
    nodes: {
        document: {
            shape: "flow",
            children: ["paragraph", "figure"],
            default: "paragraph",
        },
        paragraph: {shape: "text"},
        figure: {
            shape: "flow",
            children: ["image", "caption"],
            default: "caption",
            childRules: {
                image: {min: 1, max: 1},
                caption: {min: 1, max: 1},
            },
        },
        image: {shape: "atom", attrs: {src: {default: ""}}},
        caption: {shape: "text"},
    },
};
```

A missing required child uses a stable, editable fallback identity. Concurrent insertions can exceed a maximum in stored state. The document selects visible children in a deterministic order and retains the remaining candidates. It does not reject a remote insertion because a local count has changed. Use `doc.overflow(lineKey)` to inspect retained candidates. These rules are part of the schema; all replicas must use the same schema.

## Nested attributes

A scalar attribute remains one last-writer-wins register. Add `fields` to an object attribute when its declared leaves must merge independently.

```ts
const paragraph = {
    shape: "text",
    attrs: {
        appearance: {
            default: {color: "black", spacing: {before: 0, after: 0}},
            fields: {
                color: {default: "black"},
                spacing: {
                    default: {before: 0, after: 0},
                    fields: {
                        before: {default: 0, min: 0},
                        after: {default: 0, min: 0},
                    },
                },
            },
        },
    },
};
```

An update is a patch. Omitted leaves keep their values. Setting a branch to `null` resets its declared descendants to their defaults. Setting a leaf to `null` resets that leaf. Arrays remain atomic values.

```ts
const {ops} = client.doc.edit([
    {op: "update", at: [0], attrs: {appearance: {spacing: {before: 12}}}},
]);
client.commit(ops);
```

If one user changes `color` and another changes `spacing.before`, both changes remain. Concurrent changes to one leaf use the existing Ticket order. Undo changes an owned leaf only while that exact write is current. An explicit same-value write still records ownership. Unknown fields, dangerous property names and malformed field paths are rejected. Field schemas apply to stored text, inline, nested flow, grid and atom nodes, and to cell attributes. Schema validation rejects `fields` on the root, row, cell-body flow, group and span attribute positions. Value marks do not support `fields`.

## Persistent annotations

Presence describes a connected user's current selection. An annotation stores a range and metadata in the document. It can survive a disconnect. Annotations can overlap without rewriting text formatting.

```ts
import {
    createAnnotation,
    updateAnnotation,
    deleteAnnotation,
    getAnnotations,
} from "@barocss/doc-sync";

const created = createAnnotation(
    client.doc,
    {anchor: [0, 2], focus: [0, 6]},
    {message: "Check this phrase", resolved: false},
    {expand: "none"},
);
client.commit(created.ops);

client.commit(updateAnnotation(client.doc, created.id, {
    data: {resolved: true},
}));

const annotations = getAnnotations(client.doc);
client.commit(deleteAnnotation(client.doc, created.id));
```

These helpers apply their operations locally. Commit the returned operations once. Annotations use ordinary client history, snapshots and replication. Their metadata is stored outside `doc.toJSON()` content.

Paths use UTF-16 offsets, with one position per inline node. The default `expand: "none"` excludes insertions at either end of a nonempty range. `start`, `end` and `both` include insertions at the selected boundary. Interior insertions remain inside the range. A collapsed range with `none` remains a point after an insertion at that point. An expansion option lets it grow around that insertion.

Resolve annotations again after document changes. Check each record's status before displaying its range. Missing, compacted, hidden and cross-slot endpoints do not become a range at the start of the document. The returned metadata remains available when a range cannot be displayed. The application provides the comment UI, access control and author identity.

## Block placement

Use the `move` editing operation to change a block's position while retaining its identity and contents. See [model operations](./editing) for path rules and [collaboration intent](../reference/collaboration-intent) for ownership and undo rules. Row and column edits retain their separate table contract.

## Transport compatibility

Provide the same schema to each client and to `new DocHub({schema})` for these capability contracts. The schema-free server path does not provide placement or required-slot validation. Protocol 3 includes schema identity and rejects protocol 2 peers. `SyncClient` waits for a compatible `hello` before sending queued changes. The hello must advertise `placement-v1`, `fields-v1`, `annotations-v1` and `cardinality-v1`, and the server schema fingerprint or explicit schema-free marker. An incompatible server leaves local pending changes intact and sets `client.connectionError`.

A document epoch also identifies the server generation. A clean reconnect to a different epoch replaces the model and clears old history. If unconfirmed edits remain, the client disconnects with an explicit error and retains its local model and pending changes. The demo gives each process a new epoch, so a restart uses the same safe blocking rule. Invalid snapshots are rejected before pending changes are acknowledged or removed.

`HttpTransport` advertises the version automatically. A custom HTTP client must send `protocol=3`, its remembered `epoch`, and its schema fingerprint on the SSE stream. It must send `x-doc-sync-protocol: 3`, `x-doc-sync-epoch`, and `x-doc-sync-schema` on change requests. Acknowledgments and presence use the epoch header; leave beacons use an epoch query parameter. Stale-epoch or schema-mismatch writes return HTTP 409. The demo server returns HTTP 426 for unsupported versions before applying those requests. Custom transports and servers must enforce the same compatibility boundary. Protocol versioning is not authentication.
