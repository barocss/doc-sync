import {createHash} from "node:crypto";
import {mkdirSync, readFileSync, writeFileSync} from "node:fs";
import {fileURLToPath} from "node:url";

const root = new URL("../../../", import.meta.url);
const pages = ["spec.md", "collaboration-intent.md", "edit-api.md", "recovery-plan.md"];

for (const name of pages) {
    const source = readFileSync(new URL(`docs/${name}`, root), "utf8");
    const hash = createHash("sha256").update(source).digest("hex");
    const content = source
        .replace(/\]\(\.\.\/HANDOFF\.md(?:#[^)]*)?\)/g, "](/status#regression-coverage)")
        .replace(/\]\(\.\.\/apps\/docs\/src\/roadmap\.md(#.*?)?\)/g, "](/roadmap$1)");
    const target = new URL(`../src/reference/${name}`, import.meta.url);
    mkdirSync(fileURLToPath(new URL("./", target)), {recursive: true});
    writeFileSync(target, `---\neditLink: false\nlastUpdated: false\n---\n\n<!-- Generated from docs/${name}; SHA-256 ${hash}. -->\n\n${content}`);
}

console.log(`Prepared ${pages.length} reference pages from repository documents.`);
