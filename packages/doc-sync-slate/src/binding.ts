import {createSyncClientEditorHost} from "@barocss/doc-sync/editor";
import {Client, createEditorHost} from "@barocss/doc-sync/client";
import {LocalClient} from "@barocss/doc-sync/local";
import type {BindingClient} from "@barocss/doc-sync/client";
import type {SyncClient} from "@barocss/doc-sync/sync";
import type {BaseEditor} from "slate";
import {SlateHostBinding} from "./host-binding.ts";
import type {SlateBindingOptions} from "./host-binding.ts";

export type {SlateBindingOptions} from "./host-binding.ts";

/** Creates a separate editor host and keeps the supplied client identity. */
export class SlateBinding<C extends BindingClient = SyncClient> extends SlateHostBinding {
    readonly client: C;
    constructor(client: C, editor: BaseEditor, options: SlateBindingOptions = {}) {
        if (client.schema.domain === "graphic") throw new Error("Graphic schemas require a canvas binding");
        super(client instanceof Client || client instanceof LocalClient ? createEditorHost(client) : createSyncClientEditorHost(client as SyncClient), editor, options);
        this.client = client;
    }
}
