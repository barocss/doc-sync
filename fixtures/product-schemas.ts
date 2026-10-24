import type {AttrSpec, NodeSpec, Schema} from "@barocss/doc-sync";

const textStyle = (): AttrSpec => ({default: {align: "left", spacing: 1, indent: 0}, fields: {
    align: {default: "left", values: ["left", "center", "right", "justify"]},
    spacing: {default: 1, min: 0.5, max: 4}, indent: {default: 0, min: 0, max: 12},
}});
const frame = (): AttrSpec => ({default: {x: 0, y: 0, width: 320, height: 180, rotation: 0, z: 0}, fields: {
    x: {default: 0, min: -100000, max: 100000}, y: {default: 0, min: -100000, max: 100000},
    width: {default: 320, min: 1, max: 100000}, height: {default: 180, min: 1, max: 100000},
    rotation: {default: 0, min: -360, max: 360}, z: {default: 0, min: -10000, max: 10000},
}});
const base = (): Record<string, NodeSpec> => ({
    paragraph: {shape: "text", children: ["link", "mention", "inline-image"], attrs: {style: textStyle()}},
    heading1: {shape: "text", next: "paragraph"}, heading2: {shape: "text", next: "paragraph"},
    quote: {shape: "text"}, "code-block": {shape: "text", attrs: {language: {default: "text"}}},
    link: {shape: "span", mark: "link", attr: "url"},
    mention: {shape: "inline", attrs: {kind: {default: "user", values: ["user", "page", "date"]}, id: {default: ""}, label: {default: ""}}},
    "inline-image": {shape: "inline", attrs: {src: {default: ""}, alt: {default: ""}, width: {default: 160, min: 1, max: 100000}, height: {default: 90, min: 1, max: 100000}}},
    list: {shape: "group", children: ["list-item"], by: ["listType"]},
    "list-item": {shape: "text", attrs: {listType: {default: "bullet", values: ["bullet", "numbered"], inherit: true}, level: {default: 0, min: 0, max: 12, inherit: true}}},
    figure: {shape: "flow", children: ["image-block", "caption"], default: "image-block", childRules: {"image-block": {min: 1, max: 1}}, attrs: {alt: {default: ""}}},
    "image-block": {shape: "text", text: false, children: ["inline-image"]}, caption: {shape: "text"},
    table: {shape: "grid", children: ["row"], attrs: {header: {default: false, values: [false, true]}}},
    row: {shape: "row", children: ["cell"]},
    cell: {shape: "cell", children: ["cell-body"], attrs: {
        colspan: {default: 1, min: 1, computed: true}, rowspan: {default: 1, min: 1, computed: true}, spanned: {default: false, computed: true},
        backgroundColor: {default: "", pattern: "^(#[0-9a-fA-F]{6})?$"},
        properties: {default: {label: "", complete: false}, fields: {label: {default: ""}, complete: {default: false, values: [false, true]}}},
    }},
    "cell-body": {shape: "flow", children: ["paragraph", "list", "figure"], default: "paragraph"},
    divider: {shape: "atom"},
});
const marks = ["bold", "italic", "underline", "strike", "code"];
const values = () => ({link: {default: "", pattern: "^(https?://\\S+)?$"}, color: {default: "", inherit: true}, fontSize: {default: 12, min: 8, max: 128, inherit: true}});

/** Representative editing profiles, not import/export schemas for proprietary formats. */
export const WORD_SCHEMA: Schema = {
    root: "word-document", marks, markValues: values(), nodes: {
        ...base(),
        "word-document": {shape: "flow", children: ["paragraph", "section"], default: "paragraph"},
        section: {shape: "flow", children: ["paragraph", "heading1", "heading2", "quote", "code-block", "list", "table", "figure", "page-break", "header", "footer"], default: "paragraph", childRules: {header: {min: 1, max: 1}, footer: {min: 1, max: 1}}, attrs: {
            page: {default: {width: 794, height: 1123, margin: {top: 72, right: 72, bottom: 72, left: 72}}, fields: {
                width: {default: 794, min: 100, max: 10000}, height: {default: 1123, min: 100, max: 10000},
                margin: {default: {top: 72, right: 72, bottom: 72, left: 72}, fields: {top: {default: 72, min: 0}, right: {default: 72, min: 0}, bottom: {default: 72, min: 0}, left: {default: 72, min: 0}}},
            }},
        }},
        header: {shape: "flow", children: ["paragraph"], default: "paragraph"},
        footer: {shape: "flow", children: ["paragraph"], default: "paragraph"}, "page-break": {shape: "atom"},
    },
};

const notionBlocks = ["paragraph", "heading1", "heading2", "quote", "code-block", "task", "bullet-block", "toggle", "callout", "columns", "table", "database", "figure", "embed", "equation", "divider"];
export const NOTION_SCHEMA: Schema = {
    root: "notion-page", marks, markValues: values(), nodes: {
        ...base(),
        "notion-page": {shape: "flow", children: notionBlocks, default: "paragraph"},
        task: {shape: "text", attrs: {checked: {default: false, values: [false, true]}}},
        "bullet-block": {shape: "flow", children: ["paragraph", "bullet-block", "task"], default: "paragraph", attrs: {ordered: {default: false, values: [false, true]}}},
        toggle: {shape: "flow", children: notionBlocks, default: "paragraph", attrs: {collapsed: {default: false, values: [false, true]}}},
        callout: {shape: "flow", children: notionBlocks, default: "paragraph", attrs: {tone: {default: "info", values: ["info", "warning", "success"]}, icon: {default: "info"}}},
        columns: {shape: "flow", children: ["paragraph", "column"], default: "paragraph", childRules: {column: {min: 2, max: 4}}},
        column: {shape: "flow", children: notionBlocks, default: "paragraph", attrs: {width: {default: 1, min: 0.1, max: 12}}},
        database: {shape: "grid", children: ["row"], attrs: {header: {default: false, values: [false, true]}, view: {default: {kind: "table", groupBy: ""}, fields: {kind: {default: "table", values: ["table", "board"]}, groupBy: {default: ""}}}}},
        embed: {shape: "atom", attrs: {src: {default: ""}, kind: {default: "bookmark", values: ["bookmark", "file", "video", "audio"]}}},
        equation: {shape: "atom", attrs: {latex: {default: ""}}},
    },
};

const objects = ["paragraph", "text-box", "image", "shape", "table", "chart", "object-group"];
export const PRESENTATION_SCHEMA: Schema = {
    root: "presentation", marks, markValues: values(), nodes: {
        ...base(),
        presentation: {shape: "flow", children: ["paragraph", "slide"], default: "paragraph"},
        slide: {shape: "flow", children: ["title", ...objects, "notes"], default: "title", childRules: {title: {min: 1, max: 1}, notes: {min: 1, max: 1}}, attrs: {
            layout: {default: "blank", values: ["blank", "title", "two-column"]},
            canvas: {default: {width: 1280, height: 720, background: "#ffffff"}, fields: {width: {default: 1280, min: 100, max: 10000}, height: {default: 720, min: 100, max: 10000}, background: {default: "#ffffff"}}},
        }},
        title: {shape: "text", next: "paragraph"},
        "text-box": {shape: "flow", children: ["paragraph", "list"], default: "paragraph", attrs: {frame: frame()}},
        image: {shape: "atom", attrs: {src: {default: ""}, alt: {default: ""}, frame: frame()}},
        shape: {shape: "atom", attrs: {kind: {default: "rectangle", values: ["rectangle", "ellipse", "line"]}, frame: frame(), fill: {default: "#ffffff"}}},
        chart: {shape: "atom", attrs: {kind: {default: "bar", values: ["bar", "line", "pie"]}, data: {default: []}, frame: frame()}},
        "object-group": {shape: "flow", children: objects, default: "paragraph", attrs: {frame: frame()}},
        notes: {shape: "flow", children: ["paragraph", "list"], default: "paragraph"},
    },
};
export const PRODUCT_SCHEMAS = {word: WORD_SCHEMA, notion: NOTION_SCHEMA, presentation: PRESENTATION_SCHEMA};
