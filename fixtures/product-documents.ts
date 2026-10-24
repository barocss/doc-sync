import {canonical, type NodeJSON} from "@barocss/doc-sync";
import {PRODUCT_SCHEMAS} from "./product-schemas.ts";

const p = (text: string, type = "paragraph"): NodeJSON => ({type, runs: [{text, marks: {}}]});
const cell = (text: string): NodeJSON => ({type: "cell", children: [{type: "cell-body", children: [p(text)]}]});
const table = (type = "table"): NodeJSON => ({type, children: [
    {type: "row", children: [cell("Name"), cell("Status")]},
    {type: "row", children: [cell("Draft"), cell("Review")]},
]});
const list = (): NodeJSON => ({type: "list", attrs: {listType: "numbered"}, children: [
    {...p("Research", "list-item"), attrs: {listType: "numbered", level: 0}},
    {...p("Implementation", "list-item"), attrs: {listType: "numbered", level: 1}},
]});
const rich = (): NodeJSON => ({type: "paragraph", runs: [
    {text: "Shared 😀 ", marks: {bold: true, color: "#123456", fontSize: 18}},
    {type: "link", attrs: {url: "https://example.test/design"}, runs: [{text: "design", marks: {italic: true}}]},
    {type: "mention", attrs: {kind: "user", id: "reviewer", label: "Reviewer"}},
]});
const figure = (): NodeJSON => ({type: "figure", attrs: {alt: "Design preview"}, children: [
    {type: "image-block", runs: [{type: "inline-image", attrs: {src: "https://example.test/preview.png", alt: "Preview", width: 640, height: 360}}]},
    p("Figure 1. Shared design", "caption"),
]});
const word: NodeJSON = {type: "word-document", children: [p("Project brief"), {type: "section", children: [
    p("Opening text"), p("Scope", "heading1"), rich(), p("Notes", "heading2"), p("A quoted requirement", "quote"),
    list(), table(), figure(), {type: "page-break"}, p("After the break"),
    {type: "header", children: [p("Project header")]}, {type: "footer", children: [p("Page footer")]},
]}, {type: "section", attrs: {page: {width: 1123, height: 794, margin: {top: 36, right: 36, bottom: 36, left: 36}}}, children: [
    p("Landscape appendix"), {type: "header", children: [p("Appendix header")]}, {type: "footer", children: [p("Appendix footer")]},
]}]};
const notion: NodeJSON = {type: "notion-page", children: [p("Team workspace"), p("Plan", "heading1"), rich(),
    {...p("Review this draft", "task"), attrs: {checked: false}},
    {type: "bullet-block", children: [p("Parent item"), {type: "bullet-block", children: [p("Nested item")]}]},
    {type: "toggle", attrs: {collapsed: true}, children: [p("Details"), {type: "callout", attrs: {tone: "warning", icon: "warning"}, children: [p("Check dependencies"), p("Implementation note", "quote")]}]},
    {type: "columns", children: [p("Work streams"), {type: "column", children: [p("Design")]}, {type: "column", children: [p("Engineering")]}]},
    table(), table("database"), {...p("const ready = true;", "code-block"), attrs: {language: "typescript"}},
    figure(), {type: "embed", attrs: {src: "https://example.test/spec", kind: "bookmark"}}, {type: "equation", attrs: {latex: "E=mc^2"}}, {type: "divider"}, p("End of page"),
]};
const presentation: NodeJSON = {type: "presentation", children: [p("Quarterly plan"), {type: "slide", attrs: {layout: "title"}, children: [
    p("Overview", "title"), {type: "text-box", attrs: {frame: {x: 80, y: 120, width: 600, height: 180, rotation: 0, z: 1}}, children: [rich(), list()]},
    {type: "image", attrs: {src: "https://example.test/roadmap.png", alt: "Roadmap"}},
    {type: "shape", attrs: {kind: "ellipse", fill: "#123456"}},
    {type: "object-group", children: [p("Group label"), {type: "shape"}, {type: "text-box", children: [p("Grouped text")]}]},
    {type: "notes", children: [p("Presenter only: introduce the roadmap.")]},
]}, {type: "slide", attrs: {layout: "two-column"}, children: [
    p("Results", "title"), {type: "text-box", children: [p("Result summary")]}, table(),
    {type: "chart", attrs: {kind: "bar", data: [{label: "Q1", value: 4}, {label: "Q2", value: 7}]}},
    {type: "notes", children: [p("Discuss the two metrics.")]},
]}]};

export const PRODUCT_MODELS = {
    word: canonical(PRODUCT_SCHEMAS.word, word),
    notion: canonical(PRODUCT_SCHEMAS.notion, notion),
    presentation: canonical(PRODUCT_SCHEMAS.presentation, presentation),
};
