import {createSyncClientEditorHost} from "@barocss/doc-sync-core/editor";
import type {SyncClient} from "@barocss/doc-sync-core/sync";
import type {BaseEditor} from "slate";
import {SlateHostBinding} from "./host-binding.ts";
import type {SlateBindingOptions} from "./host-binding.ts";

export type {SlateBindingOptions} from "./host-binding.ts";

/** Compatibility entry point that keeps the original SyncClient identity. */
export class SlateBinding extends SlateHostBinding {
    readonly client: SyncClient;
    constructor(client: SyncClient, editor: BaseEditor, options: SlateBindingOptions = {}) {
        super(createSyncClientEditorHost(client), editor, options);
        this.client = client;
    }
}
