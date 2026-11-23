# Bounded document reads

Use `read_document_slice` to read canonical model children without returning the full local model. It is available through stdio and hosted MCP. The read is local: remote changes can still be in transit. Keep the revision checks used by `edit_document`.

## Request a page

```json
{"path": [], "start": 0, "limit": 20, "maxNodes": 4096, "maxTextUnits": 65536, "maxBytes": 262144}
```

`path` selects a parent through canonical model `children` indexes. `start` is its first child index. The default parent is the root and the default page limit is 20.

| Input | Maximum |
| --- | ---: |
| `path` depth | 32 |
| `limit` children | 100 |
| `maxNodes` model nodes and text runs | 4,096 |
| `maxTextUnits` UTF-16 units | 65,536 |
| `maxBytes` successful MCP tool-result JSON bytes | 262,144 |

The node, text, and byte defaults equal their maxima. The byte bound includes both the text content and `structuredContent` copies of the result. It excludes the JSON-RPC frame and HTTP headers. `responseBytes` reports the complete tool-result JSON size; `payloadBytes` reports the underlying session response size; `counts.bytes` reports the Core slice size. An error is returned when the requested page cannot fit. Use a smaller page or a narrower parent.

The result contains `children` entries with canonical paths, optional block identities, and model nodes. It also contains the revision, local document revision, session status, counters, and `nextCursor`. `view` is `model`: covered retained table-cell content remains present. This is not a visible-editor-only view.

## Continue or restart

If `nextCursor` is not null, call the tool with that value as `cursor` and no other fields:

```json
{"cursor": "COPY_NEXT_CURSOR"}
```

The HMAC-protected cursor binds the query to the session, local document instance and version, epoch, server sequence, and schema state. A changed replica or revision invalidates it. Start a new read after a stale-cursor error. Do not reuse a cursor after reconnecting to a new session.

Use the returned `revision` as an edit base only after you have enough model context to choose the edit. A local slice does not prove that the server is current or that an edit target matches the user's intent. The server checks the exact base when accepting a conditional edit.

## Paths and limits

Supported parents are flows, canonical groups, and cell bodies. A cell body is addressed as `[tableIndex, rowIndex, columnIndex, 0]`. Rows and cells can be path steps but cannot themselves be sliced. Text offsets are not slice-parent paths. Unsupported or ambiguous raw-to-canonical grouping is rejected.

The first sibling index can scan the containing line in O(n) time. A warm flat-root page limits model projection to the selected children. Nested ancestor resolution and global projection work can still scan more state. A canonical minimum that exists only in the model and cannot be safely addressed is rejected; use a full read. The existing edit path remains a separate contract. The output bounds do not establish constant memory, constant time, or an overall performance improvement. See [roadmap item 5](../roadmap) for the remaining gate.

A bounded read does not write a checkpoint, clear a recovery journal, or resolve uncertain pending work. Use `recovery_status` and the exact retry/recovery contract when the session requires recovery.

## Measured workloads

A local Core comparison measures complete reads and selected-child reads on matching restored replicas. For 100,000 one-character paragraphs, warm model-plus-JSON medians were 70.936 ms for the full model and 0.484 ms for 20 selected children. The results contained 4,600,027 and 2,095 bytes respectively. Their output scopes differ; this is not an equivalent-output speedup or network/editor measurement.

The first bounded read indexed all 100,000 siblings. A retained-table path also used more warm model time and temporary heap than a full read. These results leave nested/global optimization and product performance gates open. Read the [method, raw samples, and limits](https://github.com/barocss/doc-sync/blob/main/benchmarks/results/bounded-ai-reads-2026-11-02/report.md).
