import {Doc} from "../src/crdt/doc.ts";
import {DocHub} from "../src/server/hub.ts";
import {SyncClient} from "../src/sync/client.ts";
import {DEMO_SCHEMA} from "../../../fixtures/demo-schema.ts";
import type {NodeJSON} from "../src/crdt/doc.ts";
import type {Schema} from "../src/crdt/schema.ts";
import type {HubOptions} from "../src/server/hub.ts";
import type {Outbound, Presence, ServerEvent, Transport} from "../src/sync/protocol.ts";

// 시험에서는 블록 목록 고쳐 쓰기를 늘 처음부터 계산한 것과 맞춰 본다. VERIFY_BLOCKS=0 으로 끈다
Doc.verifyBlocks = process.env.VERIFY_BLOCKS !== "0";

/**
 * 메모리 안 네트워크. 서버(DocHub)와 참여자들 사이의 오르내림을 손으로 흘려보낼 수 있어서,
 * "누가 언제 무엇을 보았나"를 시험에서 정확히 만들 수 있다.
 */
export class MemoryNet {
    readonly hub: DocHub;
    readonly clients: SyncClient[] = [];
    /** 참여자 → 서버로 올라가는 중인 것 (참여자마다 보낸 순서 그대로) */
    private uplink: Outbound[] = [];
    /** 서버 → 참여자로 내려가는 중인 이벤트 */
    private readonly inbox = new Map<string, {events: ServerEvent[]; handler: ((e: ServerEvent) => void) | null}>();

    readonly schema: Schema;

    /** 서버는 기본으로 같은 스키마를 쓴다. schema: null 이면 스키마 없는 서버 */
    constructor(options: HubOptions & {clientSchema?: Schema} = {}) {
        this.schema = options.clientSchema ?? DEMO_SCHEMA;
        this.hub = new DocHub({schema: this.schema, ...options});
    }

    add(actor: string): SyncClient {
        const box = {events: [] as ServerEvent[], handler: null as ((e: ServerEvent) => void) | null};

        this.inbox.set(actor, box);

        const transport: Transport = {
            subscribe: (since, onEvent) => {
                box.handler = onEvent;
                box.events.push(
                    this.hub.hello(since),
                    ...(since > 0 ? this.hub.since(since).map(envelope => ({type: "change" as const, envelope})) : []),
                );
                this.hub.connect(actor, since > 0 ? since : this.hub.serverSeq);

                const stop = this.hub.listen(event => box.events.push(event));

                return () => {
                    stop();
                    this.hub.disconnect(actor);
                    box.handler = null;
                    box.events = [];
                };
            },
            send: async message => {
                this.uplink.push(message);
            },
            sendPresence: (_presence: Presence) => undefined,
        };
        const client = new SyncClient(actor, transport, {schema: this.schema});

        this.clients.push(client);

        return client;
    }

    /** 올라가는 중인 것을 서버에 넣는다 */
    up(): void {
        const messages = this.uplink;

        this.uplink = [];
        messages.forEach(m => (m.kind === "change" ? this.hub.submit(m.change) : this.hub.ack(m.ack)));
    }

    /** 한 참여자(또는 모두)에게 내려가는 중인 이벤트를 전한다 */
    down(actor?: string): void {
        for (const [name, box] of this.inbox) {
            if (actor && name !== actor) {
                continue;
            }

            const events = box.events;

            box.events = [];
            events.forEach(event => box.handler?.(event));
        }
    }

    /** 모두 이어진 상태에서 더 오갈 것이 없을 때까지 흘린다 */
    async settle(): Promise<void> {
        for (let round = 0; round < 80; round += 1) {
            await tick();
            this.up();
            this.down();
            await tick();

            if (!this.uplink.length && [...this.inbox.values()].every(b => !b.events.length)) {
                return;
            }
        }

        throw new Error("settle: 80 번을 돌아도 조용해지지 않는다");
    }
}

export const tick = (): Promise<void> => new Promise(resolve => setImmediate(resolve));

const PREFIX: Record<string, string> = {heading1: "#", heading2: "##", quote: ">"};

const runsText = (node: NodeJSON, marks: boolean): string =>
    (node.runs ?? [])
        .map(r => {
            if (!("text" in r)) {
                // 링크 같은 span 은 안의 글, inline 노드는 그림
                return r.runs ? runsText({type: "", runs: r.runs}, marks) : "🖼";
            }

            let t = r.text;

            if (marks) {
                r.marks.bold && (t = `**${t}**`);
                r.marks.italic && (t = `_${t}_`);
                r.marks.underline && (t = `<u>${t}</u>`);
                r.marks.strike && (t = `~~${t}~~`);
            }

            return t;
        })
        .join("");

/**
 * 블록 하나를 한 줄 글로. 제목은 `#`, 목록 항목은 `•`·`1.`(수준만큼 앞에 공백), 표는 `[a,b;c,d]` (칸 안 블록은 `/`),
 * 상자는 `{…}`, 구분선은 `---`
 */
const showNode = (node: NodeJSON, marks: boolean): string => {
    if (node.runs) {
        return `${PREFIX[node.type] ?? ""}${runsText(node, marks)}`;
    }

    if (node.type === "list") {
        const mark = node.attrs?.listType === "numbered" ? "1." : "•";

        return node.children!.map(item => `${" ".repeat(Number(item.attrs?.level ?? 0))}${mark}${runsText(item, marks)}`).join("|");
    }

    if (node.type === "table") {
        // table > table-row > table-cell > table-cell-body > 블록들
        // 합친 칸은 뒤에 {행×열}, 가려진 칸은 ·
        const cellText = (cell: NodeJSON): string => {
            if (cell.attrs?.spanned) {
                return "·";
            }

            const text = cell.children![0].children!.map(b => showNode(b, marks)).join("/");

            return cell.attrs?.colspan ? `${text}{${cell.attrs.rowspan}x${cell.attrs.colspan}}` : text;
        };

        return `[${node.children!.map(row => row.children!.map(cellText).join(",")).join(";")}]`;
    }

    // 캡션 같은 묶음은 괄호 없이 그 줄들만
    if (node.type === "caption") {
        return node.children!.map(b => showNode(b, marks)).join("|");
    }

    if (node.children) {
        return `{${node.children.map(b => showNode(b, marks)).join("|")}}`;
    }

    return node.type === "divider" ? "---" : `<${node.type}>`;
};

/** 문서를 사람이 읽는 한 줄로 — 블록 사이는 `|` */
export const show = (client: {doc: {toJSON(): NodeJSON}}): string =>
    client.doc
        .toJSON()
        .children!.map(b => showNode(b, false))
        .join("|");

/** 서식까지 — 굵게 **…**, 기울임 _…_ */
export const showMarks = (client: {doc: {toJSON(): NodeJSON}}): string =>
    client.doc
        .toJSON()
        .children!.map(b => showNode(b, true))
        .join("|");

/** 시드 고정 난수 */
export const rng = (seed: number): (() => number) => {
    let s = seed;

    return () => {
        s = (s + 0x6d2b79f5) | 0;

        let t = s;

        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);

        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
};
