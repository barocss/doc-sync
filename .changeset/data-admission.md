---
"@barocss/doc-sync": minor
---

Add guarded Map/List server admission through createDataHub before persistence
or application. Reject duplicate retained IDs, malformed atomic values and
invalid references while preserving concurrent edits and History. Add detached
Client snapshots for safe retained-reference reads. Guarded data GC is disabled
until compaction can preserve identity metadata; generic DocHub is unchanged.
