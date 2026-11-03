import {HttpTransport} from "@barocss/doc-sync/sync";
import type {Outbound, Presence, ServerEvent, Transport} from "@barocss/doc-sync/sync";

/** Holds only inbound events. Every outbound edit still uses the real transport. */
export class HeldTransport implements Transport {
    held = false;
    private queue: ServerEvent[] = [];
    private receive: ((event: ServerEvent) => void) | null = null;
    readonly transport: Transport;
    private notify: () => void;
    private failed: (message: string) => void;
    constructor(transport: Transport, notify: () => void = () => {}, failed: (message: string) => void = () => {}) { this.transport = transport; this.notify = notify; this.failed = failed; }
    get queued() { return this.queue.length; }
    subscribe(since: number, receive: (event: ServerEvent) => void, epoch?: string, version?: string) {
        this.queue = []; this.receive = receive;
        let stop: (() => void) | null = null, overflow = false;
        const unsubscribe = this.transport.subscribe(since, event => {
            if (!this.held) { receive(event); return; }
            if (this.queue.length >= 2048) { this.failed("Incoming queue limit reached; reconnect required"); this.receive = null; overflow = true; stop?.(); return; }
            this.queue.push(event); this.notify();
        }, epoch, version);
        stop = unsubscribe;
        if (overflow) unsubscribe();
        return () => { this.receive = null; this.queue = []; unsubscribe(); };
    }
    hold(value: boolean) {
        this.held = value;
        if (!value) { const queue = this.queue; this.queue = []; for (const event of queue) this.receive?.(event); }
        this.notify();
    }
    send(message: Outbound) { return this.transport.send(message); }
    sendPresence(presence: Presence) { this.transport.sendPresence(presence); }
}
export const browserTransport = (doc: string, actor: string, origin = "") => new HttpTransport(doc, actor, origin);
