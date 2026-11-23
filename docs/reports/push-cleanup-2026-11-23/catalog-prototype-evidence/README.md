# Q1.3.4 native target catalog: local prototype

`read_model_with_catalog` returns one captured model, original local edit base,
visible stored primary block paths/types/flow capability, grid-owned axes and
uncovered cell tuples/body paths. It does not expose synthetic wrapper IDs or
covered descendants. Paths are diagnostic at that base; IDs alone do not grant
authority and all editing commands still revalidate. Root/default synthetic
positions are not stored entries. Existing projected-Document targeting scope
applies; the example includes a flow schema to activate model projections.

Thin catalog collection avoids copying each nested model subtree. Wire, core,
checkpoint and history formats are unchanged. No long-running load was run.

## Verification

Five focused catalog tests plus30 existing block/grid/column targeting tests
PASS (35 total). Runnable example PASS. Independent read-only review completed
and its stored-covered-descendant regression request was implemented. Initial
failed fixture/example attempts are preserved separately, not counted as pass.
Inherited source changes are restricted to SDK exports, shared walker and the
new catalog files; all other baseline native sources remain byte-identical.

## Publication and next work

Not committed or pushed: runtime paragraph/targeting/grid/column source depends
on a substantial inherited uncommitted D2/D3 foundation absent from remote main.
Publishing just these additions would not form a standalone compilable change.
Do not silently stage that foundation. Remaining catalog qualification includes
broader required/nested fixtures, independent comparison and complete consumers.
This is a local implementation milestone, not Q1.3.4 full closure.

Separately, nightly issue #1 was fixed by commit6d10c27 on remote main; that
commit contains only four workflow lines and no native/WIP changes.
