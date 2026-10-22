import type {Outbound, Presence, ServerEvent, Transport} from "./protocol.ts";

/**
 * 브라우저용 전송. 서버 → 나 는 EventSource(SSE), 나 → 서버 는 fetch POST.
 * WebSocket 이 아니어도 된다 — 내려오는 것은 한 줄로 흘러오는 이벤트이고, 올라가는 것은 드문드문 보내는 변경이다.
 */
export class HttpTransport implements Transport {
    private readonly base: string;
    private readonly actor: string;

    constructor(doc: string, actor: string, origin = "") {
        this.base = `${origin}/api/docs/${encodeURIComponent(doc)}`;
        this.actor = actor;
    }

    subscribe(since: number, onEvent: (event: ServerEvent) => void): () => void {
        const source = new EventSource(`${this.base}/stream?since=${since}&actor=${encodeURIComponent(this.actor)}`);

        source.onmessage = message => onEvent(JSON.parse(message.data) as ServerEvent);

        return () => source.close();
    }

    async send(message: Outbound): Promise<void> {
        const [path, body] = message.kind === "change" ? ["changes", message.change] : ["ack", message.ack];
        const response = await fetch(`${this.base}/${path}`, {
            method: "POST",
            headers: {"content-type": "application/json"},
            body: JSON.stringify(body),
        });

        if (!response.ok) {
            throw new Error(`변경을 보내지 못했다: ${response.status} ${await response.text()}`);
        }
    }

    /** 창을 닫을 때 — 서버가 더 기다리지 않도록 */
    leave(): void {
        navigator.sendBeacon(`${this.base}/leave`, JSON.stringify({actor: this.actor}));
    }

    sendPresence(presence: Presence): void {
        fetch(`${this.base}/presence`, {
            method: "POST",
            headers: {"content-type": "application/json"},
            body: JSON.stringify(presence),
            keepalive: true,
        }).catch(() => undefined);
    }
}
