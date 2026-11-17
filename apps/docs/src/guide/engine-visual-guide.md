<script setup>
import EngineLab from "../components/EngineLab.vue";
</script>

# How the schema-driven engine works

DocSync separates the **shared document contract**, the **replicated token state**,
and the **editor view**. On narrow screens, scroll a figure horizontally to read it.
A schema is not a UI component, a lock, or an access policy.
The figures below explain the current TypeScript engine. They are explanatory
schematics, not browser screenshots or a promise of every possible conflict outcome.

<ClientOnly>
<EngineLab />
<template #fallback><p>The live engine example loads in your browser. Enable JavaScript to use Next step; the explanations below remain readable without it.</p></template>
</ClientOnly>

Use **Next step** to watch the hub reject an actual table proposal, two independent local
insertions, convergence, A’s Undo, and A’s offline edit followed by reconnect.
The rejected proposal is created on a separate scratch document so neither client
is poisoned by an intentionally invalid edit. Low-level `Doc.edit()` can construct
that operation; the rejection occurs at `DocHub.submit()`, not automatically at
every local edit boundary. Applications must validate their editing inputs.
The three document cards, pending counts, models and operations are read from the
running engine. The transport deliberately waits for the delivery steps; this
makes concurrency visible without claiming real network or restart testing.
The explanatory diagrams below are a separate overview, not the live output.

## 1. One schema, several representations

<div class="operation-figure" tabindex="0" role="region" aria-label="Schema and document representations">

![An application schema supplies rules to editing, model projection and server checks. Model paths become stable token operations; the editor renders the projected model.](/engine-diagrams/schema.svg)

</div>

For example, a `content` flow may allow `paragraph` children, use `paragraph` as
its default, and allow the `bold` mark. A paragraph's `text` shape tells the engine
how its body behaves. Names belong to the application; shapes define behavior.

1. The application supplies the schema to each participant and the server.
2. An edit such as inserting text at `[0, 2]` addresses the **current model**.
   The engine compiles it into operations using stable token identities.
3. The engine projects token state into a schema-shaped model. Normalization
   and defaults belong to this contract; the model is not a second replicated tree.
4. A binding maps that model and selection to an editor. The application still
   supplies supported native nodes, plugins and rendering.

Paths can change after a remote edit. They are not the identities sent on the wire.
Likewise, the schema does not automatically provide every editor with support for
every node. See [schema rules](./schema), [model operations](./editing), and
[custom editor mappings](../schemas/custom).

**The boundary matters:** `checkSchema` diagnoses schema definitions;
`DocHub.submit()` checks a whole incoming change before applying it. The schema
version handshake rejects mismatches when the server has a schema. This is not
authentication, authorization, business-rule approval, or automatic migration.
Application policy remains separate. Compatible additive schema changes have a
[separate transition procedure](./schema-transition); incompatible changes need
an application-managed migration.

## 2. An edit travels, not an entire editor

<div class="operation-figure" tabindex="0" role="region" aria-label="Local editing and synchronization flow">

![Client A edits locally, records history and queues token operations. The hub checks and sequences the change, then Client B applies it and updates its editor. Acknowledgment clears only confirmed pending work.](/engine-diagrams/sync.svg)

</div>

`Client.edit()` applies locally, records the action and, in sync mode, queues it
once. Do not commit its result again. Each active replica has a distinct actor ID;
several views of one Client share that actor and History.

The hub checks actor sequence and operation validity before accepting a change,
then assigns a document-wide `serverSeq`. The transport delivers accepted
changes and acknowledgments. Other clients apply token operations and their
bindings update the view. Dependencies must arrive before operations that refer
to them: `Doc.apply()` is not an arbitrary out-of-order dependency buffer.
Presence is a separate, ephemeral channel, not document content or History.

A Client without transport is local-only. It has no pending synchronization queue.
Disconnecting a synchronized Client does **not** turn it into a local-only Client.
See [Client](./client) and [synchronization](./sync) for the API contracts.

## 3. Concurrent changes and per-actor Undo

<div class="operation-figure" tabindex="0" role="region" aria-label="Concurrent insertions and local actor undo">

![Two replicas insert distinct letters before receiving each other's edit. They exchange token operations and converge. Undo on A removes A's insertion while retaining B's insertion.](/engine-diagrams/concurrency.svg)

</div>

In the small example, A inserts `A` and B inserts `B` into the same empty
paragraph before either receives the other operation. Both replicas retain both
insertions and converge after delivery. The relative order follows token ordering,
not a server choosing one whole document as the winner. The figure intentionally
does not prescribe a universal alphabetical or arrival-order rule.

Each participant records its own actions. A's Undo produces operations for A's
recorded insertion; it does not restore an old global document snapshot or erase
B's insertion. Those undo operations must also be synchronized. Redo is likewise
an operation, not replacement of the shared document.

This insertion example is not a blanket promise that every conflict preserves
all visible effects. Deletions, formatting ownership, structural moves and
normalization have specific semantics. History can group typing, and history/GC
protection matters for later Undo. See the [collaboration intent contract](../reference/collaboration-intent).

## 4. Disconnect is different from process loss

<div class="operation-figure" tabindex="0" role="region" aria-label="Reconnect and durable recovery boundaries">

![A live disconnected client retains local history and pending operations, reconnects under verified schema and epoch, and retries unconfirmed work. A restarted process instead requires a saved checkpoint and recovery protection; unsafe recovery stops.](/engine-diagrams/recovery.svg)

</div>

**Ordinary disconnect:** the live client retains local state, History and pending
changes in memory. On reconnect, the protocol verifies the session and schema,
reconciles server state and acknowledges accepted work. Already accepted work is
not a new edit. Only confirmed pending work is removed; remaining operations can
be retried. Schema or epoch problems can stop this path rather than silently
replacing protected local work.

**Process restart:** memory is gone. Capturing state is not saving it, and saving
a server snapshot does not save a participant's History or pending queue. The
application must persist the appropriate client checkpoint and establish the
required epoch/GC recovery protection. The macOS MCP app and single-process demo
have a bounded recovery path with exact receipts and a recovery reservation.
An unresolved conditional outcome or unsafe recovery blocks edits for inspection.

Portable `captureState()` format 2 is not automatic durable recovery.
`LiveRecovery` and the Node journal use the TypeScript format-1 checkpoint path;
portable durable recovery remains future work. See [recovery conditions and limits](../reference/recovery-plan)
and [local save/open](./local-storage).

## Implementation and verification map

| Explanation | Implementation / regression evidence |
| --- | --- |
| Schema rules, model paths and token operations | [`schema.ts`](https://github.com/barocss/doc-sync/blob/main/packages/doc-sync/src/crdt/schema.ts), [`edit.ts`](https://github.com/barocss/doc-sync/blob/main/packages/doc-sync/src/crdt/edit.ts), [`model.ts`](https://github.com/barocss/doc-sync/blob/main/packages/doc-sync/src/crdt/model.ts) |
| Accepted change boundary | [`hub.ts`](https://github.com/barocss/doc-sync/blob/main/packages/doc-sync/src/server/hub.ts), [`schema-version.test.ts`](https://github.com/barocss/doc-sync/blob/main/packages/doc-sync/test/schema-version.test.ts) |
| Concurrent insertion and Undo example | [`engine-visual-guide.test.mjs`](https://github.com/barocss/doc-sync/blob/main/apps/docs/test/engine-visual-guide.test.mjs) |
| Broader concurrent/History cases | [`scenarios.test.ts`](https://github.com/barocss/doc-sync/blob/main/packages/doc-sync/test/scenarios.test.ts), [`history-recovery.test.ts`](https://github.com/barocss/doc-sync/blob/main/packages/doc-sync/test/history-recovery.test.ts) |
| Reconnect and recovery gates | [`reconnect.test.ts`](https://github.com/barocss/doc-sync/blob/main/packages/doc-sync/test/reconnect.test.ts), [`recovery-reservation.test.ts`](https://github.com/barocss/doc-sync/blob/main/packages/doc-sync/test/recovery-reservation.test.ts) |

The live example uses `components/engine-lab.mjs`, shared with its regression tests.
The diagrams' editable SVG sources live in `apps/docs/src/public/engine-diagrams`.
When the protocol changes, review the prose, diagrams and linked tests together.
