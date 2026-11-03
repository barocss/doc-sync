import {createSyncClientEditorHost} from "@barocss/doc-sync/editor";
import {Client, createEditorHost} from "@barocss/doc-sync/client";
import {LocalClient} from "@barocss/doc-sync/local";
import type {BindingClient} from "@barocss/doc-sync/client";
import {PmHostBinding} from "./host-binding.ts";
import type {SyncClient} from "@barocss/doc-sync/sync";
import type {Plugin, EditorState, Transaction} from "prosemirror-state";
import type {PmSchemaInfo} from "./schema.ts";

/** Creates a separate editor host for each native view. */
export class PmBinding<C extends BindingClient = SyncClient> extends PmHostBinding {
    readonly client: C;

    constructor(client: C, info: PmSchemaInfo, plugins: Plugin[] = [], external?: {state: EditorState; dispatch: (tr: Transaction) => void}) {
        if (client.schema.domain === "graphic") throw new Error("Graphic schemas require a canvas binding");
        super(client instanceof Client || client instanceof LocalClient ? createEditorHost(client) : createSyncClientEditorHost(client as SyncClient), info, plugins, external);
        this.client = client;
    }
}

export {REMOTE_META} from "./host-binding.ts";
export type {BindingStats} from "./host-binding.ts";
