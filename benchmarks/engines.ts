import * as Y from "yjs";
import {Doc} from "@barocss/doc-sync";
import type {EditOp, Op, Run, Schema} from "@barocss/doc-sync";
import type {TraceOp} from "./trace.ts";

/**
 * 측정할 엔진. 모두 같은 꼴로 감싼다 — 로컬 편집 하나 → 전선에 실을 것(payload), 받은 payload 적용, 문단 글, 저장·불러오기.
 *
 *   ours  이 라이브러리. Doc.edit(모델 연산) → 전선 연산(JSON 문자열로 보낸다). 받는 쪽은 Doc.apply
 *   yjs   y-prosemirror 와 같은 꼴 — XmlFragment 안에 paragraph XmlElement, 그 안에 XmlText.
 *         Yjs 에는 나누기가 없어 y-prosemirror 처럼 뒷글을 지우고 새 문단에 다시 넣는다 (합치기도 마찬가지)
 */

export type Payload = string | Uint8Array;

export interface Replica {
    local(op: TraceOp): Payload;
    remote(payload: Payload): void;
    paragraphs(): string[];
    encode(): Payload;
}

export interface Engine {
    name: string;
    create(actor: string): Replica;
    /** 저장한 것에서 새 복제본 */
    load(actor: string, saved: Payload): Replica;
    /** 서버 쪽 비용 — 받은 payload 를 검사하고 적용한다 (Yjs 는 검사가 없다) */
    server?(): {submit(payload: Payload): void};
    bytes(payload: Payload): number;
}

/** 측정용 최소 스키마 — 본문은 문단만 */
export const BENCH_SCHEMA: Schema = {
    root: "content",
    marks: ["bold", "italic"],
    nodes: {
        content: {shape: "flow", children: ["paragraph"], default: "paragraph"},
        paragraph: {shape: "text", children: []},
    },
};

const textOf = (runs: Run[] = []): string => runs.map(r => ("text" in r ? r.text : "￼")).join("");

const toEdit = (op: TraceOp): EditOp => {
    switch (op.t) {
        case "ins":
            return {op: "insert", at: [op.b, op.o], content: op.s};
        case "del":
            return {op: "delete", at: [op.b, op.o], count: op.n};
        case "split":
            return {op: "split", at: [op.b, op.o]};
        case "merge":
            return {op: "merge", at: [op.b]};
    }
};

class OursReplica implements Replica {
    readonly doc: Doc;

    constructor(doc: Doc) {
        this.doc = doc;
    }

    local(op: TraceOp): Payload {
        return JSON.stringify(this.doc.edit([toEdit(op)]).ops);
    }

    remote(payload: Payload): void {
        (JSON.parse(payload as string) as Op[]).forEach(op => this.doc.apply(op));
    }

    paragraphs(): string[] {
        return (this.doc.toJSON().children ?? []).map(n => textOf(n.runs));
    }

    encode(): Payload {
        return JSON.stringify(this.doc.snapshot());
    }
}

export const ours: Engine = {
    name: "ours",
    create: actor => new OursReplica(new Doc(actor, BENCH_SCHEMA)),
    load: (actor, saved) => new OursReplica(Doc.fromSnapshot(actor, JSON.parse(saved as string), BENCH_SCHEMA)),
    server: () => {
        const doc = new Doc("server", BENCH_SCHEMA);

        return {
            submit(payload: Payload): void {
                const ops = JSON.parse(payload as string) as Op[];
                const problem = doc.check(ops);

                if (problem) {
                    throw new Error(problem);
                }

                ops.forEach(op => doc.apply(op));
            },
        };
    },
    bytes: payload => Buffer.byteLength(payload as string),
};

class YjsReplica implements Replica {
    readonly doc: Y.Doc;
    readonly root: Y.XmlFragment;
    private last: Uint8Array | null = null;

    constructor(doc: Y.Doc) {
        this.doc = doc;
        this.root = doc.getXmlFragment("prosemirror");
        doc.on("update", (update: Uint8Array, origin: unknown) => origin !== "remote" && (this.last = update));
    }

    private text(b: number): Y.XmlText {
        return (this.root.get(b) as Y.XmlElement).get(0) as Y.XmlText;
    }

    local(op: TraceOp): Payload {
        this.last = null;
        this.doc.transact(() => {
            if (op.t === "ins") {
                this.text(op.b).insert(op.o, op.s);
            } else if (op.t === "del") {
                this.text(op.b).delete(op.o, op.n);
            } else if (op.t === "split") {
                const text = this.text(op.b);
                const tail = text.toString().slice(op.o);

                tail && text.delete(op.o, tail.length);
                this.root.insert(op.b + 1, [paragraph(tail)]);
            } else {
                const tail = this.text(op.b).toString();
                const prev = this.text(op.b - 1);

                this.root.delete(op.b, 1);
                tail && prev.insert(prev.length, tail);
            }
        });

        return this.last ?? new Uint8Array();
    }

    remote(payload: Payload): void {
        Y.applyUpdate(this.doc, payload as Uint8Array, "remote");
    }

    paragraphs(): string[] {
        return this.root.toArray().map(p => ((p as Y.XmlElement).get(0) as Y.XmlText).toString());
    }

    encode(): Payload {
        return Y.encodeStateAsUpdate(this.doc);
    }
}

const paragraph = (text: string): Y.XmlElement => {
    const p = new Y.XmlElement("paragraph");

    p.insert(0, [new Y.XmlText(text)]);

    return p;
};

/** 모든 Yjs 복제본이 같은 첫 문단에서 시작하도록 한 번 만든 시작 상태 */
const yjsStart = (() => {
    const doc = new Y.Doc();

    doc.clientID = 1;
    doc.getXmlFragment("prosemirror").insert(0, [paragraph("")]);

    return Y.encodeStateAsUpdate(doc);
})();

let yjsClient = 100;

export const yjs: Engine = {
    name: "yjs",
    create: () => {
        const doc = new Y.Doc();

        doc.clientID = (yjsClient += 1);
        Y.applyUpdate(doc, yjsStart, "remote");

        return new YjsReplica(doc);
    },
    load: (_actor, saved) => {
        const doc = new Y.Doc();

        Y.applyUpdate(doc, saved as Uint8Array, "remote");

        return new YjsReplica(doc);
    },
    bytes: payload => (payload as Uint8Array).byteLength,
};

export const ENGINES: Engine[] = [ours, yjs];
