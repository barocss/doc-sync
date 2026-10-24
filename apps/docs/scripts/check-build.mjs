import assert from "node:assert/strict";
import {existsSync, readFileSync, readdirSync, statSync} from "node:fs";
import {join, relative, resolve} from "node:path";
import {fileURLToPath} from "node:url";

const dist = fileURLToPath(new URL("../dist/", import.meta.url));
const base = "/doc-sync/";
const files = [];
const walk = directory => {
    for (const name of readdirSync(directory)) {
        const path = join(directory, name);
        statSync(path).isDirectory() ? walk(path) : files.push(path);
    }
};
walk(dist);
const pages = files.filter(path => path.endsWith(".html"));
const requiredGuides = ["getting-started", "schema", "full-schema", "document-rules", "editing", "blocks", "editors", "editor-lessons", "prosemirror", "slate", "lexical", "sync", "presence"];
for (const name of requiredGuides) {
    assert.ok(existsSync(join(dist, "guide", `${name}.html`)), `missing required guide: ${name}`);
}
assert.ok(pages.length >= 21, "the expected guides and references must be built");
const failures = [];
let links = 0;
for (const path of pages) {
    const html = readFileSync(path, "utf8");
    const pageUrl = new URL(base + relative(dist, path).replaceAll("\\", "/"), "https://barocss.github.io");
    assert.match(html, /<html[^>]*lang="en-US"/);
    assert.doesNotMatch(html, /\/Users\/user\/|\.openai\/|source_repository_credential|HANDOFF\.md/);
    const prose = html.replace(/<(script|style|pre|code)\b[^>]*>[\s\S]*?<\/\1>/gi, "").replace(/<[^>]+>/g, "");
    assert.doesNotMatch(prose, /[\uac00-\ud7a3]/, `untranslated Hangul prose in ${path}`);
    for (const match of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
        const value = match[1].replaceAll("&amp;", "&");
        const url = new URL(value, pageUrl);
        if (url.origin !== pageUrl.origin) continue;
        if (!url.pathname.startsWith(base)) { failures.push(`${path}: URL escapes site base ${value}`); continue; }
        let target = resolve(dist, decodeURIComponent(url.pathname.slice(base.length)));
        if (target === dist || url.pathname.endsWith("/")) target = join(target, "index.html");
        links += 1;
        if (!existsSync(target)) { failures.push(`${path}: missing ${value}`); continue; }
        if (url.hash && target.endsWith(".html")) {
            const anchor = decodeURIComponent(url.hash.slice(1));
            if (!readFileSync(target, "utf8").includes(`id="${anchor}"`)) failures.push(`${path}: missing anchor ${value}`);
        }
    }
}
assert.deepEqual(failures, []);
console.log(JSON.stringify({pages: pages.length, checkedInternalLinks: links, english: true, localPathsExcluded: true}));
