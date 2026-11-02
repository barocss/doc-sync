import {Extension, Mark, Node} from "@tiptap/core";
import {Plugin, PluginKey} from "@tiptap/pm/state";
import {buildPmSchema} from "@barocss/doc-sync-prosemirror";
import {toPmJSON} from "@barocss/doc-sync-prosemirror";
import {createTiptapClientCompat, initialClientModel} from "./sync-client-compat.ts";
import {PmBinding, REMOTE_META} from "@barocss/doc-sync-prosemirror";
import type {Extensions} from "@tiptap/core";
import type {Schema as PmSchema} from "@tiptap/pm/model";
import type {Transaction} from "@tiptap/pm/state";
import type {Schema} from "@barocss/doc-sync-core";
import type {BindingClient} from "@barocss/doc-sync-core/client";
import type {DomHints} from "@barocss/doc-sync-prosemirror";
import type {Presence} from "@barocss/doc-sync-core/sync";

/** Generate the exact flattened schema supported by the shared ProseMirror converter.
 * Do not combine these nodes/marks with StarterKit or another document schema.
 */
export function createTiptapExtensions(schema: Schema, dom: DomHints = {}): Extensions {
    const {pm} = buildPmSchema(schema, dom);
    const extensions: Extensions = [];
    for (const [name, type] of Object.entries(pm.nodes)) {
        const spec = type.spec;
        extensions.push(Node.create({
            name,
            topNode: type === pm.topNodeType,
            content: spec.content,
            group: spec.group,
            inline: spec.inline,
            atom: spec.atom,
            marks: spec.marks,
            defining: spec.defining,
            isolating: spec.isolating,
            addAttributes: () => Object.fromEntries(Object.entries(spec.attrs ?? {}).map(([key, attr]) => [key, {
                ...attr,
                parseHTML: element => {
                    const value = element.getAttribute(`data-doc-sync-${key.toLowerCase()}`);
                    return value === null ? attr.default : JSON.parse(value);
                },
                renderHTML: attrs => attrs[key] == null ? {} : {[`data-doc-sync-${key.toLowerCase()}`]: JSON.stringify(attrs[key])},
            }])),
            parseHTML: () => [{tag: `[data-doc-sync-node="${name}"]`}],
            ...(spec.toDOM ? {renderHTML: ({node, HTMLAttributes}) => {
                const output = spec.toDOM!(node);
                if (!Array.isArray(output)) return output;
                const attrs = typeof output[1] === "object" && !Array.isArray(output[1]) ? output[1] : {};
                const tail = attrs === output[1] ? output.slice(2) : output.slice(1);
                return [output[0], {...attrs, ...HTMLAttributes, "data-doc-sync-node": name}, ...tail] as typeof output;
            }} : {}),
            extendNodeSchema: extension => extension.name === name && spec.tableRole ? {tableRole: spec.tableRole} : {},
        }));
    }
    for (const [name, type] of Object.entries(pm.marks)) {
        const spec = type.spec;
        extensions.push(Mark.create({
            name,
            inclusive: spec.inclusive,
            addAttributes: () => Object.fromEntries(Object.entries(spec.attrs ?? {}).map(([key, attr]) => [key, {
                ...attr,
                parseHTML: element => {
                    const value = element.getAttribute(`data-doc-sync-${key.toLowerCase()}`);
                    return value === null ? attr.default : JSON.parse(value);
                },
                renderHTML: attrs => attrs[key] == null ? {} : {[`data-doc-sync-${key.toLowerCase()}`]: JSON.stringify(attrs[key])},
            }])),
            parseHTML: () => [{tag: `[data-doc-sync-mark="${name}"]`}],
            renderHTML: ({mark, HTMLAttributes}) => {
                const output = spec.toDOM!(mark, true);
                if (!Array.isArray(output)) return output;
                return [output[0], {...(output[1] as object), ...HTMLAttributes, "data-doc-sync-mark": name}, 0];
            },
        }));
    }
    return extensions;
}

function validateSchema(actual: PmSchema, expected: PmSchema): void {
    const names = (value: object) => Object.keys(value).sort().join(",");
    const defaults = (attrs: PmSchema["nodes"][string]["spec"]["attrs"]) => JSON.stringify(Object.entries(attrs ?? {}).map(([key, value]) => [key, value.default]));
    if (names(actual.nodes) !== names(expected.nodes) || names(actual.marks) !== names(expected.marks) || actual.topNodeType.name !== expected.topNodeType.name) {
        throw new Error("DocSync: incompatible Tiptap schema. Use createTiptapExtensions(client.schema).");
    }
    for (const [name, type] of Object.entries(expected.nodes)) {
        const node = actual.nodes[name];
        // Tiptap adds HTML attribute metadata. Compare document semantics and effective defaults.
        const fields = ["content", "group", "marks", "tableRole", "whitespace"] as const;
        if (fields.some(field => node.spec[field] !== type.spec[field]) || node.isInline !== type.isInline || node.isAtom !== type.isAtom || !!node.spec.defining !== !!type.spec.defining || !!node.spec.isolating !== !!type.spec.isolating || defaults(node.spec.attrs) !== defaults(type.spec.attrs)) throw new Error(`DocSync: incompatible node ${name}.`);
    }
    for (const [name, type] of Object.entries(expected.marks)) {
        const mark = actual.marks[name];
        if (defaults(mark.spec.attrs) !== defaults(type.spec.attrs) || mark.spec.inclusive !== type.spec.inclusive || mark.spec.excludes !== type.spec.excludes || mark.spec.group !== type.spec.group || mark.spec.spanning !== type.spec.spanning) throw new Error(`DocSync: incompatible mark ${name}.`);
    }
}

export interface DocSyncOptions {
    client: BindingClient | null;
    /** Name, color, and optional actor appearance. Selection endpoints come from the editor. */
    presence: Omit<Presence, "actor" | "anchor" | "focus"> | null;
    onSelection: ((anchor: string | null, focus: string | null) => void) | null;
    /** Host callbacks run after the native state is installed. Failures are reported here. */
    onError: ((error: unknown, callback: string) => void) | null;
}
export interface DocSyncStorage {binding: PmBinding<BindingClient> | null}

declare module "@tiptap/core" {
    interface Commands<ReturnType> {
        docSync: {
            docSyncUndo: () => ReturnType;
            docSyncRedo: () => ReturnType;
        };
    }
}

/** Tiptap owns EditorState and applies all transactions. DocSync owns CRDT history. */
export const DocSync = Extension.create<DocSyncOptions, DocSyncStorage>({
    name: "docSync",
    priority: 1000,
    addOptions: () => ({client: null, presence: null, onSelection: null, onError: null}),
    addStorage: () => ({binding: null}),
    onBeforeCreate() {
        if (!this.options.client) throw new Error("DocSync: client is required.");
        this.editor.options.content = toPmJSON(this.options.client.schema, initialClientModel(this.options.client));
        const incompatible = this.editor.extensionManager.extensions.find(extension => ["undoRedo", "history", "collaboration", "collaborationCaret", "collaborationCursor"].includes(extension.name));
        if (incompatible) throw new Error(`DocSync: disable ${incompatible.name}; DocSync provides actor-owned history and presence.`);
    },
    addCommands() {
        return {
            docSyncUndo: () => ({dispatch, tr}) => {
                const binding = this.storage.binding;
                if (dispatch) tr.setMeta("doc-sync-history-request", true);
                if (!binding || !binding.host.historyStatus().canUndo) return false;
                if (dispatch) {
                    // CommandManager dispatches its own transaction after this command.
                    // Execute after it so the transaction is never stale.
                    tr.setMeta("doc-sync-history", "undo");
                }
                return true;
            },
            docSyncRedo: () => ({dispatch, tr}) => {
                const binding = this.storage.binding;
                if (dispatch) tr.setMeta("doc-sync-history-request", true);
                if (!binding || !binding.host.historyStatus().canRedo) return false;
                if (dispatch) tr.setMeta("doc-sync-history", "redo");
                return true;
            },
        };
    },
    addKeyboardShortcuts() {
        return {"Mod-z": () => this.editor.commands.docSyncUndo(), "Mod-Shift-z": () => this.editor.commands.docSyncRedo(), "Mod-y": () => this.editor.commands.docSyncRedo()};
    },
    addProseMirrorPlugins() {
        const client = this.options.client;
        if (!client) throw new Error("DocSync: client is required.");
        const info = buildPmSchema(client.schema);
        validateSchema(this.editor.schema, info.pm);
        info.pm = this.editor.schema;
        let binding: PmBinding<BindingClient> | null = null;
        let appending = false;
        let correction: Transaction | null = null;
        let active = true;
        let publishSelection = true;
        const storage = this.storage;
        const options = this.options;
        let cursor: Plugin | null = null;
        return [new Plugin({
            key: new PluginKey("docSync"),
            filterTransaction(transaction) {
                if (transaction.getMeta("doc-sync-history-request") && transaction.docChanged) throw new Error("DocSync: run undo/redo in a separate chain from document edits.");
                return true;
            },
            appendTransaction(transactions, _oldState, newState) {
                if (!binding) return null;
                appending = true;
                correction = null;
                const priorPublish = publishSelection;
                publishSelection = priorPublish && transactions.some(tr => tr.getMeta(REMOTE_META) !== "remote" && !tr.getMeta("doc-sync-presence"));
                try { binding.accept(transactions, newState); }
                finally { appending = false; publishSelection = priorPublish; }
                return correction;
            },
            props: {decorations(state) { return cursor?.props.decorations?.call(cursor, state) ?? null; }},
            view(view) {
                if (view.state.plugins.some(plugin => /^(history|y-sync|y-undo)/.test((plugin as unknown as {key: string}).key))) throw new Error("DocSync: remove local history and other collaboration plugins.");
                const send = (tr: Transaction) => {
                    if (!active) return;
                    if (appending) correction = tr;
                    else view.dispatch(tr);
                };
                binding = new PmBinding(client, info, [], {state: view.state, dispatch: send});
                const compat = createTiptapClientCompat(client, options, binding.host);
                storage.binding = binding;
                cursor = binding.cursorPlugin();
                binding.onSelection = (anchor, focus) => compat.selection(anchor, focus, publishSelection);
                compat.connect(() => {
                    if (active && binding) {
                        const priorPublish = publishSelection;
                        publishSelection = false;
                        try { binding.state = view.state; binding.pull(); }
                        finally { publishSelection = priorPublish; }
                    }
                }, () => {
                    if (active && !appending && binding) {
                        const priorPublish = publishSelection;
                        publishSelection = false;
                        try {
                            binding.state = view.state;
                            binding.pull();
                            view.dispatch(view.state.tr.setMeta("doc-sync-presence", true));
                        } finally { publishSelection = priorPublish; }
                        compat.publishIfNeeded();
                    }
                });
                return {
                    update(view) { if (binding) binding.state = view.state; },
                    destroy() {
                        active = false;
                        compat.dispose();
                        binding?.dispose();
                        storage.binding = null;
                        binding = null;
                    },
                };
            },
        })];
    },
    onCreate() { this.storage.binding?.pull(); },
    onTransaction({transaction}) {
        const action = transaction.getMeta("doc-sync-history");
        if (action === "undo") this.storage.binding?.undo();
        if (action === "redo") this.storage.binding?.redo();
    },
});
