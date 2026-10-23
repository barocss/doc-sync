# Getting started

Use Node.js 22.18 or later. The repository runs TypeScript directly and has one library package, a demo app, a documentation app, and private benchmarks.

## Run the repository

```sh
git clone https://github.com/barocss/doc-sync.git
cd doc-sync
npm ci
npm test
npm run dev
```

The demo runs at `http://localhost:5410`. Open `/pm?doc=example` to connect the demo editor and ProseMirror to the same document. Use `?doc=` to isolate test documents. The demo saves its log in the local `data/` directory.

The library is not published on npm yet. The imports in these guides resolve through the installed repository workspaces.

## Create and replicate a document

<!-- executable-example -->
```ts
import assert from "node:assert/strict";
import {Doc, type Schema} from "@barocss/doc-sync";

const schema: Schema = {
    root: "content",
    marks: ["bold"],
    nodes: {
        content: {shape: "flow", children: ["paragraph"], default: "paragraph"},
        paragraph: {shape: "text"},
    },
};
const alice = new Doc("alice", schema);
const bob = new Doc("bob", schema);
const {ops} = alice.edit([
    {op: "insert", at: [0, 0], content: "Hello"},
    {op: "update", at: [0, 0], length: 5, attrs: {bold: true}},
]);

for (const op of ops) bob.apply(op);
assert.deepEqual(bob.toJSON(), alice.toJSON());
assert.deepEqual(alice.toJSON(), {
    type: "content",
    children: [{type: "paragraph", runs: [{text: "Hello", marks: {bold: true}}]}],
});
```

This example verifies local application and replication in memory. A networked editor also needs actor sequencing, validation, reconnect handling, and garbage-collection pins. Use [SyncClient and DocHub](./sync) for those layers.

## Run the documentation app

```sh
npm run docs:dev
npm run docs:build
npm run docs:check
npm run docs:preview
```

The documentation build writes to `apps/docs/dist`. The public site uses the `/doc-sync/` base path. The build copies three authoritative reference pages from `docs/`: the state specification, collaboration-intent rules, and editing API design. Edit those originals rather than their generated copies.
