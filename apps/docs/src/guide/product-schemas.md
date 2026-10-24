# Word, Notion and presentation schemas

These profiles test larger documents against the same document engine. Each profile supplies an external schema and a complete sample model. They use the existing editing API, collaboration rules and editor converters.

Use them as a starting point for application design. A profile describes stored content and editing constraints. It does not provide DOCX/PPTX import, page layout, a database engine or a slide canvas.

## Profile coverage

| Profile | Document structure | Declared properties and constraints |
| --- | --- | --- |
| Word-style document | Sections, headings, paragraphs, lists, quotes, tables, figures with captions, page breaks, headers and footers | Page size and nested margin fields; one required header and footer per section; paragraph alignment, spacing and indentation |
| Notion-style page | Recursive blocks, tasks, toggles, callouts, columns, tables, a database-shaped grid, embeds and equations | Task state, collapse state, callout tone, column width, two to four columns, independent database view fields and cell properties |
| Presentation | Ordered slides, titles, text boxes, images, shapes, tables, charts, nested object groups and speaker notes | Required slide title and notes; canvas properties; independent position, size, rotation and stacking fields on framed objects |

Shared content includes bold, italic, underline, strike, code, value formatting, links, mentions, inline images and nested cell content. The samples include Unicode text, rich inline content, lists, a 2×2 table and product-specific structures.

The source files are [`fixtures/product-schemas.ts`](https://github.com/barocss/doc-sync/blob/main/fixtures/product-schemas.ts) and [`fixtures/product-documents.ts`](https://github.com/barocss/doc-sync/blob/main/fixtures/product-documents.ts). They are repository fixtures, not additional library packages or public package exports. The default demo continues to use `DEMO_SCHEMA`.

## Load and edit a sample

Run this example from the repository root with Node 22.18 or later. The fixture imports below are local repository files.

```ts
import {Doc} from "@barocss/doc-sync";
import {WORD_SCHEMA} from "./fixtures/product-schemas.ts";
import {PRODUCT_MODELS} from "./fixtures/product-documents.ts";

const doc = new Doc("alice", WORD_SCHEMA);
doc.edit([
  {op: "delete", at: [0], count: doc.toJSON().children!.length},
  {op: "insert", at: [0], content: PRODUCT_MODELS.word.children!},
]);

// Update one margin field. Other margin fields retain their values.
doc.edit([{op: "update", at: [1], attrs: {page: {margin: {top: 40}}}}]);

// Move the appendix section before the first section.
doc.edit([{op: "move", from: [2], at: [1]}]);

const restored = Doc.fromSnapshot("bob", doc.snapshot(), WORD_SCHEMA);
console.log(restored.toJSON());
```

Use `NOTION_SCHEMA` with `PRODUCT_MODELS.notion`, or `PRESENTATION_SCHEMA` with `PRODUCT_MODELS.presentation`, to load the other profiles. Paths address the current model. Resolve a path again after a structural change. See [model operations](./editing) for command semantics and [document rules](./document-rules) for field and required-child behavior.

## Native editor demo

Run `npm run dev:products` from the repository root after installing the comparison harness dependencies in [`apps/demo/products/README.md`](https://github.com/barocss/doc-sync/blob/main/apps/demo/products/README.md). The default address is `http://127.0.0.1:5413/`. Choose `?profile=word`, `?profile=notion` or `?profile=presentation`. Add `size=large` to open a fresh document with 100,000 generated UTF-16 text units, in addition to the rich sample.

Each page has three editable native views: Slate, Lexical and ProseMirror. They share a document through HTTP/SSE and use participant-specific undo/redo. The application supplies schema-aware elements and safe labels for media and atoms. Each profile has a separate backend with temporary storage. Existing documents are retained when reloaded.

Chrome checks cover 90 common editing cases and 39 schema-context/structure cases. They include Unicode input/deletion, forward/backward selection through remote insertion, native formatting, undo/redo that preserves foreign edits, nested split/join, headers/footers/captions, columns/database cells/tasks, notes/object groups/titles, and merged hidden content. The full native, client and server models are checked. Nine more large-document checks verify that an unchanged distant DOM paragraph remains attached after remote input in every profile/editor combination. Twelve UI and request-guard checks bring the native demo total to 150 assertions. This extends the headless unit coverage below.

A repeated before/after comparison contains 2,160 measured keyboard inputs after 360 excluded warmups, across sample and 100k documents, all three profiles and all three input editors. With unchanged native root blocks retained, large-document input-to-peer rendering-opportunity p95 changes from **305.6–610.1 ms** to **70.1–176.5 ms**. Sample results remain about 47–49 ms. This is a localhost development run with three editors in one Chrome page; the endpoint is DOM match plus a second animation frame, not physical screen timing. Read the [remote editor performance report](https://github.com/barocss/doc-sync/blob/main/benchmarks/results/native-receive-2026-10-24/report.md) for per-source figures, repeated runs, raw records, remaining full reads and limits. The [earlier native baseline](https://github.com/barocss/doc-sync/blob/main/benchmarks/results/product-native-2026-10-24/report.md) remains available.

The views expose editable structure. Presentation objects use an outline, toggles remain expanded for editing, and media use labeled placeholders. Product layout, collapse/query UI and file fidelity remain application work.

## Complete schemas and samples

The code below is included directly from the tested files at build time.

::: details Complete schema definitions
<<< ../../../../fixtures/product-schemas.ts
:::

::: details Complete sample models
<<< ../../../../fixtures/product-documents.ts
:::

## What the tests establish

The profile suite has **33 cases**, with the same 11 cases applied to each profile. Run it from the repository root:

```sh
node --test packages/doc-sync/test/product-schemas.test.ts
```

| Case | Checked result |
| --- | --- |
| Schema, canonical model and snapshot | The schema is valid. Loading preserves the complete canonical sample. Restoration preserves the model and does not change the schema. |
| Three editor conversions | ProseMirror, Slate and Lexical headless conversion each preserve the sample data. |
| Concurrent delete, format and insert, in two receipt orders | Three clients, server state and event mirrors converge. Undoing a deletion restores the concurrently formatted character; undoing that formatting removes the participant's formatting. |
| Independent nested fields | Concurrent margin, database-view or object-frame fields both survive. Undo and redo affect the issuing participant's field. |
| Merged cells and concurrent hidden input | Hidden text and cell fields survive merging, conversion, undo and redo. |
| Structured movement and concurrent descendant input | Moving a section, toggle or slide preserves another participant's input inside it through undo, redo and snapshot restoration. |
| Required children | Deletion preserves the minimum visible children. The replacement child accepts input and survives snapshot restoration. |
| Invalid storage references | Snapshots reject malformed required identities, character anchors and anchors from another flow. |

The network cases use three clients through the in-memory transport. They check each replica, the server, model-event application, pending queues and snapshot restoration. They require zero event-application fallbacks. The test source is [`product-schemas.test.ts`](https://github.com/barocss/doc-sync/blob/main/packages/doc-sync/test/product-schemas.test.ts).

These profiles exposed two storage validation errors and a cell normalization error: derived required-flow body slots were rejected during restoration; trailing paragraphs after required blocks were checked against a physical rather than owning flow; and nested cell-field defaults differed between canonical models and document output. The regression cases cover these fixes. Concurrent editing policies are unchanged.

## Application work still required

| Area | Remaining application responsibility |
| --- | --- |
| Word-style documents | Pagination, section layout, header/footer placement and repetition, page numbers, tracked changes and DOCX fidelity |
| Notion-style pages | Collapse UI, database queries, relations, formulas, permissions and embed rendering; the database profile stores grid content and view properties only |
| Presentations | Canvas rendering, object drag/resize, coordinate transforms, connectors, themes, animations, presenter mode and PPTX fidelity; chart data is an atomic value, not an independently editable series model |
| All three | Product-specific node views and keyboard behavior, paste/import policy, accessibility, production-scale latency and actual OS IME validation |

The presentation tree preserves slide and object order. A frame's `z` field is stored metadata; this fixture does not implement a renderer that sorts or composes it. A flow starts with its default text block, so object groups and slide contents can include an empty leading paragraph or title. Applications must account for that rule when rendering a canvas.

The unit suite includes **headless model conversions**. The separate native demo covers the bounded editing cases described above. These checks do not establish full product UI, layout, real OS IME or release performance acceptance. Read [editor design lessons](./editor-lessons) before choosing a binding, and [status and limits](../status) before planning a release.
