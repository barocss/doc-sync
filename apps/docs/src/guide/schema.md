# Define a schema

The core reads shapes. Your application assigns names such as `paragraph`, `note`, or `table`. A schema defines the root, allowed children, default blocks, attributes, marks, and inheritance.

## Shapes

| Shape | Purpose |
|---|---|
| `text` | A block with text runs and permitted inline content. |
| `inline` | A node that occupies one position inside a text block. |
| `span` | A model wrapper derived from a value mark, such as a link. |
| `flow` | A sequence of document blocks. |
| `group` | A model group of adjacent text items, such as a list. |
| `grid` | A table with row and column token lines. |
| `row`, `cell` | The schema structure of a grid. |
| `atom` | A block without an editable body. |

## A text schema

```ts
import {checkSchema, type Schema} from "@barocss/doc-sync";

const schema: Schema = {
    root: "content",
    marks: ["bold", "italic"],
    nodes: {
        content: {
            shape: "flow",
            children: ["paragraph", "heading", "note"],
            default: "paragraph",
        },
        paragraph: {shape: "text"},
        heading: {shape: "text", next: "paragraph"},
        note: {
            shape: "flow",
            children: ["paragraph"],
            default: "paragraph",
            attrs: {tone: {default: "info", values: ["info", "warning"]}},
        },
    },
};

const problems = checkSchema(schema);
if (problems.length) throw new Error(problems.join("; "));
```

## Inheritance and normalization

New text inherits boolean marks from the left character observed by the author. Value marks require `inherit: true`; the demo's link value mark does not inherit by default. The insertion operation stores its marks; the receiver does not recompute them from its current neighbor.

A flow starts with an editable default block. Adjacent list items can form a model group. Table cells retain a full-grid model even when a span hides a cell. These rules are part of the shared document contract.

See the repository's [demo schema](https://github.com/barocss/doc-sync/blob/main/fixtures/demo-schema.ts) for lists, links, tables, images, and nested flows.

[Run schema-driven block operations →](./blocks)
