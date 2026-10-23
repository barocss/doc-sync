import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {mkdtempSync, readFileSync, rmSync, writeFileSync} from "node:fs";
import {stripTypeScriptTypes} from "node:module";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {test} from "node:test";
import {checkSchema} from "@barocss/doc-sync";
import {DEMO_SCHEMA} from "../../../fixtures/demo-schema.ts";
import {documentationSchema, prepareFullSchema, schemaSourceBlock, START, END} from "../scripts/prepare-full-schema.mjs";

const pageUrl = new URL("../src/guide/full-schema.md", import.meta.url);
const sourceUrl = new URL("../../../fixtures/demo-schema.ts", import.meta.url);
const withoutUi = schema => ({...schema, nodes: Object.fromEntries(Object.entries(schema.nodes).map(([type, {ui, ...spec}]) => [type, spec]))});

test("the documented full schema preserves every runtime rule and all nine shapes", async () => {
    const page = readFileSync(pageUrl, "utf8");
    const region = page.slice(page.indexOf(START) + START.length, page.indexOf(END));
    const code = /```ts\n([\s\S]*?)\n```/.exec(region)?.[1];
    assert.ok(code, "the generated region must contain the complete TypeScript schema");
    const module = await import(`data:text/javascript;base64,${Buffer.from(stripTypeScriptTypes(code)).toString("base64")}`);
    assert.deepEqual(withoutUi(module.DEMO_SCHEMA), withoutUi(DEMO_SCHEMA));
    assert.deepEqual(module.DEMO_SCHEMA, documentationSchema());
    assert.deepEqual(checkSchema(module.DEMO_SCHEMA), []);
    assert.deepEqual([...new Set(Object.values(module.DEMO_SCHEMA.nodes).map(spec => spec.shape))].sort(),
        ["atom", "cell", "flow", "grid", "group", "inline", "row", "span", "text"]);
});

test("all UI display strings have explicit English translations and retain UI behavior", () => {
    const before = JSON.stringify(DEMO_SCHEMA);
    const doc = documentationSchema();
    const expected = {
        paragraph: {label: "Paragraph"}, heading1: {label: "Heading 1"}, heading2: {label: "Heading 2"},
        quote: {label: "Quote"}, list: {label: "List"},
        "list-item": {list: true, variants: {attr: "listType", labels: {bullet: "Bulleted list", numbered: "Numbered list"}}},
        table: {label: "Table"}, "image-component": {label: "Image component"}, "inline-image": {label: "Image"},
        "caption-paragraph": {label: "Caption", placeholder: "Enter a caption"},
        callout: {label: "Callout"}, divider: {label: "Divider"},
    };
    assert.deepEqual(Object.fromEntries(Object.entries(doc.nodes).filter(([, spec]) => spec.ui).map(([type, spec]) => [type, spec.ui])), expected);
    assert.doesNotMatch(JSON.stringify(doc), /[\uac00-\ud7a3]/);
    assert.equal(JSON.stringify(DEMO_SCHEMA), before, "generation must not mutate the runtime fixture");
});

test("the checked-in source region matches fresh generation and the actual fixture hash", () => {
    const page = readFileSync(pageUrl, "utf8");
    assert.equal(page.split(START).length, 2);
    assert.equal(page.split(END).length, 2);
    const region = page.slice(page.indexOf(START), page.indexOf(END) + END.length);
    assert.equal(region, schemaSourceBlock());
    const hash = createHash("sha256").update(readFileSync(sourceUrl)).digest("hex");
    assert.ok(region.includes(`SHA-256 ${hash}.`));
});

test("regeneration repairs a stale region, preserves authored text, and is idempotent", () => {
    const directory = mkdtempSync(join(tmpdir(), "doc-sync-full-schema-"));
    const target = join(directory, "schema.md");
    try {
        writeFileSync(target, `# Authored introduction\n\n${START}\nstale schema and source hash\n${END}\n\nAuthored footer.\n`);
        assert.equal(prepareFullSchema({target}).changed, true);
        assert.equal(readFileSync(target, "utf8"), `# Authored introduction\n\n${schemaSourceBlock()}\n\nAuthored footer.\n`);
        assert.equal(prepareFullSchema({target}).changed, false);
        writeFileSync(target, "# No markers\n");
        assert.throws(() => prepareFullSchema({target}), /marker pair/);
        assert.equal(readFileSync(target, "utf8"), "# No markers\n");
    } finally {
        rmSync(directory, {recursive: true, force: true});
    }
});
