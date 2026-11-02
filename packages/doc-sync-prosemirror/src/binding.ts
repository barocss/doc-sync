import {createSyncClientEditorHost} from "@barocss/doc-sync-core/editor";
import {Client, createEditorHost} from "@barocss/doc-sync-core/client";
import {LocalClient} from "@barocss/doc-sync-core/local";
import type {BindingClient} from "@barocss/doc-sync-core/client";
import {PmHostBinding} from "./host-binding.ts";
import type {SyncClient} from "@barocss/doc-sync-core/sync";
import type {Plugin, EditorState, Transaction} from "prosemirror-state";
import type {PmSchemaInfo} from "./schema.ts";

/** Creates a separate editor host for each native view. */
export class PmBinding<C extends BindingClient = SyncClient> extends PmHostBinding {
    readonly client: C;

    constructor(client: C, info: PmSchemaInfo, plugins: Plugin[] = [], external?: {state: EditorState; dispatch: (tr: Transaction) => void}) {
        super(client instanceof Client || client instanceof LocalClient ? createEditorHost(client) : createSyncClientEditorHost(client as SyncClient), info, plugins, external);
        this.client = client;
    }
}

export {REMOTE_META} from "./host-binding.ts";
export type {BindingStats} from "./host-binding.ts";
