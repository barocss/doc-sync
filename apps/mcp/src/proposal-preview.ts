import type {CreateProposal} from "./proposal-schema.ts";
/** Pure UTF-16 string preview. No Doc, actor clock, history, or candidate operations. */
export function previewReplacement(source: string, change: CreateProposal["change"]) {
    const {start, end, replacement} = change;
    if (source.length > 16384 || start > end || end > source.length || end - start > 4096) throw new Error("Unsupported text range");
    const scalar = (s: string) => !/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(s);
    const boundary = (i: number) => i === 0 || i === source.length || !(source.charCodeAt(i - 1) >= 0xD800 && source.charCodeAt(i - 1) <= 0xDBFF && source.charCodeAt(i) >= 0xDC00 && source.charCodeAt(i) <= 0xDFFF);
    if (!scalar(source) || !scalar(replacement) || !boundary(start) || !boundary(end) || /[\r\n\u0085\u2028\u2029]/u.test(replacement) || replacement.length > 4096) throw new Error("Unsupported Unicode boundary or replacement");
    return {before: source.slice(start, end), after: replacement, preview: {prefix: source.slice(0, start), removed: source.slice(start, end), inserted: replacement, suffix: source.slice(end)}};
}
