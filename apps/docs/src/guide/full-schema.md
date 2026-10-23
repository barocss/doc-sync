# Full demo schema

This page shows the complete `DEMO_SCHEMA` from [`fixtures/demo-schema.ts`](https://github.com/barocss/doc-sync/blob/main/fixtures/demo-schema.ts). The code is generated from the actual schema object. Only `ui` labels and placeholders are translated into English for display here. The runtime fixture is unchanged. Type names, allowed children, defaults, value restrictions, inheritance, and computed fields are identical.

The [block operations guide](./blocks) uses a smaller example schema. That example adds paragraph alignment and omits the full image/caption structure. Use this page when you need the complete demo's schema rather than that teaching example.

## Complete schema

The source hash below identifies the fixture file used by the generator. Run `node apps/docs/scripts/prepare-full-schema.mjs` from the repository root to refresh the generated region. Do not edit that region by hand.

<!-- full-schema-source:start -->
<!-- Generated from fixtures/demo-schema.ts; SHA-256 2e0fd61e1ce9b32a252824d8b4c378dcd4c1d340e7f8285df4c6d76bade4dcde. UI strings translated for documentation only. -->

```ts
import type {Schema} from "@barocss/doc-sync";

/** Complete demo schema. UI text is translated for this documentation only. */
export const DEMO_SCHEMA: Schema = {
    "root": "content",
    "marks": [
        "bold",
        "italic",
        "underline",
        "strike"
    ],
    "markValues": {
        "link": {
            "default": "",
            "pattern": "^(https?://\\S+)?$"
        }
    },
    "nodes": {
        "content": {
            "shape": "flow",
            "children": [
                "paragraph",
                "heading1",
                "heading2",
                "quote",
                "list",
                "table",
                "image-component",
                "callout",
                "divider"
            ],
            "default": "paragraph"
        },
        "paragraph": {
            "shape": "text",
            "children": [
                "inline-image",
                "inline-hyperlink"
            ],
            "ui": {
                "label": "Paragraph"
            }
        },
        "inline-hyperlink": {
            "shape": "span",
            "mark": "link",
            "attr": "url"
        },
        "heading1": {
            "shape": "text",
            "next": "paragraph",
            "ui": {
                "label": "Heading 1"
            }
        },
        "heading2": {
            "shape": "text",
            "next": "paragraph",
            "ui": {
                "label": "Heading 2"
            }
        },
        "quote": {
            "shape": "text",
            "ui": {
                "label": "Quote"
            }
        },
        "list": {
            "shape": "group",
            "children": [
                "list-item"
            ],
            "by": [
                "listType"
            ],
            "ui": {
                "label": "List"
            }
        },
        "list-item": {
            "shape": "text",
            "attrs": {
                "listType": {
                    "default": "bullet",
                    "values": [
                        "bullet",
                        "numbered"
                    ],
                    "inherit": true
                },
                "level": {
                    "default": 0,
                    "min": 0,
                    "max": 4,
                    "inherit": true
                }
            },
            "ui": {
                "list": true,
                "variants": {
                    "attr": "listType",
                    "labels": {
                        "bullet": "Bulleted list",
                        "numbered": "Numbered list"
                    }
                }
            }
        },
        "table": {
            "shape": "grid",
            "children": [
                "table-row"
            ],
            "attrs": {
                "header": {
                    "default": false,
                    "values": [
                        true,
                        false
                    ]
                }
            },
            "ui": {
                "label": "Table"
            }
        },
        "table-row": {
            "shape": "row",
            "children": [
                "table-cell"
            ]
        },
        "table-cell": {
            "shape": "cell",
            "children": [
                "table-cell-body"
            ],
            "attrs": {
                "colspan": {
                    "default": 1,
                    "min": 1,
                    "computed": true
                },
                "rowspan": {
                    "default": 1,
                    "min": 1,
                    "computed": true
                },
                "spanned": {
                    "default": false,
                    "computed": true
                },
                "backgroundColor": {
                    "default": "",
                    "pattern": "^(#[0-9a-fA-F]{6})?$"
                }
            }
        },
        "table-cell-body": {
            "shape": "flow",
            "children": [
                "paragraph",
                "list",
                "image-component"
            ],
            "default": "paragraph"
        },
        "image-component": {
            "shape": "flow",
            "children": [
                "image",
                "caption"
            ],
            "default": "image",
            "ui": {
                "label": "Image component"
            }
        },
        "image": {
            "shape": "text",
            "children": [
                "inline-image"
            ],
            "text": false
        },
        "inline-image": {
            "shape": "inline",
            "attrs": {
                "src": {
                    "default": ""
                },
                "width": {
                    "default": 160,
                    "min": 16,
                    "max": 2000
                },
                "height": {
                    "default": 90,
                    "min": 16,
                    "max": 2000
                }
            },
            "ui": {
                "label": "Image"
            }
        },
        "caption": {
            "shape": "group",
            "children": [
                "caption-paragraph"
            ],
            "by": []
        },
        "caption-paragraph": {
            "shape": "text",
            "ui": {
                "label": "Caption",
                "placeholder": "Enter a caption"
            }
        },
        "callout": {
            "shape": "flow",
            "children": [
                "paragraph",
                "heading2",
                "list",
                "table",
                "image-component"
            ],
            "default": "paragraph",
            "attrs": {
                "tone": {
                    "default": "info",
                    "values": [
                        "info",
                        "warn",
                        "ok"
                    ]
                }
            },
            "ui": {
                "label": "Callout"
            }
        },
        "divider": {
            "shape": "atom",
            "ui": {
                "label": "Divider"
            }
        }
    }
};
```
<!-- full-schema-source:end -->

## The nine shapes

The core reads shapes and schema rules. It does not hardcode these application type names.

| Shape | Types in this schema | Role |
|---|---|---|
| `flow` | `content`, `table-cell-body`, `image-component`, `callout` | Own a block sequence and select its default text-shaped block. |
| `text` | `paragraph`, `heading1`, `heading2`, `quote`, `list-item`, `image`, `caption-paragraph` | Open text blocks. `image` uses the shape but sets `text: false`. |
| `inline` | `inline-image` | Occupy one token position within a permitted text block. |
| `span` | `inline-hyperlink` | Present consecutive characters carrying the same link value as one model wrapper. |
| `group` | `list`, `caption` | Present consecutive flat text items as a model group. No stored group container is created. |
| `grid` | `table` | Own row and column sequences. |
| `row` | `table-row` | Define the row-to-cell schema relationship. |
| `cell` | `table-cell` | Define each row/column intersection and its body flow. |
| `atom` | `divider` | Represent a block with no editable body. |

## Root and text blocks

`root: "content"` selects the document flow. Its children are paragraphs, both heading types, quotes, lists, tables, image components, callouts, and dividers. Its default is `paragraph`.

`paragraph` accepts `inline-image` and `inline-hyperlink`. The heading, quote, list-item, and caption-paragraph specifications do not declare those inline/span children. Do not assume that registering a type anywhere makes it available in every text block.

`heading1` and `heading2` set `next: "paragraph"`. Enter at the end of either heading creates a paragraph. A split inside a heading retains the heading type. `quote` has no `next` override. `ui.label` only gives the editor a display name; it is not a validation rule.

Every flow has a text-shaped default. A text shape need not accept characters: the image component's default `image` is the explicit example. Canonical flows keep a leading text-shaped block and add an empty default block if needed.

## Boolean marks and links

`marks` permits `bold`, `italic`, `underline`, and `strike`. New string input inherits active boolean marks from the left character observed by its author. Explicit insertion marks can override that inheritance.

The `link` value mark has an empty-string default and the pattern `^(https?://\S+)?$`. It accepts the empty value or an HTTP/HTTPS URL without whitespace. It has no `inherit: true`, so ordinary new input does not inherit a link automatically. The operation records its marks; receipt does not recalculate inheritance.

`inline-hyperlink` maps the `link` mark to its model attribute `url`. The model groups adjacent characters with the same URL into one span. The span is calculated from character marks; it is not a separate inline token or an independently stored link container.

## Lists

`list` groups consecutive `list-item` blocks by `listType`. Its `children` contains only `list-item`, and `by: ["listType"]` determines when adjacent groups stay together.

Each item has these attributes:

| Attribute | Default | Rules |
|---|---|---|
| `listType` | `"bullet"` | Allowed values: `"bullet"`, `"numbered"`; inherited into a split block. |
| `level` | `0` | Numeric range 0–4; inherited into a split block. |

`ui.list: true` and `ui.variants` tell the demo how to display and choose item variants. The variant selector reads `listType`; its English display labels here are “Bulleted list” and “Numbered list”. Neither the labels nor list numbering create stored container nodes. Keyboard policies such as outdenting an empty list item belong to the editor.

## Tables and cell bodies

The structural chain is `table → table-row → table-cell → table-cell-body`. Each grid, row, and cell specification names one child type. Row and column counts are selected by editing operations; they are not fixed by this schema.

`table.header` defaults to `false` and accepts only `true` or `false`. Cell fields are:

| Attribute | Default | Rules |
|---|---|---|
| `colspan` | `1` | Minimum 1; `computed: true`. |
| `rowspan` | `1` | Minimum 1; `computed: true`. |
| `spanned` | `false` | `computed: true`; indicates a covered cell. |
| `backgroundColor` | `""` | Empty or `#` followed by six hexadecimal digits. |

Computed fields are model output derived from merge endpoints. Use model `update` with `colspan`/`rowspan` to change a merge. Set a 1×1 span to split it. Do not treat `spanned` as an editable boolean. The default values in the schema do not mean that every cell output includes those keys; canonical output omits ordinary computed defaults.

Cell bodies permit only paragraphs, lists, and image components, with `paragraph` as the default. They do not permit nested tables or callouts. The full-grid model retains covered cells and their content. A merge hides that content; it does not collect it into the top-left cell. Splitting exposes it again.

## Images and captions

`image-component` is a flow with `image` and `caption` children and an `image` default. The `image` block has `text: false` and permits `inline-image`. Character input is not the intended content of that block.

`inline-image` defines all of its stored attributes:

| Attribute | Default | Rules |
|---|---|---|
| `src` | `""` | No schema pattern restriction. |
| `width` | `160` | Numeric range 16–2000. |
| `height` | `90` | Numeric range 16–2000. |

A paragraph can also contain an inline image directly, without an image component. Width and height belong to the inline image token, not its surrounding flow.

`caption` groups consecutive `caption-paragraph` blocks. Its empty `by` list imposes no grouping attribute. Caption paragraphs are stored flat in the image component's sequence. The English placeholder “Enter a caption” is display metadata. It does not create text content.

The schema does not enforce exactly one image and exactly one caption. The demo's commands maintain the intended arrangement. Required-child counts and arbitrary handcrafted operations need separate policies; attribute `min` and `max` do not express child cardinality.

## Callouts and dividers

`callout` permits paragraphs, `heading2`, lists, tables, and image components. Its default is `paragraph`; `heading1`, nested callouts, and dividers are not listed as allowed children. Attribute `tone` defaults to `"info"` and permits `"info"`, `"warn"`, and `"ok"`.

`divider` is an atom and has no editable children or declared attributes. Its `ui.label` supplies only a display name.

## Validation and scope

Use `checkSchema` to check schema consistency. Clients must create edits that satisfy the destination's allowed children and attribute rules. Canonical normalization arranges model shape and defaults; it is not a complete validator of arbitrary input trees. Server validation uses immutable sequence membership and original node types so concurrent state does not cause inconsistent rejection. That boundary does not replace authentication, permissions, request limits, or exact-child policies.

The page's runtime tests compare the documented schema with the actual fixture. They allow only the explicit English `ui` translations and check the source hash. These checks verify documentation consistency. They do not establish editor input acceptance, actual OS IME behavior, or production readiness.

[Editing API](../reference/edit-api) · [Schema overview](./schema) · [Block operations](./blocks)
