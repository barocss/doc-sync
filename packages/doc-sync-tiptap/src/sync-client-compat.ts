import {createEditorHost, clientOwner} from "@barocss/doc-sync/client";
import type {BindingClient} from "@barocss/doc-sync/client";
import {retireClientCallback, resolveClientCallback} from "@barocss/doc-sync/editor";
import type {EditorHost} from "@barocss/doc-sync/editor";
import {SyncClient} from "@barocss/doc-sync/sync";
import type {DocSyncOptions} from "./index.ts";

const owners = new WeakMap<object, object>();

export function initialClientModel(client: BindingClient) {
    return createEditorHost(client).model().model;
}

/** Preserve legacy callback ordering while the native binding uses the Host contract. */
export function createTiptapClientCompat(input: BindingClient, options: DocSyncOptions, host: EditorHost = createEditorHost(input)) {
    const client = clientOwner(input);
    if (!(client instanceof SyncClient)) return createLocalCompat(host, options);
    const key = client;
    if (owners.has(key)) throw new Error("DocSync: this SyncClient already has a Tiptap editor.");
    const owner = {};
    owners.set(key, owner);
    let active = true;
    let selection: [string | null, string | null] | null = null;
    let sent: string | null = null;
    let sentProfile: string | null = null;
    const notify = (callback: string, invoke: () => void) => queueMicrotask(() => {
        if (!active) return;
        try { invoke(); }
        catch (error) {
            try {
                if (options.onError) options.onError(error, callback);
                else console.error(`DocSync: ${callback} failed.`, error);
            } catch (reportError) { console.error("DocSync: onError failed.", reportError); }
        }
    });
    const profileKey = () => JSON.stringify(Object.entries(options.presence ?? {}).sort(([a], [b]) => a.localeCompare(b)));
    const publish = () => {
        if (!options.presence) { sent = null; sentProfile = null; return; }
        if (!selection || !host.status().synchronized) return;
        const profile = profileKey();
        const receipt = JSON.stringify([profile, ...selection]);
        if (sent === receipt) return;
        // Store the receipt before transport delivery can synchronously re-enter.
        sent = receipt;
        sentProfile = profile;
        const presence = {...options.presence, anchor: selection[0], focus: selection[1]};
        notify("presence", () => {
            if (!host.status().synchronized) { sent = null; sentProfile = null; return; }
            try { host.setPresence(presence); }
            catch (error) { sent = null; sentProfile = null; throw error; }
        });
    };
    const priorModel = client.onModelEvents;
    const priorUpdate = client.onUpdate;
    let model: NonNullable<SyncClient["onModelEvents"]> | null = null;
    let update: (() => void) | null = null;
    return {
        connect(pull: () => void, redraw: () => void) {
            model = (events, info) => {
                if (!active) { resolveClientCallback(priorModel)?.(events, info); return; }
                if (priorModel) notify("onModelEvents", () => priorModel(events, info));
                if (active) pull();
            };
            update = () => {
                if (!active) { resolveClientCallback(priorUpdate)?.(); return; }
                if (priorUpdate) notify("onUpdate", priorUpdate);
                if (active) redraw();
            };
            client.onModelEvents = model;
            client.onUpdate = update;
        },
        selection(anchor: string | null, focus: string | null, publishSelection: boolean) {
            const changed = !selection || selection[0] !== anchor || selection[1] !== focus;
            selection = [anchor, focus];
            if (changed && options.onSelection) {
                const callback = options.onSelection;
                notify("onSelection", () => callback(anchor, focus));
            }
            if (publishSelection) publish();
        },
        publishIfNeeded() {
            if (!host.status().synchronized || !options.presence) { sent = null; sentProfile = null; }
            else if (sent === null || sentProfile !== profileKey()) publish();
        },
        dispose() {
            active = false;
            if (model) retireClientCallback(model, priorModel);
            if (update) retireClientCallback(update, priorUpdate);
            if (model && client.onModelEvents === model) client.onModelEvents = resolveClientCallback(priorModel);
            if (update && client.onUpdate === update) client.onUpdate = resolveClientCallback(priorUpdate);
            if (owners.get(key) === owner) owners.delete(key);
        },
    };
}

/** Local views subscribe through their own host origin. They do not publish presence. */
function createLocalCompat(host: EditorHost, options: DocSyncOptions) {
    let active = true;
    let stop: (() => void) | null = null;
    let selection: [string | null, string | null] | null = null;
    return {
        connect(pull: () => void, _redraw: () => void) {
            stop = host.subscribe({modelEvents: () => { if (active) pull(); }});
        },
        selection(anchor: string | null, focus: string | null, _publishSelection: boolean) {
            const changed = !selection || selection[0] !== anchor || selection[1] !== focus;
            selection = [anchor, focus];
            if (!changed || !options.onSelection) return;
            const callback = options.onSelection;
            queueMicrotask(() => {
                if (!active) return;
                try { callback(anchor, focus); }
                catch (error) {
                    try {
                        if (options.onError) options.onError(error, "onSelection");
                        else console.error("DocSync: onSelection failed.", error);
                    } catch (reportError) { console.error("DocSync: onError failed.", reportError); }
                }
            });
        },
        publishIfNeeded() {},
        dispose() { active = false; stop?.(); stop = null; },
    };
}
