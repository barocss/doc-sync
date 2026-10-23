# Annotation contract

This module stores persistent range metadata outside the content model. It uses existing `node`, `set`, `del`, and `undel` operations. A client commits returned operations through its normal history and sync path.

## Reserved storage

- Slot: `$annotations`, owned only by `ROOT`.
- Head: `slotTicket(ROOT, '$annotations')`, key `0@0@~root/$annotations`.
- Internal node born type: `$annotation`.
- Each annotation has one ordinary token identity. Its node ID is its public ID.
- Birth attributes require `anchor` and `focus`. Those are the only endpoint fields.
- Data fields use canonical `data:${encodeURIComponent(key)}` keys. Each field stores `{value: JSONValue}`. A `null` wire value removes that data field; `{value:null}` stores a JSON null.
- Endpoint and data fields are separate LWW registers. No operation rewrites an annotations array or document marks.
- Reserved nodes are excluded from content materialization. Snapshot and restore retain their metadata line.

## Public functions

- `createAnnotation(doc, {anchor, focus}, data?, {expand?}?) -> {id, ops}`
- `updateAnnotation(doc, id, {range?, expand?, data?, removeData?}) -> ops`
- `deleteAnnotation(doc, id) -> ops`
- `getAnnotations(doc) -> AnnotationRecord[]`

Input paths use UTF-16 token offsets. Returned operations have already been applied to `doc`. `client.commit(ops)` records ordinary collaboration history. Updating a range without an explicit expansion option uses `none`. An explicit same-value data update still records a new write and its ownership. An empty patch returns no operations.

Each stored endpoint is `{left: tokenKey, right: tokenKey | null, affinity: 'left' | 'right'}`. A null right token denotes the end of the text block that owns the left token. The annotation retains the original anchor/focus orientation.

## Boundary rules

For a non-collapsed range, default `expand: 'none'` gives the start right affinity and the end left affinity. Boundary insertions stay outside. `start`, `end`, and `both` include the corresponding boundary insertions. Interior insertions remain inside.

A collapsed range with `none` is a right-associated point: both endpoints move after a boundary insertion. Any expansion option makes a collapsed range grow around an insertion at that point. This avoids an inverted range for a collapsed annotation with no expansion.

Each endpoint uses the logical flow of its affinity side: the left token for left affinity, and the right token for right affinity. With a null right token, right affinity resolves at the end of the left token's owning text block. After a move, the opposite adjacent token can be in another flow. That alone does not make the endpoint unresolved. If the independently resolved anchor and focus use different flows, the record has `cross-slot` status.

Deleted endpoints remain attached to their existing tombstones and resolve at the nearest surviving position within the same visible logical line. Missing, compacted, hidden, and cross-slot endpoints produce explicit statuses and no guessed model range. No missing key is passed to the core's document-start fallback.

The core supplies `doc.tokenLocation(key): {line, visible} | null`. The module uses this logical location after moves, not an Item's birth line. The core must retain the relative location of moved deleted endpoint tokens as well as live tokens.

## Core hooks

The module exports constants and pure validators. It imports `Doc` only as a type.

- `validateAnnotationEndpoint(value, referenceExists?) -> string | null`
- `validateAnnotationAttribute(key, value, referenceExists?) -> string | null`
- `validateAnnotationAttributes(attrs, referenceExists?) -> string | null`
- `isAnnotationDataKey(key) -> boolean`
- `annotationEndpointKeys(doc) -> Set<string>`

`referenceExists` checks immutable token facts, including IDs created earlier in the same Change. It must reject annotation metadata tokens, row/column tokens, and other non-content tokens as endpoint references. Visibility and current liveness are not server validation criteria, because concurrent delivery can change them. Local creation requires exact visible content positions.

`Doc.get()` lazily creates only the exact root metadata head. `Doc.check()` accepts `$annotation` nodes only in that line, validates their birth endpoint attributes, and restricts sets to allowed annotation fields. Reserved nodes cannot acquire content types or accept content operations. The reserved head cannot be deleted or modified. GC calls `annotationEndpointKeys()` and protects referenced Items of live annotations, including tombstones, against compaction. Deleted annotations release those pins.

JSON values must be finite, acyclic JSON trees. Prototype-poisoning keys are rejected at every depth. Data is never interpreted as HTML.

## Verification

The fixed Node 22.19 suite has 27 passing tests. It covers boundary affinities, backward/collapsed/overlapping ranges, interior insertions, endpoint deletion, split/join, hidden/restored cells, UTF-16/inline/span offsets, independent concurrent data fields, same-field LWW, ownership-aware history, snapshots, GC pins, malformed reserved operations, same-Change endpoint references, both receipt orders, duplicate delivery, content-owner moves, paragraph moves, whole-paragraph boundary affinities, moved tombstones, root/default paragraphs, and post-move split/merge/resplit. The move test uses existing wire operations and checks exact endpoint IDs and new model paths after a cross-parent move.

Missing and compacted read statuses use fault injection at the storage read boundary. Normal live annotations pin their endpoint tokens. These tests do not establish browser comment UI or operating-system IME acceptance.
