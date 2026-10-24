import {defineConfig} from "vitepress";

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
        ["link", {rel: "icon", type: "image/svg+xml", href: "/doc-sync/favicon.svg"}],
    ],
    themeConfig: {
        siteTitle: "doc-sync",
        nav: [
            {text: "Guide", link: "/guide/getting-started"},
            {text: "Reference", link: "/reference/api"},
            {text: "Status", link: "/status"},
        ],
        socialLinks: [{icon: "github", link: "https://github.com/barocss/doc-sync"}],
        search: {provider: "local"},
        outline: {level: [2, 3], label: "On this page"},
        sidebar: [
            {text: "Start here", items: [
                {text: "Overview", link: "/"},
                {text: "Getting started", link: "/guide/getting-started"},
                {text: "Define a schema", link: "/guide/schema"},
                {text: "Complete example schema", link: "/guide/full-schema"},
            ]},
            {text: "Build an editor", items: [
                {text: "Editor integration paths", link: "/guide/editors"},
                {text: "Editor design lessons", link: "/guide/editor-lessons"},
                {text: "Model operations", link: "/guide/editing"},
                {text: "Schema-driven block operations", link: "/guide/blocks"},
                {text: "Document rules and annotations", link: "/guide/document-rules"},
                {text: "Synchronization", link: "/guide/sync"},
                {text: "Cursors and selections", link: "/guide/presence"},
                {text: "ProseMirror", link: "/guide/prosemirror"},
                {text: "Slate", link: "/guide/slate"},
                {text: "Lexical", link: "/guide/lexical"},
            ]},
            {text: "Reference", items: [
                {text: "Public API", link: "/reference/api"},
                {text: "Editing API", link: "/reference/edit-api"},
                {text: "State and wire contract", link: "/reference/spec"},
                {text: "Collaboration intent", link: "/reference/collaboration-intent"},
            ]},
            {text: "Engineering", items: [
                {text: "Status and limits", link: "/status"},
                {text: "Performance evidence", link: "/performance"},
            ]},
        ],
        footer: {message: "One library package. Schema-defined document behavior.", copyright: "doc-sync · barocss"},
    },
});
