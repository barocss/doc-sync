import {PROTOCOL_VERSION} from "./protocol.ts";
import type {Outbound, Presence, ServerEvent, Transport} from "./protocol.ts";

/**
 * 브라우저용 전송. 서버 → 나 는 EventSource(SSE), 나 → 서버 는 fetch POST.
 * WebSocket 이 아니어도 된다 — 내려오는 것은 한 줄로 흘러오는 이벤트이고, 올라가는 것은 드문드문 보내는 변경이다.
 */
export class HttpTransport implements Transport {
    private readonly base: string;
    private readonly actor: string;
    private epoch: string | undefined;
    private schemaVersion: string | undefined;
    private subscription = 0;

    constructor(doc: string, actor: string, origin = "") {
        this.base = `${origin}/api/docs/${encodeURIComponent(doc)}`;
        this.actor = actor;
    }

    subscribe(since: number, onEvent: (event: ServerEvent) => void, epoch?: string, schemaVersion?: string): () => void {
        const subscription = ++this.subscription;
        this.epoch = epoch;
        this.schemaVersion = schemaVersion;
        const source = new EventSource(`${this.base}/stream?protocol=${PROTOCOL_VERSION}&since=${since}&actor=${encodeURIComponent(this.actor)}${epoch ? `&epoch=${encodeURIComponent(epoch)}` : ""}${schemaVersion ? `&schemaVersion=${encodeURIComponent(schemaVersion)}` : ""}`);

        let active = true;
        source.onmessage = message => {
            if (!active || this.subscription !== subscription) return;
            const event = JSON.parse(message.data) as ServerEvent;
            if ((event.type === "hello" || event.type === "reset") && typeof event.epoch === "string") this.epoch = event.epoch;
            onEvent(event);
        };

        return () => { active = false; source.onmessage = null; source.close(); };
    }

    async send(message: Outbound): Promise<void> {
        const [path, body] = message.kind === "change" ? ["changes", message.change] : ["ack", message.ack];
        const response = await fetch(`${this.base}/${path}`, {
            method: "POST",
            headers: {"content-type": "application/json", "x-doc-sync-protocol": String(PROTOCOL_VERSION), ...(this.epoch ? {"x-doc-sync-epoch": this.epoch} : {}), ...(this.schemaVersion ? {"x-doc-sync-schema": this.schemaVersion} : {})},
            body: JSON.stringify(body),
        });

        if (!response.ok) {
            throw new Error(`변경을 보내지 못했다: ${response.status} ${await response.text()}`);
        }
    }

    /** 창을 닫을 때 — 서버가 더 기다리지 않도록 */
    leave(): void {
        const query = new URLSearchParams();
        if (this.epoch) query.set("epoch", this.epoch);
        if (this.schemaVersion) query.set("schemaVersion", this.schemaVersion);
        navigator.sendBeacon(`${this.base}/leave${query.size ? `?${query}` : ""}`, JSON.stringify({actor: this.actor}));
    }

    sendPresence(presence: Presence): void {
        fetch(`${this.base}/presence`, {
            method: "POST",
            headers: {"content-type": "application/json", "x-doc-sync-protocol": String(PROTOCOL_VERSION), ...(this.epoch ? {"x-doc-sync-epoch": this.epoch} : {}), ...(this.schemaVersion ? {"x-doc-sync-schema": this.schemaVersion} : {})},
            body: JSON.stringify(presence),
            keepalive: true,
        }).catch(() => undefined);
    }
}
