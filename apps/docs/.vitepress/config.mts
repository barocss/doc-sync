import {defineConfig} from "vitepress";

const guideSidebar = [
    {text: "Guide", items: [
        {text: "Overview", link: "/"},
        {text: "Getting started", link: "/guide/getting-started"},
        {text: "Packages and engines", link: "/guide/packages"},
        {text: "Release preparation", link: "/guide/releasing"},
    ]},
    {text: "Build an editor", items: [
        {text: "Client: local or synchronized", link: "/guide/client"},
        {text: "Model operations", link: "/guide/editing"},
        {text: "Local editing and host APIs", link: "/guide/local-editing"},
        {text: "Save and open locally", link: "/guide/local-storage"},
        {text: "Schema-driven block operations", link: "/guide/blocks"},
        {text: "Document rules and annotations", link: "/guide/document-rules"},
        {text: "Synchronization", link: "/guide/sync"},
        {text: "Cursors and selections", link: "/guide/presence"},
    ]},
];
const schemaSidebar = [
    {text: "Schemas", items: [
        {text: "Overview", link: "/schemas/"},
        {text: "Custom schemas and editor mappings", link: "/schemas/custom"},
    ]},
    {text: "Document", items: [
        {text: "Overview", link: "/schemas/document"},
        {text: "Define a schema", link: "/guide/schema"},
        {text: "Complete example schema", link: "/guide/full-schema"},
        {text: "Word, Notion and presentation schemas", link: "/guide/product-schemas"},
        {text: "Change an open editor's schema", link: "/guide/schema-transition"},
    ]},
    {text: "Graphic", items: [
        {text: "Overview", link: "/guide/graphic-schema"},
    ]},
    {text: "Spreadsheet", items: [
        {text: "Sparse spreadsheets", link: "/schemas/spreadsheets"},
    ]},
];
const editorSidebar = [
    {text: "Editor integrations", items: [
        {text: "Choose an integration", link: "/guide/editors"},
        {text: "ProseMirror", link: "/guide/prosemirror"},
        {text: "Tiptap", link: "/guide/tiptap"},
        {text: "Slate", link: "/guide/slate"},
        {text: "Lexical", link: "/guide/lexical"},
        {text: "Custom editor", link: "/guide/custom-editor"},
        {text: "PixiJS graphic editor", link: "/guide/graphic-editor"},
        {text: "Editor design lessons", link: "/guide/editor-lessons"},
    ]},
];
const aiSidebar = [
    {text: "AI & bots", items: [
        {text: "Overview", link: "/ai/"},
        {text: "Connect to a document server", link: "/ai/server"},
        {text: "Private hosted MCP", link: "/ai/hosted"},
        {text: "Bounded document reads", link: "/ai/reading"},
        {text: "Proposals and owner approval", link: "/ai/proposals"},
        {text: "MCP tools and recovery", link: "/guide/ai"},
        {text: "Run a document bot", link: "/guide/bots"},
        {text: "Bot identity and activity", link: "/guide/bot-design"},
        {text: "Local collaboration walkthrough", link: "/guide/ai-walkthrough"},
    ]},
];
const referenceSidebar = [
    {text: "Reference", items: [
        {text: "Public API", link: "/reference/api"},
        {text: "Editing API", link: "/reference/edit-api"},
        {text: "State and wire contract", link: "/reference/spec"},
        {text: "Collaboration intent", link: "/reference/collaboration-intent"},
        {text: "Recovery plan", link: "/reference/recovery-plan"},
        {text: "Verification and limits", link: "/status"},
    ]},
    {text: "Engineering", items: [
        {text: "Rust engine", link: "/guide/rust"},
        {text: "Native Rust SDK", link: "/guide/rust#use-the-native-rust-sdk"},
        {text: "WASM storage examples", link: "/guide/rust#use-the-storage-only-wasm-adapter"},
        {text: "Roadmap", link: "/roadmap"},
        {text: "Troubleshooting", link: "/guide/troubleshooting"},
        {text: "Operations and performance", link: "/guide/operations-performance"},
        {text: "Performance evidence", link: "/performance"},
    ]},
];

// Derive active navigation from each category's published destinations.
const activeMatch = (groups = guideSidebar, legacyRoutes = []) => `^(?:${[...new Set([
    ...groups.flatMap(group => group.items.map(item => item.link.split('#')[0])),
    ...legacyRoutes,
])].map(link => {
    if (link === '/') return '/$';
    const path = link.replace(/\/$/, '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return `${path}(?:$|/)`;
}).join('|')})`;

export default defineConfig({
    title: "doc-sync",
    description: "Schema-defined collaborative documents. Guides, APIs, convergence rules, and verification limits.",
    lang: "en-US",
    base: "/doc-sync/",
    srcDir: "src",
    outDir: "dist",
    cleanUrls: false,
    lastUpdated: true,
    head: [
        ["meta", {name: "theme-color", content: "#2563eb"}],
        ["script", {src: "/doc-sync/pre-hydration.js"}],
        ["link", {rel: "icon", type: "image/svg+xml", href: "/doc-sync/favicon.svg"}],
    ],
    themeConfig: {
        siteTitle: "doc-sync",
        nav: [
            {text: "Guide", link: "/guide/getting-started", activeMatch: activeMatch(guideSidebar)},
            {text: "Schemas", link: "/schemas/", activeMatch: activeMatch(schemaSidebar)},
            {text: "Editor integrations", link: "/guide/editors", activeMatch: activeMatch(editorSidebar, ["/guide/runnable-examples"])},
            {text: "AI & bots", link: "/ai/", activeMatch: activeMatch(aiSidebar)},
            {text: "Reference", link: "/reference/api", activeMatch: activeMatch(referenceSidebar)},
        ],
        socialLinks: [{icon: "github", link: "https://github.com/barocss/doc-sync"}],
        search: {provider: "local"},
        outline: {level: [2, 3], label: "On this page"},
        sidebar: {
            "/schemas/": schemaSidebar,
            "/guide/schema": schemaSidebar,
            "/guide/graphic-schema": schemaSidebar,
            "/guide/schema-transition": schemaSidebar,
            "/guide/full-schema": schemaSidebar,
            "/guide/product-schemas": schemaSidebar,
            "/guide/editors": editorSidebar,
            "/guide/prosemirror": editorSidebar,
            "/guide/tiptap": editorSidebar,
            "/guide/slate": editorSidebar,
            "/guide/lexical": editorSidebar,
            "/guide/custom-editor": editorSidebar,
            "/guide/graphic-editor": editorSidebar,
            "/guide/runnable-examples": editorSidebar,
            "/guide/editor-lessons": editorSidebar,
            "/ai/": aiSidebar,
            "/guide/ai": aiSidebar,
            "/guide/bots": aiSidebar,
            "/guide/bot-design": aiSidebar,
            "/reference/": referenceSidebar,
            "/status": referenceSidebar,
            "/roadmap": referenceSidebar,
            "/performance": referenceSidebar,
            "/guide/rust": referenceSidebar,
            "/guide/troubleshooting": referenceSidebar,
            "/guide/operations-performance": referenceSidebar,
            // VitePress sorts by slash depth. Keep the root fallback after
            // root-level page prefixes, which have the same slash depth.
            "/": guideSidebar,
        },
        footer: {message: "Independent packages. Schema-defined document behavior.", copyright: "doc-sync · barocss"},
    },
});
