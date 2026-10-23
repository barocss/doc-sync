---
title: Schema-defined collaborative documents
---

# doc-sync

<p class="lead">Define your document schema. Edit locally. Merge changes by stable token identity.</p>
<p class="package-name">@barocss/doc-sync · TypeScript · Development release</p>

doc-sync is a document CRDT with a synchronization client, a transport-independent server, and ProseMirror, Slate and Lexical bindings. The application provides the schema. The core works with document shapes rather than built-in paragraph or table names.

## Start with a small document

```ts
import {Doc, type Schema} from "@barocss/doc-sync";

const schema: Schema = {
    root: "content",
    marks: ["bold"],
    nodes: {
        content: {shape: "flow", children: ["paragraph"], default: "paragraph"},
        paragraph: {shape: "text"},
    },
};

const doc = new Doc("alice", schema);
doc.edit([{op: "insert", at: [0, 0], content: "Hello, shared document."}]);
console.log(doc.toJSON());
```

[Run the complete example →](./guide/getting-started)

## Learn the contracts

- [Schema shapes](./guide/schema) define text, inline nodes, flows, groups, and grids.
- [Five model operations](./guide/editing) connect an editor to stable CRDT operations.
- [Editor integration paths](./guide/editors) include ProseMirror, Slate, Lexical, and the custom demo editor.
- [Collaboration intent](./reference/collaboration-intent) defines deletion, formatting, insertion, and undo outcomes.
- [State and wire contract](./reference/spec) describes ordering, validation, reconnect, and garbage collection.

## Know the current limits

The package is a source workspace with `private: true`. It is not yet an npm release. Lease-expiry recovery, production authorization, schema migration, and long-term deployment validation remain open. Convergence does not guarantee every user's semantic intent.

[Read status and limits →](./status)
