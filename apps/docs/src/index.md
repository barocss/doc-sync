---
title: Schema-defined collaborative documents
---

# doc-sync

<p class="lead">Define your document schema. Edit locally. Merge changes by stable token identity.</p>
<p class="package-name">@barocss/doc-sync · TypeScript · Development workspace</p>

doc-sync is a document CRDT with a synchronization client, a transport-independent server, and ProseMirror, Tiptap, Slate and Lexical bindings. The application provides the schema. The core works with document shapes rather than built-in paragraph or table names.

## Start with a small document

```ts
import {Client, type Schema} from "@barocss/doc-sync";

const schema: Schema = {
    root: "content",
    marks: ["bold"],
    nodes: {
        content: {shape: "flow", children: ["paragraph"], default: "paragraph"},
        paragraph: {shape: "text"},
    },
};

const client = new Client({schema});
client.edit([{op: "insert", at: [0, 0], content: "Hello, shared document."}]);
console.log(client.model());
```

[Use the same Client with or without a transport →](./guide/client)

## Learn the contracts

- [Schema shapes](./guide/schema) define text, inline nodes, flows, groups, and grids.
- [Model operations](./guide/editing) connect an editor to stable CRDT operations, including block movement.
- [Editor integration paths](./guide/editors) include ProseMirror, Slate, Lexical, and the custom demo editor.
- [Change an open editor's schema](./guide/schema-transition) explains selection restoration and pending changes.
- [AI and bots](./ai/) has a separate path for [document server connection](./ai/server), MCP editing, bot missions, and recovery.
- [Client demo](./guide/client#run-the-four-editor-demo) runs all four editors; the [Codex walkthrough](./guide/ai-walkthrough) covers headless collaboration.
- [Troubleshooting](./guide/troubleshooting) and [operations and performance](./guide/operations-performance) cover recovery and measurement limits.
- [Collaboration intent](./reference/collaboration-intent) defines deletion, formatting, insertion, and undo outcomes.
- [State and wire contract](./reference/spec) describes ordering, validation, reconnect, and garbage collection.

## Know the current limits

The ten packages export compiled JavaScript and declarations but remain `private: true`. They are not yet npm releases. The macOS MCP app has bounded restart and lease-expiry recovery with the demo server; production recovery, authorization, incompatible schema migration and long-term deployment validation remain open. Convergence does not guarantee every user's semantic intent.

[Read status and limits →](./status)
