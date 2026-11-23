# Presence hot-path source audit

Candidate `host-binding.ts` retains the existing model-cache, decoration generation and PM path conversion flow. It calls `host.stamp()` to check generation/revision, `host.status().online` instead of `client.online`, `host.presence()` instead of `client.others.values()`, and `host.locateAnchor(key, "visible")` instead of the inline Item/visibility/path resolver.

Core `sync-client-host.ts` implements stamp by comparing Doc identity and reading Doc.version. It allocates a small stamp object. Cached `model()` only calls Doc.toJSON after revision/identity change. `status()` allocates a two-boolean object. `presence()` returns the current map iterator. `locateAnchor(..., "visible")` uses the same item/visible or tokenLocation policy and pathAt helper as the old PM resolver. These read methods do not call assertLocalEditing, editGuard, snapshot or restore. Local editing guards are confined to mutation/session methods.

The completed count reports verify zero whole-model query and zero PM Node.fromJSON calls for selection/presence, and zero snapshot/restore. Generated models, Ops, pending and semantic History match. This source audit does not attribute the latency outliers. Separate GC trace profiling records pauses against sample intervals.
