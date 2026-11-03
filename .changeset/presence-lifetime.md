---
"@barocss/doc-sync": patch
---

Refresh remote Presence receipt time for accepted newer sequences even when
their state is unchanged. Restore locally expired entries without allowing
replayed sequences to extend their lifetime.
