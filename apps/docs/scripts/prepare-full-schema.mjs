import {createHash} from "node:crypto";
import {mkdirSync, readFileSync, writeFileSync} from "node:fs";
import {dirname, resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {DEMO_SCHEMA} from "../../../fixtures/demo-schema.ts";

const fixture = new URL("../../../fixtures/demo-schema.ts", import.meta.url);
const defaultTarget = fileURLToPath(new URL("../src/guide/full-schema.md", import.meta.url));
export const START = "<!-- full-schema-source:start -->";
export const END = "<!-- full-schema-source:end -->";

const englishUi = {
    paragraph: {label: "Paragraph"},
    heading1: {label: "Heading 1"},
    heading2: {label: "Heading 2"},
    quote: {label: "Quote"},
    list: {label: "List"},
    "list-item": {variants: {labels: {bullet: "Bulleted list", numbered: "Numbered list"}}},
    table: {label: "Table"},
    "image-component": {label: "Image component"},
    "inline-image": {label: "Image"},
    "caption-paragraph": {label: "Caption", placeholder: "Enter a caption"},
    callout: {label: "Callout"},
    divider: {label: "Divider"},
};

const translateUi = (ui, translations, path) => Object.fromEntries(Object.entries(ui).map(([key, value]) => {
    if (key === "attr" || typeof value !== "string" && (value === null || typeof value !== "object")) return [key, value];
    if (typeof value === "object") return [key, translateUi(value, translations?.[key], `${path}.${key}`)];
    const translated = translations?.[key];
    if (typeof translated !== "string") throw new Error(`Missing English UI string: ${path}.${key}`);
    return [key, translated];
}));

/** Clone runtime data. Translate display strings without changing schema rules. */
export function documentationSchema() {
    const schema = structuredClone(DEMO_SCHEMA);
    for (const [type, spec] of Object.entries(schema.nodes)) {
        if (!spec.ui) continue;
        const translated = englishUi[type];
        if (!translated) throw new Error(`Missing English UI for schema type: ${type}`);
        spec.ui = translateUi(spec.ui, translated, `${type}.ui`);
    }
    return schema;
}

export function schemaSourceBlock() {
    const source = readFileSync(fixture, "utf8");
    const hash = createHash("sha256").update(source).digest("hex");
    const code = [
        'import type {Schema} from "@barocss/doc-sync";',
        "",
        "/** Complete demo schema. UI text is translated for this documentation only. */",
        `export const DEMO_SCHEMA: Schema = ${JSON.stringify(documentationSchema(), null, 4)};`,
    ].join("\n");
    if (/[\uac00-\ud7a3]/.test(code)) throw new Error("Untranslated text in the documented schema");
    return `${START}\n<!-- Generated from fixtures/demo-schema.ts; SHA-256 ${hash}. UI strings translated for documentation only. -->\n\n\`\`\`ts\n${code}\n\`\`\`\n${END}`;
}

/** Refresh only the generated region; preserve all authored explanations. */
export function prepareFullSchema({target = defaultTarget} = {}) {
    const page = readFileSync(target, "utf8");
    if (page.split(START).length !== 2 || page.split(END).length !== 2 || page.indexOf(START) >= page.indexOf(END)) {
        throw new Error(`Expected one ordered full-schema marker pair in ${target}`);
    }
    const start = page.indexOf(START);
    const end = page.indexOf(END) + END.length;
    const updated = page.slice(0, start) + schemaSourceBlock() + page.slice(end);
    mkdirSync(dirname(target), {recursive: true});
    if (updated !== page) writeFileSync(target, updated);
    return {target, changed: updated !== page};
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const result = prepareFullSchema();
    console.log(`Prepared full demo schema (${result.changed ? "updated" : "unchanged"}).`);
}
