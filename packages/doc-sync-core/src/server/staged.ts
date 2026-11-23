import type {DocHub} from "./hub.ts";
import type {Change, Envelope} from "../sync/protocol.ts";
import type {Schema} from "../crdt/schema.ts";

type Base = {epoch: string; serverSeq: number; schemaVersion: string | null};
export type DurableHubRecord =
    | {gc: number}
    | {change: Change; conditionalBase?: Base}
    | {recoveryPin: {actor: string; reservationId: string; pin: number | null}}
    | {schema: {from: string; to: string; schema: Schema}};

export type PreparedHubMutation<T> =
    | {status: "done"; result: T}
    | {status: "write"; record: DurableHubRecord; commit(): T};

/**
 * Prepare one synchronous hub mutation without applying it. The storage owner
 * must serialize every mutation of this hub, durably write `record`, then call
 * commit before allowing another operation. Any failure after the write is an
 * uncertain outcome and requires reopening the authoritative log.
 */
export function prepareDurableMutation<T>(hub: DocHub, apply: () => T): PreparedHubMutation<T> {
    const originals = {append: hub.onAppend, pin: hub.onRecoveryPin, schema: hub.onSchemaChange};
    if (!originals.append || !originals.pin || !originals.schema) throw new Error("Durable callbacks are unavailable");
    const signal = Symbol("prepared-hub-record");
    let record: DurableHubRecord | undefined;
    const capture = (value: DurableHubRecord): never => { record = structuredClone(value); throw signal; };
    const appendRecord = (envelope: Envelope, conditionalBase?: Base): DurableHubRecord => envelope.gc !== undefined
        ? {gc: envelope.gc} : {change: envelope.change!, ...(conditionalBase ? {conditionalBase} : {})};
    const restore = () => { hub.onAppend = originals.append; hub.onRecoveryPin = originals.pin; hub.onSchemaChange = originals.schema; };
    hub.onAppend = (envelope, base) => capture(appendRecord(envelope, base));
    hub.onRecoveryPin = entry => capture({recoveryPin: entry});
    hub.onSchemaChange = entry => capture({schema: entry});
    try {
        return {status: "done", result: apply()};
    } catch (error) {
        if (error !== signal || !record) throw error;
    } finally { restore(); }

    const prepared = record!;
    const freeze = (value: unknown): void => {
        if (!value || typeof value !== "object" || Object.isFrozen(value)) return;
        for (const child of Object.values(value)) freeze(child);
        Object.freeze(value);
    };
    freeze(prepared);
    let committed = false;
    return {status: "write", record: prepared, commit(): T {
        if (committed) throw new Error("Prepared hub mutation was already committed");
        if (hub.onAppend !== originals.append || hub.onRecoveryPin !== originals.pin || hub.onSchemaChange !== originals.schema) {
            throw new Error("Hub persistence callbacks changed during a prepared mutation");
        }
        let seen = false;
        const verify = (value: DurableHubRecord) => {
            if (seen || JSON.stringify(value) !== JSON.stringify(prepared)) throw new Error("Prepared hub mutation changed before commit");
            seen = true;
            // Listener callbacks can synchronously submit a new change. Once
            // the prepared record is verified, restore the normal callbacks
            // before the hub emits any committed event.
            restore();
        };
        hub.onAppend = (envelope, base) => verify(appendRecord(envelope, base));
        hub.onRecoveryPin = entry => verify({recoveryPin: entry});
        hub.onSchemaChange = entry => verify({schema: entry});
        try {
            const result = apply();
            if (!seen) throw new Error("Prepared hub mutation did not write its record");
            committed = true;
            return result;
        } finally { restore(); }
    }};
}
