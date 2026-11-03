import {InputSession, createSyncClientEditorHost} from "@barocss/doc-sync/editor";
import type {EditorSession} from "@barocss/doc-sync/editor";
import {Client, createEditorHost} from "@barocss/doc-sync/client";
import {LocalClient} from "@barocss/doc-sync/local";
import type {BindingClient} from "@barocss/doc-sync/client";
import type {SyncClient} from "@barocss/doc-sync/sync";
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
        if (client.schema.domain === "graphic") throw new Error("Graphic schemas require a canvas binding");
        const input = client instanceof Client || client instanceof LocalClient ? undefined : new InputSession(client as SyncClient);
        super(input ? createSyncClientEditorHost(client as SyncClient, {input}) : createEditorHost(client), editor, infoOrOptions);
        this.client = client;
        this.input = (input ?? this.session) as C extends SyncClient ? InputSession : EditorSession;
    }
}
