import type {Schema} from "@barocss/doc-sync";

/**
 * 데모 편집기의 스키마. CRDT 는 이 이름들을 모른다 — 모양(text·inline·flow·group·grid·row·cell·atom)만 본다.
 * 블록 종류를 더하거나 빼려면 여기만 고치면 된다. 스키마 기반 문서 에디터의 스키마처럼 children 으로 트리를 적는다.
 *
 *   content ─ paragraph(─ inline-image · inline-hyperlink) · heading1 · heading2 · quote
 *           ─ list ─ list-item                 (이어진 list-item 을 listType 별로 묶는다)
 *           ─ table ─ table-row ─ table-cell ─ table-cell-body ─ paragraph · list · image-component
 *           ─ image-component ─ image ─ inline-image
 *                             ─ caption ─ caption-paragraph   (이어진 caption-paragraph 를 묶는다)
 *           ─ callout ─ paragraph · heading2 · list · table · image-component
 *           ─ divider
 *
 * 링크는 글자마다의 값 서식 link(주소)로 저장하고, 모델에서는 같은 주소로 이어진 글자를 inline-hyperlink 하나로 묶어 보인다.
 */

const level = {default: 0, min: 0, max: 4, inherit: true};

export const DEMO_SCHEMA: Schema = {
    root: "content",
    marks: ["bold", "italic", "underline", "strike"],
    // 값 서식 — 새로 친 글자는 링크를 물려받지 않는다 (inherit 없음)
    markValues: {link: {default: "", pattern: "^(https?://\\S+)?$"}},
    nodes: {
        content: {
            shape: "flow",
            children: ["paragraph", "heading1", "heading2", "quote", "list", "table", "image-component", "callout", "divider"],
            default: "paragraph",
        },
        paragraph: {shape: "text", children: ["inline-image", "inline-hyperlink"], ui: {label: "문단"}},
        "inline-hyperlink": {shape: "span", mark: "link", attr: "url"},
        heading1: {shape: "text", next: "paragraph", ui: {label: "제목 1"}},
        heading2: {shape: "text", next: "paragraph", ui: {label: "제목 2"}},
        quote: {shape: "text", ui: {label: "인용"}},

        list: {shape: "group", children: ["list-item"], by: ["listType"], ui: {label: "목록"}},
        "list-item": {
            shape: "text",
            attrs: {listType: {default: "bullet", values: ["bullet", "numbered"], inherit: true}, level},
            ui: {list: true, variants: {attr: "listType", labels: {bullet: "글머리 목록", numbered: "번호 목록"}}},
        },

        // 행·열의 수는 정하지 않는다 — 넣을 때 고르고, 나중에 더하고 뺀다
        table: {shape: "grid", children: ["table-row"], attrs: {header: {default: false, values: [true, false]}}, ui: {label: "표"}},
        "table-row": {shape: "row", children: ["table-cell"]},
        // 칸에는 토큰이 없어서 칸 속성은 표 노드에 칸마다 적는다. colspan·rowspan·spanned 는 칸 합치기에서 계산한다
        "table-cell": {
            shape: "cell",
            children: ["table-cell-body"],
            attrs: {
                colspan: {default: 1, min: 1, computed: true},
                rowspan: {default: 1, min: 1, computed: true},
                spanned: {default: false, computed: true},
                backgroundColor: {default: "", pattern: "^(#[0-9a-fA-F]{6})?$"},
            },
        },
        // 칸 안에는 글 블록·목록·이미지 — 표 안의 표·상자는 받지 않는다
        "table-cell-body": {shape: "flow", children: ["paragraph", "list", "image-component"], default: "paragraph"},

        // 이미지 그릇 안: 그림 블록 하나 + 캡션. 캡션도 목록처럼 저장은 평평하게, 보이기는 caption > caption-paragraph
        "image-component": {shape: "flow", children: ["image", "caption"], default: "image", ui: {label: "이미지"}},
        image: {shape: "text", children: ["inline-image"], text: false},
        "inline-image": {
            shape: "inline",
            attrs: {src: {default: ""}, width: {default: 160, min: 16, max: 2000}, height: {default: 90, min: 16, max: 2000}},
            ui: {label: "그림"},
        },

        caption: {shape: "group", children: ["caption-paragraph"], by: []},
        "caption-paragraph": {shape: "text", ui: {label: "캡션", placeholder: "캡션을 입력하세요"}},

        callout: {
            shape: "flow",
            children: ["paragraph", "heading2", "list", "table", "image-component"],
            default: "paragraph",
            attrs: {tone: {default: "info", values: ["info", "warn", "ok"]}},
            ui: {label: "상자"},
        },
        divider: {shape: "atom", ui: {label: "구분선"}},
    },
};
