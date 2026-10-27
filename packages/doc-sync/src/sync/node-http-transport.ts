import {PROTOCOL_VERSION} from "./protocol.ts";
import type {Outbound, Presence, ServerEvent, Transport} from "./protocol.ts";
import type {Change} from "./protocol.ts";
import type {ConditionalBase, ConditionalReply} from "./client.ts";
import {schemaVersion} from "../crdt/schema-version.ts";
import type {Schema} from "../crdt/schema.ts";

/** HTTP + SSE transport for Node.js 22.18 and later. */
export class NodeHttpTransport implements Transport {
    private readonly base: string;
    private readonly actor: string;
    private epoch: string | undefined;
    private schemaVersion: string | undefined;
    private subscription = 0;
    private stopSubscription: (() => void) | null = null;

    constructor(doc: string, actor: string, origin: string) {
        this.base = `${origin.replace(/\/$/, "")}/api/docs/${encodeURIComponent(doc)}`;
        this.actor = actor;
    }

    subscribe(since: number, onEvent: (event: ServerEvent) => void, epoch?: string, schemaVersion?: string): () => void {
        this.stopSubscription?.();
        const subscription = ++this.subscription;
        this.epoch = epoch;
        this.schemaVersion = schemaVersion;
        const controller = new AbortController();
        let active = true;
        let timer: ReturnType<typeof setTimeout> | undefined;
        let wake: (() => void) | undefined;
        // Keep the original cursor and epoch, as EventSource does on reconnect.
        // Replayed envelopes are deduplicated by SyncClient.
        const url = `${this.base}/stream?protocol=${PROTOCOL_VERSION}&since=${since}&actor=${encodeURIComponent(this.actor)}${epoch ? `&epoch=${encodeURIComponent(epoch)}` : ""}${schemaVersion ? `&schemaVersion=${encodeURIComponent(schemaVersion)}` : ""}`;
        const isActive = () => active && this.subscription === subscription;
        const stop = () => {
            if (!active) return;
            active = false;
            controller.abort();
            if (timer) clearTimeout(timer);
            wake?.();
            if (this.stopSubscription === stop) this.stopSubscription = null;
        };
        this.stopSubscription = stop;

        const run = async () => {
            while (isActive()) {
                try {
                    const response = await fetch(url, {headers: {accept: "text/event-stream"}, signal: controller.signal});
                    if (!response.ok || !response.body || !response.headers.get("content-type")?.toLowerCase().startsWith("text/event-stream")) {
                        throw new Error(`SSE connection failed: ${response.status}`);
                    }
                    const reader = response.body.getReader();
                    const decoder = new TextDecoder();
                    let buffer = "";
                    let data: string[] = [];
                    const line = (value: string) => {
                        if (!value) {
                            if (data.length && isActive()) {
                                const event = JSON.parse(data.join("\n")) as ServerEvent;
                                data = [];
                                if ((event.type === "hello" || event.type === "reset") && typeof event.epoch === "string") this.epoch = event.epoch;
                                onEvent(event);
                            }
                            data = [];
                        } else if (value.startsWith("data:")) {
                            const content = value.slice(5);
                            data.push(content.startsWith(" ") ? content.slice(1) : content);
                        } else if (value === "data") data.push("");
                    };
                    try {
                        while (isActive()) {
                            const next = await reader.read();
                            if (next.done) break;
                            buffer += decoder.decode(next.value, {stream: true});
                            // A CR at a chunk boundary may start CRLF. Leave it until the next chunk.
                            for (;;) {
                                const match = /\r\n|\r|\n/.exec(buffer);
                                if (!match || (match[0] === "\r" && match.index === buffer.length - 1)) break;
                                line(buffer.slice(0, match.index));
                                buffer = buffer.slice(match.index + match[0].length);
                            }
                        }
                    } finally {
                        await reader.cancel().catch(() => undefined);
                        reader.releaseLock();
                    }
                } catch {
                    // EventSource retries a failed stream; pending writes remain with SyncClient.
                }
                if (isActive()) {
                    await new Promise<void>(resolve => {
                        wake = resolve;
                        timer = setTimeout(resolve, 1000);
                    });
                    timer = undefined;
                    wake = undefined;
                }
            }
        };
        void run();
        return stop;
    }

    async send(message: Outbound): Promise<void> {
        const [path, body] = message.kind === "change" ? ["changes", message.change] : ["ack", message.ack];
        await this.post(path, body);
    }

    /** Server-side compare-and-submit. Retry the same actor, sequence and payload after a lost response. */
    async submitConditional(base: ConditionalBase, change: Change): Promise<ConditionalReply> {
        const response = await fetch(`${this.base}/conditional`, {
            method: "POST",
            signal: AbortSignal.timeout(10_000),
            headers: {"content-type": "application/json", "x-doc-sync-protocol": String(PROTOCOL_VERSION), "x-doc-sync-epoch": base.epoch, ...(this.schemaVersion ? {"x-doc-sync-schema": this.schemaVersion} : {})},
            body: JSON.stringify({base, change}),
        });
        const body = await response.json() as {status?: unknown; serverSeq?: unknown; code?: unknown; error?: unknown};
        if (response.ok && body.status === "accepted" && Number.isSafeInteger(body.serverSeq) && (body.serverSeq as number) > 0) {
            return {status: "accepted", serverSeq: body.serverSeq as number};
        }
        if (response.status === 409 && typeof body.code === "string" && typeof body.error === "string") {
            return {status: "rejected", code: body.code, error: body.error};
        }
        throw new Error(`Conditional submission outcome is unknown: HTTP ${response.status}`);
    }

    /** Inspect the server's current schema independently of the SSE subscription. */
    async getSchema(): Promise<{schemaVersion: string | null; schema: Schema | null}> {
        const response = await fetch(`${this.base}/schema`);
        if (!response.ok) throw new Error(`Could not read server schema: HTTP ${response.status}`);
        const value = await response.json() as {schemaVersion?: unknown; schema?: unknown};
        if (value.schemaVersion === null && value.schema === null) return {schemaVersion: null, schema: null};
        if (typeof value.schemaVersion !== "string" || !value.schema || typeof value.schema !== "object" ||
            schemaVersion(value.schema as Schema) !== value.schemaVersion) throw new Error("Invalid server schema or fingerprint");
        return {schemaVersion: value.schemaVersion, schema: value.schema as Schema};
    }

    /** Read the authoritative generation without joining as an editing participant. */
    async getRecoveryState(): Promise<{generation: string | null; epoch: string; serverSeq: number; schemaVersion: string | null; reservationEra?: number}> {
        const response = await fetch(`${this.base}/recovery-state`, {signal: AbortSignal.timeout(10_000)});
        if (!response.ok) throw new Error(`Could not read server state: HTTP ${response.status}`);
        const value = await response.json() as {generation?: unknown; epoch?: unknown; serverSeq?: unknown; schemaVersion?: unknown; reservationEra?: unknown};
        if (!(value.generation === null || typeof value.generation === "string") || typeof value.epoch !== "string" ||
            !Number.isSafeInteger(value.serverSeq) || (value.serverSeq as number) < 0 ||
            !(value.schemaVersion === null || typeof value.schemaVersion === "string") ||
            (value.reservationEra !== undefined && (!Number.isSafeInteger(value.reservationEra) || (value.reservationEra as number) < 0))) throw new Error("Invalid server recovery state");
        return value as {generation: string | null; epoch: string; serverSeq: number; schemaVersion: string | null; reservationEra?: number};
    }

    /** Reserve deletion history independently of an online peer lease. */
    async reserveRecovery(generation: string, reservationId: string, pin: number | null, requireExisting = false): Promise<{status: "protected"; generation: string; pin: number; lastGc: number; existing: boolean} | {status: "unsafe"}> {
        const response = await fetch(`${this.base}/recovery-lease`, {
            method: "POST", signal: AbortSignal.timeout(10_000),
            headers: {"content-type": "application/json", "x-doc-sync-protocol": String(PROTOCOL_VERSION)},
            body: JSON.stringify({generation, actor: this.actor, reservationId, pin, ...(requireExisting ? {requireExisting: true} : {})}),
        });
        if (!response.ok) throw new Error(`Recovery reservation outcome is unknown: HTTP ${response.status}`);
        const value = await response.json() as {status?: unknown; generation?: unknown; pin?: unknown; lastGc?: unknown; existing?: unknown};
        if (value.status === "unsafe") return {status: "unsafe"};
        if (value.status !== "protected" || value.generation !== generation || !Number.isSafeInteger(value.pin) ||
            (value.pin as number) < 1 || typeof value.existing !== "boolean" || !Number.isSafeInteger(value.lastGc) || (value.lastGc as number) < 0 ||
            (value.lastGc as number) >= (value.pin as number)) throw new Error("Invalid recovery reservation response");
        return value as {status: "protected"; generation: string; pin: number; lastGc: number; existing: boolean};
    }

    async getChangeReceipt(generation: string, change: Change): Promise<{status: "accepted"; serverSeq: number; generation: string} | {status: "unknown"}> {
        const response = await fetch(`${this.base}/change-receipt`, {method: "POST", signal: AbortSignal.timeout(10_000),
            headers: {"content-type": "application/json", "x-doc-sync-protocol": String(PROTOCOL_VERSION)}, body: JSON.stringify({generation, change})});
        if (!response.ok) throw new Error(`Could not read change receipt: HTTP ${response.status}`);
        const value = await response.json() as {status?: unknown; generation?: unknown; serverSeq?: unknown};
        if (value.status === "unknown") return {status: "unknown"};
        if (value.status !== "accepted" || value.generation !== generation || !Number.isSafeInteger(value.serverSeq) || (value.serverSeq as number) < 1) throw new Error("Invalid change receipt");
        return value as {status: "accepted"; serverSeq: number; generation: string};
    }

    /** Atomically recover the exact pending change under a durable reservation. */
    async recoverChange(generation: string, reservationId: string, version: string, change: Change): Promise<void> {
        const response = await fetch(`${this.base}/recover-change`, {method: "POST", signal: AbortSignal.timeout(10_000),
            headers: {"content-type": "application/json", "x-doc-sync-protocol": String(PROTOCOL_VERSION)},
            body: JSON.stringify({generation, reservationId, schemaVersion: version, change})});
        if (!response.ok) throw new Error(`Pending recovery is not confirmed: HTTP ${response.status}`);
        const value = await response.json() as {status?: unknown; generation?: unknown; serverSeq?: unknown};
        if (value.status !== "accepted" || value.generation !== generation || !Number.isSafeInteger(value.serverSeq) || (value.serverSeq as number) < 1) throw new Error("Invalid recovery submission response");
    }

    /** Release only after the caller no longer needs the durable recovery reservation. */
    async releaseRecovery(generation: string, reservationId: string): Promise<void> {
        const response = await fetch(`${this.base}/recovery-lease`, {
            method: "POST", signal: AbortSignal.timeout(10_000),
            headers: {"content-type": "application/json", "x-doc-sync-protocol": String(PROTOCOL_VERSION)},
            body: JSON.stringify({generation, actor: this.actor, reservationId, action: "release"}),
        });
        if (!response.ok) throw new Error(`Recovery reservation release outcome is unknown: HTTP ${response.status}`);
        const value = await response.json() as {status?: unknown};
        if (value.status !== "released") throw new Error("Recovery reservation release was not confirmed");
    }

    /** Inspect an exact conditional receipt. Unknown never means rejected. */
    async getRecoveryReceipt(generation: string, base: ConditionalBase, change: Change): Promise<{status: "accepted"; serverSeq: number; generation: string} | {status: "unknown"}> {
        const response = await fetch(`${this.base}/receipt`, {method: "POST", headers: {"content-type": "application/json", "x-doc-sync-protocol": String(PROTOCOL_VERSION)},
            body: JSON.stringify({generation, base, change}), signal: AbortSignal.timeout(10_000)});
        if (!response.ok) throw new Error(`Could not read recovery receipt: HTTP ${response.status}`);
        const result = await response.json() as {status?: unknown; serverSeq?: unknown; generation?: unknown};
        if (result.status === "unknown") return {status: "unknown"};
        if (result.status !== "accepted" || result.generation !== generation || !Number.isSafeInteger(result.serverSeq) || (result.serverSeq as number) < 1) {
            throw new Error("Invalid recovery receipt");
        }
        return {status: "accepted", serverSeq: result.serverSeq as number, generation};
    }

    /** Request an atomic, compatible server schema transition. A network error has an unknown outcome. */
    async transitionSchema(base: {epoch: string; serverSeq: number; schemaVersion: string}, schema: Schema): Promise<{schemaVersion: string}> {
        const response = await fetch(`${this.base}/schema`, {
            method: "POST",
            headers: {"content-type": "application/json", "x-doc-sync-protocol": String(PROTOCOL_VERSION), "x-doc-sync-epoch": base.epoch, "x-doc-sync-schema": base.schemaVersion},
            body: JSON.stringify({base, schema}),
        });
        const value = await response.json() as {schemaVersion?: unknown; error?: unknown};
        if (response.status === 409 && typeof value.error === "string") throw new Error(`Schema transition rejected: ${value.error}`);
        if (!response.ok || typeof value.schemaVersion !== "string") throw new Error(`Schema transition outcome is unknown: HTTP ${response.status}`);
        if (value.schemaVersion !== schemaVersion(schema)) throw new Error("Schema transition response has an unexpected version; inspect the server schema");
        return {schemaVersion: value.schemaVersion};
    }

    sendPresence(presence: Presence): void {
        void this.post("presence", presence).catch(() => undefined);
    }

    /** Tell the server to release this actor's presence and undo pin. */
    async leave(): Promise<void> {
        await this.post("leave", {actor: this.actor}, AbortSignal.timeout(5_000));
    }

    private async post(path: string, body: unknown, signal?: AbortSignal): Promise<void> {
        const response = await fetch(`${this.base}/${path}`, {
            method: "POST",
            signal,
            headers: {"content-type": "application/json", "x-doc-sync-protocol": String(PROTOCOL_VERSION), ...(this.epoch ? {"x-doc-sync-epoch": this.epoch} : {}), ...(this.schemaVersion ? {"x-doc-sync-schema": this.schemaVersion} : {})},
            body: JSON.stringify(body),
        });
        if (!response.ok) throw new Error(`Failed to send ${path}: ${response.status} ${await response.text()}`);
        await response.body?.cancel();
    }
}
