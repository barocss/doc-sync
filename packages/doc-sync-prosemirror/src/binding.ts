import {createSyncClientEditorHost} from "@barocss/doc-sync-core/editor";
import {PmHostBinding} from "./host-binding.ts";
import type {SyncClient} from "@barocss/doc-sync-core/sync";
import type {Plugin, EditorState, Transaction} from "prosemirror-state";
import type {PmSchemaInfo} from "./schema.ts";

/** Legacy SyncClient entry. The shared implementation only uses EditorHost. */
export class PmBinding extends PmHostBinding {
    readonly client: SyncClient;

    constructor(client: SyncClient, info: PmSchemaInfo, plugins: Plugin[] = [], external?: {state: EditorState; dispatch: (tr: Transaction) => void}) {
        super(createSyncClientEditorHost(client), info, plugins, external);
        this.client = client;
    }
}

export {REMOTE_META} from "./host-binding.ts";
export type {BindingStats} from "./host-binding.ts";
