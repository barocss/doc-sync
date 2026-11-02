import {InputSession, createSyncClientEditorHost} from "@barocss/doc-sync-core/editor";
import type {EditorSession} from "@barocss/doc-sync-core/editor";
import {Client, createEditorHost} from "@barocss/doc-sync-core/client";
import {LocalClient} from "@barocss/doc-sync-core/local";
import type {BindingClient} from "@barocss/doc-sync-core/client";
import type {SyncClient} from "@barocss/doc-sync-core/sync";
import type {LexicalEditor} from "lexical";
import {LexicalHostBinding} from "./host-binding.ts";
import type {LexicalBindingOptions} from "./host-binding.ts";
import type {LexicalSchemaInfo} from "./schema.ts";

export {LEXICAL_REMOTE_TAG} from "./host-binding.ts";
export type {LexicalBindingOptions} from "./host-binding.ts";

/** Keeps legacy input access and creates a separate session for each view. */
export class LexicalBinding<C extends BindingClient = SyncClient> extends LexicalHostBinding {
    readonly client: C;
    readonly input: C extends SyncClient ? InputSession : EditorSession;
    constructor(client: C, editor: LexicalEditor, infoOrOptions: LexicalSchemaInfo | LexicalBindingOptions = {}) {
        const input = client instanceof Client || client instanceof LocalClient ? undefined : new InputSession(client as SyncClient);
        super(input ? createSyncClientEditorHost(client as SyncClient, {input}) : createEditorHost(client), editor, infoOrOptions);
        this.client = client;
        this.input = (input ?? this.session) as C extends SyncClient ? InputSession : EditorSession;
    }
}
