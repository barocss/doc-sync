# Getting started

Use Node.js 22.18 or later. The repository has six library packages, demo apps, a documentation app, and private benchmarks. Public package exports use compiled JavaScript and type declarations.

## Run the repository

```sh
git clone https://github.com/barocss/doc-sync.git
cd doc-sync
npm ci
npm run build
npm test
npm run dev
```

The demo runs at `http://localhost:5410`. Open `/pm?doc=example` to connect the demo editor and ProseMirror to the same document. Use `?doc=` to isolate test documents. The demo saves its log in the local `data/` directory.

The six packages are not published on npm yet. They remain `private: true` at version `0.0.0`. The imports in these guides resolve through the installed and built repository workspaces. See [Packages and engines](./packages) for local tarballs, editor peers, and independent binding release preparation.

## Start an editor

Use [Client](./client) for both local and synchronized browser editors.
`new Client({schema})` runs in memory. Add `actor` and `transport` at construction
to use the existing synchronization backend. Pass either client to the same
editor binding; no host construction is required in ordinary application code.
Run `npm run dev:client` for all four editors. Existing low-level and legacy
client APIs remain supported.

## Choose a runtime

- For a networked browser editor, use the TypeScript client and an editor binding. See [editor integration](./editors).
- For a native Rust application, use the private Cargo path dependency and [native SDK quickstart](./rust#use-the-native-rust-sdk).
- To test a WASM UTF-16 buffer, use the [storage-only build and import recipe](./rust#use-the-storage-only-wasm-adapter).

See the [engine capability matrix](./packages#engine-selection-is-a-separate-milestone)
before choosing a runtime. The current `SyncClient` has no Rust/WASM engine selector.

## Create and replicate a document

<!-- executable-example -->
```ts
import assert from "node:assert/strict";
import {Doc, type Schema} from "@barocss/doc-sync-core";

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
