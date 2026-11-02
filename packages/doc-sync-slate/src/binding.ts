import {createSyncClientEditorHost} from "@barocss/doc-sync-core/editor";
import {Client, createEditorHost} from "@barocss/doc-sync-core/client";
import {LocalClient} from "@barocss/doc-sync-core/local";
import type {BindingClient} from "@barocss/doc-sync-core/client";
import type {SyncClient} from "@barocss/doc-sync-core/sync";
import type {BaseEditor} from "slate";
import {SlateHostBinding} from "./host-binding.ts";
import type {SlateBindingOptions} from "./host-binding.ts";

export type {SlateBindingOptions} from "./host-binding.ts";

/** Creates a separate editor host and keeps the supplied client identity. */
export class SlateBinding<C extends BindingClient = SyncClient> extends SlateHostBinding {
    readonly client: C;
    constructor(client: C, editor: BaseEditor, options: SlateBindingOptions = {}) {
        super(client instanceof Client || client instanceof LocalClient ? createEditorHost(client) : createSyncClientEditorHost(client as SyncClient), editor, options);
        this.client = client;
    }
}
