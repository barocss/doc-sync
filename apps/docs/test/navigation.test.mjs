import assert from 'node:assert/strict';
import {existsSync, readFileSync} from 'node:fs';
import {test} from 'node:test';
import {isActive} from 'vitepress/dist/client/shared.js';

// Run VitePress's real resolver. Its utils module imports browser composables,
// so include only the unchanged helper that the resolver uses in this Node test.
const resolverSource = readFileSync(new URL(import.meta.resolve('vitepress/dist/client/theme-default/support/sidebar.js')), 'utf8');
const utilsSource = readFileSync(new URL(import.meta.resolve('vitepress/dist/client/theme-default/support/utils.js')), 'utf8');
const ensureStartingSlash = /^function ensureStartingSlash\(path\) \{[\s\S]*?^\}/m.exec(utilsSource)?.[0];
assert.ok(ensureStartingSlash, 'VitePress must expose its current path helper');
const isolatedResolver = resolverSource
    .replace('"../../shared.js"', JSON.stringify(import.meta.resolve('vitepress/dist/client/shared.js')))
    .replace('import { ensureStartingSlash } from "./utils.js";', ensureStartingSlash);
const {getSidebar} = await import(`data:text/javascript;base64,${Buffer.from(isolatedResolver).toString('base64')}`);

const configSource = readFileSync(new URL('../.vitepress/config.mts', import.meta.url), 'utf8');
const code = configSource.replace('import {defineConfig} from "vitepress";', 'const defineConfig = value => value;');
const {default: config} = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
const {nav, sidebar} = config.themeConfig;
const preparation = readFileSync(new URL('../scripts/prepare-content.mjs', import.meta.url), 'utf8');
const generatedReferences = JSON.parse(/const pages = (\[[^;]+\]);/.exec(preparation)[1]);
function links(groups) { return groups.flatMap(group => group.items); }
function category(route) {
    return getSidebar(sidebar, route)[0]?.text;
}

test('five primary destinations lead to separate reader categories', () => {
    assert.deepEqual(nav.map(item => item.text), ['Guide', 'Schemas', 'Editor integrations', 'AI & bots', 'Reference']);
    for (const item of nav) assert.equal(category(item.link), item.text);
});

test('VitePress marks exactly one primary category active for current pages', () => {
    const fixtures = {
        'Guide': ['index.md', 'guide/getting-started.md', 'guide/client.md', 'guide/local-editing.md'],
        'Schemas': ['schemas/custom.md', 'schemas/index.md', 'schemas/document.md', 'schemas/spreadsheets.md', 'guide/schema.md', 'guide/graphic-schema.md', 'guide/schema-transition.md', 'guide/full-schema.md', 'guide/product-schemas.md'],
        'Editor integrations': ['guide/editors.md', 'guide/slate.md', 'guide/lexical.md', 'guide/custom-editor.md', 'guide/runnable-examples.md', 'guide/graphic-editor.md'],
        'AI & bots': ['ai/index.md', 'ai/server.md', 'guide/ai.md', 'guide/ai-walkthrough.md', 'guide/bots.md'],
        'Reference': ['reference/api.md', 'reference/recovery-plan.md', 'status.md', 'guide/rust.md', 'roadmap.md'],
    };
    for (const [expected, pages] of Object.entries(fixtures)) {
        for (const page of pages) {
            for (const path of [page, page.replace(/\.md$/, '.html')]) {
                const active = nav.filter(item => isActive(path, '', item.activeMatch, true));
                assert.deepEqual(active.map(item => item.text), [expected], path);
            }
        }
    }
    for (const item of Object.values(sidebar).flatMap(links)) {
        const route = item.link.split('#')[0];
        const page = route.endsWith('/') ? `${route.slice(1)}index.md` : `${route.slice(1)}.md`;
        for (const path of [page, page.replace(/\.md$/, '.html')]) {
            const active = nav.filter(entry => isActive(path, '', entry.activeMatch, true));
            assert.equal(active.length, 1, `one active category for ${path}`);
            assert.equal(active[0].text, category(route), path);
        }
    }
});

test('published editor and bot routes retain their category outside the guide namespace', () => {
    for (const page of ['editors', 'prosemirror', 'tiptap', 'slate', 'lexical', 'custom-editor', 'runnable-examples', 'editor-lessons', 'graphic-editor']) {
        assert.equal(category(`/guide/${page}.html`), 'Editor integrations');
    }
    for (const route of ['/ai/server.html', '/guide/ai.html', '/guide/ai-walkthrough.html', '/guide/bots.html', '/guide/bot-design.html']) {
        assert.equal(category(route), 'AI & bots');
    }
    for (const page of ['editing', 'local-editing', 'sync', 'presence', 'document-rules']) {
        assert.equal(category(`/guide/${page}.html`), 'Guide');
    }
    assert.equal(category('/status.html'), 'Reference');
    assert.equal(links(sidebar['/status']).find(item => item.link === '/status')?.text, 'Verification and limits');
});

test('schema pages use the Schemas sidebar at their existing URLs', () => {
    for (const page of ['schema', 'graphic-schema', 'schema-transition', 'full-schema', 'product-schemas']) {
        for (const route of [`/guide/${page}`, `/guide/${page}.html`, `guide/${page}.md`]) {
            assert.equal(category(route), 'Schemas', route);
        }
    }
    for (const route of ['/schemas/', '/schemas/index.html', 'schemas/index.md', '/schemas/document', '/schemas/document.html', 'schemas/document.md', '/schemas/spreadsheets', '/schemas/spreadsheets.html', 'schemas/spreadsheets.md']) {
        assert.equal(category(route), 'Schemas', route);
    }
    const schemaLinks = links(sidebar['/schemas/']).map(item => item.link);
    const guideLinks = links(sidebar['/']).map(item => item.link);
    for (const link of schemaLinks) assert.ok(!guideLinks.includes(link), link);
    assert.ok(guideLinks.includes('/guide/document-rules'));
});

test('Schemas presents Document, Graphic and Spreadsheet in order', () => {
    const groups = sidebar['/schemas/'];
    assert.deepEqual(groups.map(group => group.text), ['Schemas', 'Document', 'Graphic', 'Spreadsheet']);
    assert.deepEqual(groups.map(group => group.items.map(item => item.link)), [
        ['/schemas/', '/schemas/custom'],
        ['/schemas/document', '/guide/schema', '/guide/full-schema', '/guide/product-schemas', '/guide/schema-transition'],
        ['/guide/graphic-schema'],
        ['/schemas/spreadsheets'],
    ]);
    const source = readFileSync(new URL('../src/schemas/index.md', import.meta.url), 'utf8');
    assert.deepEqual([...source.matchAll(/^## (.+)$/gm)].map(match => match[1]), ['Document', 'Graphic', 'Spreadsheet']);
    const editorLinks = new Set(links(sidebar['/guide/editors']).map(item => item.link));
    for (const item of links(groups)) assert.ok(!editorLinks.has(item.link), item.link);
});

test('VitePress resolves root-level reference pages before the Guide fallback', () => {
    for (const page of ['status', 'roadmap', 'performance']) {
        for (const route of [`/${page}`, `/${page}.html`, `${page}.md`]) {
            assert.equal(category(route), 'Reference', route);
        }
    }
    for (const route of ['/', 'index.md', '/guide/local-editing.html']) {
        assert.equal(category(route), 'Guide', route);
    }
});

test('every navigation destination resolves to a documentation page', () => {
    const destinations = new Set([...nav, ...Object.values(sidebar).flatMap(links)].map(item => item.link));
    for (const destination of destinations) {
        const route = destination.split('#')[0];
        const file = route.endsWith('/') ? `${route}index` : route;
        const authored = existsSync(new URL(`../src${file}.md`, import.meta.url));
        const referenceName = route.startsWith('/reference/') ? `${route.slice('/reference/'.length)}.md` : null;
        const generated = generatedReferences.includes(referenceName)
            && existsSync(new URL(`../../../docs/${referenceName}`, import.meta.url));
        assert.ok(authored || generated, destination);
    }
});
