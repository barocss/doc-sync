import {Doc} from "../crdt/doc.ts";
import {assertCompatibleSchema, schemaVersion} from "../crdt/schema-version.ts";
import {InputSession, subscribeClient} from "./index.ts";
import type {ModelRange} from "./index.ts";
import type {NodeJSON} from "../crdt/model.ts";
import type {Schema} from "../crdt/schema.ts";
import type {SyncClient} from "../sync/client.ts";

/** The host owns the native editor and must synchronously block input and reject active composition. */
export type OpenEditorSchemaHost<Prepared> = {
    pause(): void;
    selection(): ModelRange | null;
    /** Build and validate replacement resources without touching the mounted editor. */
    prepare(schema: Schema, model: NodeJSON): Prepared;
    detach(): void;
    install(prepared: Prepared, selection: ModelRange | null): void | Promise<void>;
    resume(): void;
};

const transitions = new WeakSet<SyncClient>();

/** Upgrade an open editor after the server has accepted a compatible schema. */
export async function upgradeOpenEditorSchema<Prepared>(client: SyncClient, nextSchema: Schema, host: OpenEditorSchemaHost<Prepared>, timeoutMs = 10_000): Promise<void> {
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new Error("Invalid schema transition timeout");
    if (transitions.has(client)) throw new Error("An editor schema transition is already in progress");
    if (client.conditionalPending) throw new Error("Resolve the conditional edit before changing schema");
    assertCompatibleSchema(client.schema, nextSchema);
    const next = structuredClone(nextSchema);
    assertCompatibleSchema(client.schema, next);
    const epoch = client.epoch;
    let detached = false, paused = false;
    transitions.add(client);
    try {
        host.pause();
        paused = true;
        const selection = host.selection();
        const anchors = new InputSession(client).capture(selection);
        if (selection && !anchors) throw new Error("The editor selection cannot be anchored safely");
        const model = Doc.fromSnapshot(client.actor, client.doc.snapshot(), next).toJSON();
        const prepared = host.prepare(next, model);
        client.disconnect();
        detached = true;
        host.detach();
        client.upgradeSchema(next);
        const restored = new InputSession(client).resolve(anchors);
        if (anchors && !restored) throw new Error("The editor selection cannot be restored safely");
        await host.install(prepared, restored);
        await new Promise<void>((resolve, reject) => {
            let timer: ReturnType<typeof setTimeout>, finished = false;
            const stop = subscribeClient(client, {update: () => check()});
            const previous = client.onEvent;
            let guard: NonNullable<SyncClient["onEvent"]>;
            const finish = (error?: Error) => {
                if (finished) return;
                finished = true; clearTimeout(timer);
                if (client.onEvent === guard) client.onEvent = previous;
                stop(); error ? reject(error) : resolve();
            };
            guard = event => {
                if (event.type === "reset" && epoch !== undefined && event.epoch !== epoch) {
                    client.disconnect();
                    finish(new Error("Document epoch changed during schema transition; pending changes and history are retained"));
                } else previous?.(event);
            };
            client.onEvent = guard;
            const check = () => {
                if (client.synchronized && client.schemaVerified && schemaVersion(client.schema) === schemaVersion(next)) finish();
                else if (!client.online && client.connectionError) finish(client.connectionError);
            };
            timer = setTimeout(() => finish(new Error("Schema transition reconnect timed out")), timeoutMs);
            client.connect();
            check();
        });
        host.resume();
    } catch (error) {
        if (detached) client.disconnect();
        else if (paused) host.resume();
        throw error;
    } finally {
        transitions.delete(client);
    }
}
