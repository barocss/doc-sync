import {InputSession, createSyncClientEditorHost} from "@barocss/doc-sync-core/editor";
import type {SyncClient} from "@barocss/doc-sync-core/sync";
import type {LexicalEditor} from "lexical";
import {LexicalHostBinding} from "./host-binding.ts";
import type {LexicalBindingOptions} from "./host-binding.ts";
import type {LexicalSchemaInfo} from "./schema.ts";

export {LEXICAL_REMOTE_TAG} from "./host-binding.ts";
export type {LexicalBindingOptions} from "./host-binding.ts";

/** Compatibility entry point that reuses one original input session. */
export class LexicalBinding extends LexicalHostBinding {
    readonly client: SyncClient;
    readonly input: InputSession;
    constructor(client: SyncClient, editor: LexicalEditor, infoOrOptions: LexicalSchemaInfo | LexicalBindingOptions = {}) {
        const input = new InputSession(client);
        super(createSyncClientEditorHost(client, {input}), editor, infoOrOptions);
        this.client = client;
        this.input = input;
    }
}
