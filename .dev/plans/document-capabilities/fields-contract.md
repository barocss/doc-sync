---
work_id: document-capabilities
artifact_type: integration-contract
status: ready_for_build
owner_role: nested-fields
source_request: Add collaboration for declared nested node, inline, and cell attributes
last_updated: 2026-10-24
---

# Nested-field contract

Only an attribute with `fields` opts into leaf-level collaboration. Attributes without `fields` keep whole-value LWW. `markValues.fields` is rejected by schema validation in this version. The public edit interface stays `doc.edit(EditOp[])`.

## Schema and values

Add `fields?: Record<string, AttrSpec>` to `AttrSpec`. A branch has a plain object default and a fixed `fields` record. Its default must equal the object assembled from child defaults, recursively. Leaf attributes use existing value/range/pattern constraints, plus JSON-only values. Arrays and objects without `fields` are atomic leaves. A leaf array default accepts arrays; an atomic object default accepts plain objects. `null` always resets to the declared default.

Do not combine `computed` or branch-level `values`, `pattern`, `min`, or `max` with collaborative branches. Constraints belong to leaves. The schema must be acyclic. Empty, `$`-prefixed, `__proto__`, `constructor`, and `prototype` names are rejected at every field path segment. Dot, slash, quote, and Unicode names are permitted and encoded without delimiter splitting. A path includes its outer attribute name and has at most `MAX_FIELD_PATH = 64` segments.

Values must be finite acyclic JSON data. Reject undefined, functions, symbols, bigint, nonfinite numbers, sparse/decorated arrays, class instances, accessors, and unsafe object keys. JSON data containers are bounded to 64 levels. Helpers copy returned values and never mutate input defaults, patches, or prior models.

## Edit semantics

For `attrs: {settings: {layout: {width: 320}}}`, only `settings.layout.width` receives a new Ticket. Omitted leaves stay unchanged. A null branch resets all declared descendant leaves through individual null writes. An empty object patch writes nothing.

An explicit same-value leaf write still emits an operation and receives a Ticket. Do not filter it out in the compiler. To avoid stamping unrelated fields, model `diffModels` must produce nested changed-leaf patches; that is the only layer that omits unchanged leaves.

Whole unencoded register writes to an opted-in object are rejected. During node/inline creation, omit the coarse object from `node.attrs` and emit leaf `set` operations after creating the node. No competing whole-object register is retained. Defaults require no registers. Explicit supplied leaf defaults still produce leaf writes.

## Wire and materialization

Each leaf uses an ordinary `set` Op with key `$field:` + canonical `JSON.stringify([attributeName, ...relativePath])`. Malformed, noncanonical, unsafe, unknown, branch-only, and overlong paths are invalid. `decodeFieldKey` returns null for malformed keys; server validation rejects them.

Cells use the existing namespace: `$cell:<row>,<col>|$field:<JSON>`. Row/column ownership validation is unchanged. The inner encoded path selects the cell attribute and its leaf.

Materialize each attribute from declared leaf defaults plus each winning leaf register. A missing or null register yields its default. A stored value invalid for the currently displayed type stays hidden and materializes the default for that leaf. Registers remain available if a later type uses them. Validation uses immutable birth shape and declared same-shape schema candidates, as existing attribute validation does; do not use current type or current model visibility to accept/reject a wire operation.

Every encoded leaf key reuses existing Doc LWW application, `priorOf`, and History state slots. Undo/redo checks each exact leaf Ticket and preserves later writes by other users, including same-value writes. Snapshot serialization must retain encoded keys, values, and Tickets without collapsing them into one object.

## Pure helper API: `src/crdt/fields.ts`

- `isFieldSpec(spec): boolean`
- `safeFieldName(name): boolean`, `fieldJsonOk(value): boolean`
- `fieldsSchemaProblems(attrs, prefix = "attrs"): string[]` validates only opt-in field attributes.
- `fieldValueOk(spec, value): boolean` accepts a valid leaf or declared partial branch patch, including null reset.
- `fieldSpecAt(spec, relativePath): AttrSpec | null` resolves declared leaves only.
- `flattenFieldPatch(spec, patch): {path: string[]; value: unknown}[]` keeps explicit same-value/default writes. Null branch reset expands to descendant null writes.
- `encodeFieldKey(attributeName, relativePath): string`
- `decodeFieldKey(key): {attr: string; path: string[]} | null`
- `materializeFields(spec, read): Record<string, unknown>`, where `read(relativePath)` returns `{value}` or undefined.
- `patchFields(spec, before, patch): Record<string, unknown>` preserves omitted leaves.
- `diffFields(spec, before, after): Record<string, unknown> | null` returns changed-leaf patches, using null when a changed leaf returns to its default.

## Integration checklist for the shared-core owner

1. `schema.ts`: add AttrSpec.fields; call fieldsSchemaProblems for every node attrs map; reject fields in markValues; make attrValueOk use fieldValueOk on opted-in attributes. Also reject reserved field wire names used as direct schema attributes.
2. `edit.ts validAttrs` (previous lines 477–480): separate normal initial attrs from field patches. After creating a node, emit encoded leaf sets for its supplied field values. Apply the same rule in fillHead/retype/inline creation and split inheritance. Preserve explicit same-value writes.
3. `edit.ts update` (previous lines 898–969): expand opted-in node/inline/group attrs into per-leaf sets. For cells, place the encoded key in the existing cell-attribute namespace. Branch resets expand to known descendants. Reject invalid patches before applying any partial edit batch.
4. `doc.ts check` (previous lines 527–573): recognize reserved encoded paths, resolve declared leaf specs with safe own-property access, validate with fieldValueOk, and preserve immutable same-birth-shape validation. Reject coarse writes to field attributes and fields on character marks.
5. `doc.ts attrsOf/defaultsOf/cellAttrs` (previous lines 1041–1054): materialize nested objects from leaf register lookups. Defaults and returned values must be copied. Keep LWW storage in the existing attrs Map; no separate mutable object cache.
6. `model.ts fullAttrs/applyEdit/attrsDelta` (previous lines 85–101, 612–621, 677–683): normalize branch values from defaults; patch opted-in objects deeply; use diffFields for changed-leaf patches with the correct node/cell attr spec. Preserve atomic behavior for all other attributes.
7. Keep existing History exact-key behavior (previous history.ts lines 76–84, 140–174); encoded leaf keys already have independent ownership. Test same-value remote leaf writes and partial undo/redo.
8. Public exports are the shared-core owner's decision. Keep the reserved wire format stable even if helper names remain internal.

## Required evidence

Standalone helpers: encoding, JSON safety, schema consistency, partial patch/reset, copying, type-dependent materialization, deep diff, explicit same-value writes.

Integrated MemoryNet: independent leaves in AB/BA server orders, same-leaf LWW, null reset races, whole attribute default behavior, explicit same-value Ticket and remote-owner preservation, undo/redo, snapshots, inline and cell attrs, malformed/reserved paths, field mark rejection, scalar attributes unchanged, and diffModels touching only changed leaves. Keep initial failures visible until integration hooks pass.
