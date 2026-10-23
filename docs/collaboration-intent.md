# Collaborative Intent Preservation Rules

This document defines expected results when deletion, formatting, insertion, movement, nested fields, annotations, and undo overlap. The fixed regression matrices below retain their original test scope.

**Convergence** means that replicas receiving the same valid operations produce the same model. **Intent preservation** means that the merge result retains the defined editing semantics. Convergence alone cannot satisfy the meaning of the text or every user's wishes. The cases below do not validate all document semantics agreed by people.

## 1. Reading Guide and Assumptions

Examples start with plain ASCII `abc` or `abcd`. `X` and `Y` are new characters. Plain text means that the model's `marks` do not contain `bold: true`.

- **Concurrent**: each user creates an operation from the same baseline before receiving the other's change. This does not mean the same wall-clock millisecond.
- **After observation**: the replica applies the earlier change before creating the next operation. Delivery-order tests preserve this causal order.
- Numeric positions are model paths at operation creation. Generated deletion and formatting operations target the token IDs selected then. They do not select characters again at shifted numeric positions on receipt.
- Undo cancels the relevant edit record for each actor. Baseline input and the action under test are not grouped into one record.
- Guarantees apply while history records and target tokens remain available. They do not cover GC after clearing history, lease-expiry recovery, or undo restoration across sessions.

Stored position `Pos.o` uses UTF-16 token units. The fixed cases below use ASCII. These results do not establish grapheme-level editing or actual OS IME behavior. See the [state specification](spec.md#known-character-unit-limits) for character-unit limits.

## 2. Existing Rules

### 2.1 Deletion and Formatting Are Separate States

Deletion adds a deletion ID to a token. Formatting records a write Ticket on a token attribute. A valid formatting write can apply to a deleted, uncompacted token. Applying Bold to a hidden character does not restore it. Cancelling the deletion makes it visible with its current formatting.

If another actor also deleted the character, cancelling only one deletion leaves it hidden. Deletion undo cancels only the deletion ID in its own record.

### 2.2 A Range Is the ID Set Selected at Creation

Deletion and formatting ranges contain the targets observed in that Doc when the operation was created. They do not retroactively delete or format new IDs concurrently inserted into that range by another user. Insertion undo also deletes only its own insertion IDs. Characters inserted by others using those IDs as references remain.

Formatting is not a persistent rule for all future characters inserted in a region. This choice preserves the concurrent formatting/insertion contract in `features.test.ts`.

### 2.3 New Input Receives Formatting at Creation

Default text input reads inheritable marks from **the left character observed in the Doc that creates the operation** and includes them in the insertion operation. It does not reread the left character's latest marks on receipt. At the start of a block there is no left character in that block, so this inheritance does not apply. Explicit marks override default inheritance.

The demo schema inherits Bold, Italic, and similar marks. Links are not inherited by default. Consumers with other schemas must follow their schema's `inherit` contract. References are `insertText` in `commands.ts`, `insertUnits` in `edit.ts`, `inheritedMarks` in `model.ts`, and `text` application in `doc.ts`.

Concurrent insertion can therefore differ from insertion after observing formatting. Marks already assigned to a new ID are not targets of another actor's formatting undo on the original characters.

### 2.4 Tickets Decide Writes to the Same Attribute

Different mark keys can coexist. Applying Bold and Italic to the same character retains both. For different values of the same key, the larger write Ticket wins. Compare the Lamport number first, then the actor string. Arrival speed and physical time are not compared.

Independent writes of the same value still have different write IDs. Ownership of the current write can change even when the display does not.

### 2.5 Formatting Undo and Redo Check Currently Known Writes

`History.SetStep` records pre-edit and post-edit state for each target token and attribute key. Each state contains a value and write Ticket. A value is written only when the current Ticket exactly matches the post-edit state for undo or the pre-edit state for redo. Redo is possible only if undo actually applied to that target.

Consecutive writes in the same `History` share state references when their actual previous Tickets match. Successful undo and redo update the restored state's Ticket to the new operation ID. This link allows on→off→undo→undo and the reverse redo sequence. State values do not change.

- If another write was **already received** before undoing earlier formatting, the current Ticket differs and the target is skipped. New writes of the same value are also protected. If only part of a range changed, only the remaining targets are undone.
- If a new record has a different actual previous Ticket, the state link is broken. Equal actor names or values do not create a link. Unrecorded writes by the same actor and writes in separate `History` instances remain distinct.
- Undo writes the value observed before the action, and redo writes the action's value, **with a new Ticket**. They do not overwrite an old model or elect a winner again among historical competing writes.
- If an unreceived remote write competes with undo, a local check cannot protect it. Ordinary LWW merges the two writes.
- These conditions do not guarantee continued accumulation of everyone's formatting intent. The winner-undo rule in I04 also remains in effect.

### 2.6 Movement Preserves Content Identity

A move changes placement while retaining node and text identities. Concurrent typing and formatting continue to address that content. Placement records resolve in total Ticket order; projection suppresses a move that would create an ancestry cycle. This decision is recomputed from the retained records, so arrival order does not permanently choose a different cycle outcome.

A move can reorder a block or group in a flow or move it into a compatible nested flow. It does not define arbitrary text-range, inline-node, row, or column movement. Logical paragraph joins retain physical fragments after movement, so merge, later split, and concurrent edits do not require copying the text into new identities. Move undo checks current placement ownership and skips a later observed move by another writer.

Post-move split undo checks both its join state and the tail's placement. If another writer has moved the tail and that move was received, undo does not pull it back into the original paragraph. An unrecorded same-actor move also breaks ownership. If a later move was recorded in the same history, undoing that move restores the shared placement Ticket; the earlier split can then be undone. Split/merge chains share restored join Tickets and retain their original text identities through undo and redo.

### 2.7 Nested Fields Have Independent Ownership

An attribute is atomic unless its schema declares `fields`. Declared leaves then have separate LWW keys. A width change and a theme change can both survive; two changes to width compete by Ticket. Omitted patch leaves keep their values, while null resets a declared leaf or branch to defaults. An explicit write of the current value still claims ownership with a new Ticket. Editor model diffs emit only changed leaves to avoid claiming unrelated values.

Undo checks each leaf's actual write Ticket. A received same-value write by another actor can therefore prevent an earlier undo even when the visible value did not change. Legacy object attributes keep their atomic behavior. Fields are not arbitrary object-path mutation: the schema fixes the safe JSON structure and rejects unknown paths.

Fields apply to text, inline, grid, atom, and cell attributes, and to stored flow containers whose type is neither the root nor a cell-body flow type. Declare list fields on the text item type. Schema validation rejects fields on the root, rows, cell-body flow types, groups, spans, and value marks. These restrictions prevent accepting field data at positions that cannot store it independently.

### 2.8 Child Counts Are a Projection Rule

A flow's `childRules` selects visible candidates deterministically. A maximum hides excess candidates without deleting their identities or content; deletion or undo can expose them later. A minimum supplies a deterministic editable required slot instead of having every replica insert a different replacement. A required type stays fixed. These rules preserve convergence under concurrent insertion; they do not promise that every author's preferred candidate remains visible.

### 2.9 Annotations Retain Boundaries and Report Unresolved Ranges

Annotation endpoints retain left and right token identities plus affinity. Expansion policy controls insertion at the start or end boundary. Annotation data keys have independent LWW ownership; create/update/delete operations use shared history. A move can change an endpoint's logical location while retaining its token identity.

Deleted, hidden, cross-slot, missing, or compacted references must follow the annotation resolver's explicit status. An unresolved annotation has no resolved range and is not moved to an unrelated visible cell. Live annotations pin their endpoint identities against GC. The storage contract does not supply conflict review, suggestions, or a comment UI.

## 3. Regression Case Matrix

Each row maps to the same ID in `packages/doc-sync/test/intent-preservation.test.ts`. Intermediate states are also tested. The highlighted characters described below must agree with the complete `NodeJSON` and marks in the actual tests.

| ID | Initial State and Actions | Expected Merge and Undo Results |
|---|---|---|
| I01 | `abc`. A deletes `c`; B makes `c` or `bc` Bold; C concurrently inserts plain `X` between `b/c`. | `c` is hidden and `X` remains plain. If B selected `bc`, live `b` is bold. A undo restores `c` with B's marks. Undoing B first leaves the deletion in place. Undoing both A/B gives plain `abXc`. Redo of each record restores the initial merge result. |
| I02 | `abcd`. A deletes `bc`; B deletes `c`; C inserts `X` between `b/c`. | Initially `aXd`. A undo alone gives `abXd`; B undo alone gives `aXd`. Cancelling both deletions gives `abXcd`. New `X` is not a target of another actor's deletion or undo. |
| I03 | After merging the `bc` formatting case in I01, C writes Bold true or false again on live `b`, and A/B receive it. | A/B undo and redo do not overwrite C's value or write Ticket. After undoing both, true gives `abXc` with only `b` bold; false gives plain `abXc`. C's new same-value write and `X` remain. |
| I04 | A/B independently write `bold=true` to the same plain characters. | With equal Lamport numbers, actor B wins. Losing A's undo is skipped. Winning B's undo writes the plain state B observed. It does not elect A's losing Bold again. Both undo orders produce plain characters. |
| I05 | `abc`. A makes `bc` Bold. B receives it, then inserts `X` between `b/c`. | `bXc` is bold. After A's formatting undo, original `b/c` are plain, but `X` retains the bold marks inherited at creation. B's insertion undo deletes only `X`. Undoing both gives plain `abc`. |
| I06 | `abcd`. A makes `bc` Bold; B makes `cd` Italic. | `b` is Bold, `c` Bold+Italic, and `d` Italic. Each undo cancels only its own key. Undoing both gives plain `abcd`; redo restores both marks. |
| I07 | `ab`. A inserts `X` between them. B receives it, inserts `Y` after `X`, and makes `X` Bold. | Merge gives `aXYb` with only `X` bold. A undo gives `aYb`; A redo gives `aXYb` with only `X` bold. B's `Y` and formatting Ticket on X remain. |
| I08 | `abc`. A independently writes Bold=true on `bc`; B writes Bold=false on the same targets. | With equal Lamport numbers, actor B's false wins, giving plain `abc`. Both server acceptance orders converge to B's value and write Ticket. |
| I09 | Generate formatting undo before receiving another user's write. | Undo is also a new attribute write. Competition with an unreceived write follows Ticket LWW. Remote writes are not unconditionally protected. |
| I10 | `abcd`. A/B concurrently press Enter after seeing the same `b/c` boundary. | It appears as one split, `ab│cd`. Undoing one marker retains the split; undoing both gives `abcd`. Redoing either or both still gives `ab│cd`. The existing rule remains: a new Enter after observation creates a separate split. |

I04 does not claim to satisfy every person's intent. It specifies the result defined by current LWW and conditional undo. In I05, removing `X`'s marks through A undo would overwrite the insertion attributes B actually created. These cases are distinct.

### 3.1 A Concrete Link Conflict for I09

Apply URL0 to plain `b` and deliver it to everyone. User U changes it to URL1 and everyone receives that change. The other user then creates a URL2 write. Before receiving it, U creates undo that writes URL0. These two writes have the same actual Lamport number.

- If U is actor `Z` and the other user is `A`, the undo Ticket is larger, so URL0 remains. U redo writes URL1.
- If U is actor `A` and the other user is `Z`, URL2 remains. U redo sees different current ownership, skips the write, and retains URL2.

Both server acceptance orders are checked for each case. URL0/1/2 are `https://zero.example`, `https://one.example`, and `https://two.example` in the tests. This case makes explicit that formatting undo does not always preserve unreceived remote changes.

## 4. Test Observation Relationships and Criteria

Independent cases deliver the baseline document to everyone, then create operations in each local Doc first. Only the `commit` call order changes server acceptance order. Tests do not violate actor FIFO or apply a dependent operation before creation of its reference token. In cases with input after observation, the earlier change is delivered first.

The tests check all of the following:

1. Initial deletion and formatting targets are the intended IDs in the baseline state.
2. Actual server acceptance order matches the plan for that run.
3. The complete fixed model and marks match after merge, each undo, and each redo.
4. All client and hub models match, pending is 0, and a fresh snapshot interpretation matches.
5. Formatting ownership cases check write Tickets as well as values.

Two replicas producing the same incorrect model is insufficient to pass. These are finite cases of permitted operation permutations, not proof for every schedule.

```sh
node --test packages/doc-sync/test/intent-preservation.test.ts packages/doc-sync/test/history-format.test.ts
FUZZ_SEEDS=3000 PM_SEEDS=300 npm test
npm test --prefix apps/demo/compat
npm run typecheck
```

Use Node 22.19.0. Default `npm test` also includes the new `.test.ts` files. Added case counts and the latest execution record are in [HANDOFF §5.12](../HANDOFF.md#512-fixing-consecutive-formatting-undoredo-2026-10-23).

## 5. Consecutive Formatting Undo and Redo Regressions

Starting from plain `ab`, A turns Bold on for `a`, turns it off, and undoes twice to return to plain `ab`. Two subsequent redos pass through bold `a` and return to plain `ab`. In the previous implementation, an older record did not recognize the new Ticket from the first undo and skipped the second undo. This defect is fixed. HANDOFF §5.12 records the 3 baseline failures and post-fix runs.

`packages/doc-sync/test/history-format.test.ts` checks the following 19 executions. HF07 has both true and false cases.

| ID | Fixed Regression Scope |
|---|---|
| HF01–HF03 | Repeated undo/redo of on/off, consecutive writes within one commit, different previous values in overlapping ranges |
| HF04–HF06 | Different mark keys, link values/removal, consecutive block-type changes |
| HF07–HF09 | Observed remote partial writes to the same key, same-value writes between undos, preservation of another key |
| HF10–HF11 | Unrecorded writes by the same actor and separate History instances are not treated as owned records |
| HF12–HF14 | Discarding redo on a new branch, clearHistory, discarding old records at depth 100 |
| HF15–HF16 | Partial overlaps inside a group, no restoration of stale local ownership after restoring a remote previous value |
| HF17–HF18 | New branch after undo of the same key, repeated redo/undo preserving remote partial writes after successful undo |

At each step, all clients and the hub are compared with fixed complete models. Pending 0 and snapshot reinterpretation are checked. Remote-write preservation cases check values and actual Tickets. The state-reference cache belongs only to that History and is not included in wire or snapshot data. Discarding records releases references; clear empties the stacks and cache. A limit of 100 groups is not an absolute memory bound for every document.

Reproduce from the repository root. The final output must be plain `ab` with no remaining `bold: true`.

```sh
node --input-type=module <<'JS'
import {MemoryNet} from './packages/doc-sync/test/harness.ts';
import * as cmd from './packages/doc-sync/src/crdt/commands.ts';
const net = new MemoryNet(), a = net.add('A'), b = net.add('B');
a.connect(); b.connect();
try {
  await net.settle();
  a.commit(cmd.insertText(a.doc, {b: 0, o: 0}, 'ab'), null);
  await net.settle();
  for (const value of [true, false]) {
    a.commit(cmd.setMark(a.doc, {b: 0, o: 0}, {b: 0, o: 1}, 'bold', value));
    await net.settle();
  }
  a.undo(); await net.settle();
  a.undo(); await net.settle();
  console.log(JSON.stringify(a.doc.toJSON()));
} finally {
  a.disconnect(); b.disconnect();
}
JS
```

## 6. Scope Not Completed by This Specification

- Bold without a selection uses local demo `typingMarks`. An empty-range core `setMark` does not change existing characters. These core tests do not establish UI state during subsequent input, cursor movement, or IME.
- Existing separate tests cover default link noninheritance, Unicode undo, structure/tables/hidden cells, same-position Enter, and GC pins. The new matrix does not replace that entire scope.
- HANDOFF §5.12 records the Chrome regression scope for the fixed History. CDP composition input does not establish actual OS IME behavior. Screen performance was not remeasured for this fix; previous measurements remain historical evidence for their source version.
- This scope excludes automatic merge satisfying contradictory edits, conflict-review UI and suggestion mode, long-term history retention, lease-expiry recovery, and approval of intent preservation for the complete product.

## 7. Extended Capability Evidence and Epoch Boundaries

`move.test.ts`, `nested-fields.test.ts`, `cardinality.test.ts`, and `annotations.test.ts` check the extended contracts with fixed models and relevant identities. Their results are separate from the historical I01–I10 and HF matrices. A passing baseline matrix alone does not certify the added capabilities through every native editor.

Protocol 2 requires the declared document capabilities and an epoch. A reconnect across epochs with unconfirmed changes stops with an explicit error and preserves local data. A clean reconnect loads the new snapshot, clears old history, and cancels composition drafts through reset hooks. The demo creates a new epoch even after restarting from an equivalent persisted log, so pending edits also stop in that case. This policy avoids replaying old-generation edits into a replacement document; it does not automatically recover or discard them. See the [synchronization contract](spec.md#7-synchronization-and-reconnection).
