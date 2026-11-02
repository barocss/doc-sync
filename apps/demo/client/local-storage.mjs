// Storage belongs to the application. Each save replaces one browser key atomically.
export const DEFAULT_STORAGE_KEY = 'doc-sync:client-demo:local:v1';
const FORMAT = 'doc-sync-client-demo-v1';
export function saveLocal(storage, key, client, selections = {}) {
    const bytes = JSON.stringify({format: FORMAT, state: client.captureState(), selections});
    storage.setItem(key, bytes);
    return bytes;
}
export function openLocal(storage, key, restore) {
    const bytes = storage.getItem(key);
    if (bytes === null) return null;
    const envelope = JSON.parse(bytes);
    if (!envelope || envelope.format !== FORMAT || !envelope.selections || typeof envelope.selections !== 'object' || Array.isArray(envelope.selections)) throw Error('Invalid saved document envelope');
    const client = restore(envelope.state);
    try {
        const selections = {};
        for (const [name, selection] of Object.entries(envelope.selections)) {
            if (!['ProseMirror', 'Slate', 'Lexical', 'Tiptap'].includes(name)) throw Error('Invalid saved view');
            const resolved = client.resolveSelection(selection);
            if (selection !== null && !resolved) throw Error('Invalid saved selection');
            selections[name] = resolved;
        }
        return {client, selections};
    } catch (error) { client.dispose(); throw error; }
}
export function forgetLocal(storage, key) { storage.removeItem(key); }
