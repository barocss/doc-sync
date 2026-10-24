import {canonical, type NodeJSON} from "@barocss/doc-sync";
import {PRODUCT_MODELS} from "../../../fixtures/product-documents.ts";
import {PRODUCT_SCHEMAS} from "../../../fixtures/product-schemas.ts";

export type ProductProfile = keyof typeof PRODUCT_SCHEMAS;
export const TARGETS = {
    word: {path: [1, 0], text: "Opening text"},
    notion: {path: [5, 0], text: "Details"},
    presentation: {path: [2, 1, 0], text: "Result summary"},
};
const paragraph = (text: string, type = "paragraph"): NodeJSON => ({type, runs: [{text, marks: {}}]});

/** Adds a fixed UTF-16 payload in nested containers without replacing the rich sample. */
export function productDocument(profile: ProductProfile, characters = 0): NodeJSON {
    if (!Number.isSafeInteger(characters) || characters < 0 || characters > 1_000_000) throw new Error("Invalid generated character count");
    const model = structuredClone(PRODUCT_MODELS[profile]);
    const paragraphs: NodeJSON[] = [];
    for (let used = 0; used < characters; used += 160) {
        const text = `Block ${paragraphs.length}. `.padEnd(160, "x").slice(0, Math.min(160, characters - used));
        paragraphs.push(paragraph(text));
    }
    for (let index = 0; index < paragraphs.length; index += 32) {
        const children = paragraphs.slice(index, index + 32), label = `Generated ${index / 32 + 1}`;
        model.children!.push(profile === "word" ? {type: "section", children: [...children,
            {type: "header", children: [paragraph(label)]}, {type: "footer", children: [paragraph("Footer")]}]}
            : profile === "notion" ? {type: "toggle", children: [paragraph(label), ...children]}
            : {type: "slide", children: [paragraph(label, "title"), {type: "text-box", children}, {type: "notes", children: [paragraph("Speaker notes")]}]});
    }
    return canonical(PRODUCT_SCHEMAS[profile], model);
}
