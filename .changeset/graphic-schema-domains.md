---
"@barocss/doc-sync": minor
"@barocss/doc-sync-prosemirror": patch
"@barocss/doc-sync-tiptap": patch
"@barocss/doc-sync-slate": patch
"@barocss/doc-sync-lexical": patch
---

Add DocumentSchema and GraphicSchema domains with empty stored graphic containers.
Keep legacy document schema identity and editing rules. Reject graphic schemas
at document-only binding entry points and negotiate the container capability.
