# @barocss/doc-sync-tiptap

Draft package. This workspace is private and has not been published. `publishConfig.access` records the intended public registry access. Remove `private` only in a separately approved registry release.

Run `npm install` and `npm run build` from the repository root with Node 24. The package exports ESM JavaScript and TypeScript declarations from `dist`. `npm run check:packages` packs all five packages and installs the tarballs into isolated consumers.

Install this package with `@barocss/doc-sync` and its required editor peers listed in `package.json`. Also install `@barocss/doc-sync-prosemirror`. Tiptap shares that public ProseMirror binding and the same upstream ProseMirror classes. The package does not bundle core or editor code.

The draft internal compatibility range is `>=0.0.0 <0.1.0`. A binding patch can advance within this range without changing core or sibling package versions. This is a local artifact policy, not registry release evidence. A future 0.1 minor release must set and verify its own supported ranges.

```ts
import {Client} from "@barocss/doc-sync/client";
import {DocSync, createTiptapExtensions} from "@barocss/doc-sync-tiptap";

const client = new Client({schema}); // No transport: memory-only editing.
const extensions = [...createTiptapExtensions(client.schema), DocSync.configure({client})];
```

Add `actor` and `transport` to the client options to enable synchronization. `DocSync` also accepts a legacy `SyncClient` or a `LocalClient`. Each local view has its own host and subscription, so two editors can share one local client and its history. Local mode does not publish presence. A sync backend supports one Tiptap editor; using its legacy client and its unified client does not bypass this ownership rule. Destroy the editor to remove its callbacks and release this claim. The client remains owned by the caller.

Use `docSyncUndo` and `docSyncRedo` for CRDT history. Do not add Tiptap history or another collaboration extension. Run a history command in a separate chain from document edits.
