import * as cmd from "../src/crdt/commands.ts";
import {MAIN} from "../src/crdt/doc.ts";
import {applyEdits} from "../src/crdt/model.ts";
import {MemoryNet, rng, show} from "./harness.ts";
import type {GridBlock, Pos, Doc} from "../src/crdt/doc.ts";
import type {SyncClient} from "../src/sync/client.ts";

/**
 * 무작위 동시편집 한 판. 참여자마다 무작위 편집을 하고, 네트워크는 무작위로 일부만 흘리며, 끊고 잇기와
 * 서버 GC 도 섞는다. 편집은 본문뿐 아니라 표 칸·상자 안에서도 하고, 표·행·열·상자·구분선을 넣고 지운다.
 * 끝에 모두 이어 흘린 뒤 모든 참여자와 서버의 모델이 같은지 본다.
 *
 * 거울 검사: 참여자마다 "편집기 쪽 모델"(스키마 기반 문서 에디터 자리)을 따로 둔다. 이 거울은 편집 연산(내 것 + normalize)과
 * 받는 쪽 이벤트로만 바뀐다. 매번 CRDT 모델과 같은지 본다 — 편집 API·받는 쪽 이벤트가 맞는지의 시험이다.
 */

/** 지금 보이는 흐름 줄 전부 — 본문, 보이는 표의 칸, 상자 안 */
export const visibleLines = (doc: Doc, line: string = MAIN, out: string[] = []): string[] => {
    out.push(line);
    doc.blocks(line).forEach(block => {
        if (block.kind === "grid") {
            block.rows.forEach(r => block.cols.forEach(c => visibleLines(doc, doc.cellKey(block.marker, r, c), out)));
        } else if (block.kind === "flow") {
            visibleLines(doc, block.body, out);
        }
    });

    return out;
};

const grids = (doc: Doc): GridBlock[] =>
    visibleLines(doc).flatMap(line => doc.blocks(line).filter((b): b is GridBlock => b.kind === "grid"));

const act = (client: SyncClient, r: () => number): void => {
    const doc = client.doc;
    const pick = <T>(list: readonly T[]): T => list[Math.floor(r() * list.length)];
    const line = pick(visibleLines(doc));
    const texts = doc
        .blocks(line)
        .map((b, i) => [b, i] as const)
        .filter(([b]) => b.kind === "text");
    const posIn = (): Pos => {
        const [block, b] = pick(texts);

        return {line, b, o: Math.floor(r() * ((block.kind === "text" ? block.chars.length : 0) + 1))};
    };
    const roll = r();

    if (roll < 0.22) {
        client.commit(cmd.insertText(doc, posIn(), "xyzw".slice(0, 1 + Math.floor(r() * 3))));
    } else if (roll < 0.34) {
        client.commit(cmd.splitBlock(doc, posIn()));
    } else if (roll < 0.42) {
        client.commit(cmd.backspace(doc, posIn()).ops);
    } else if (roll < 0.46) {
        client.commit(cmd.deleteForward(doc, posIn()));
    } else if (roll < 0.52) {
        client.commit(cmd.deleteRange(doc, posIn(), posIn()));
    } else if (roll < 0.56) {
        client.commit(cmd.setMark(doc, posIn(), posIn(), pick(doc.schema!.marks), r() < 0.7));
    } else if (roll < 0.59) {
        const types = doc.allowedIn(line).filter(t => doc.specOf(t)?.shape === "text");
        const type = pick(types);
        const variants = doc.specOf(type)?.ui?.variants;

        client.commit(cmd.setBlockType(doc, pick(texts)[1], type, line, variants ? {[variants.attr]: pick(Object.keys(variants.labels))} : {}));
    } else if (roll < 0.61) {
        const b = pick(texts)[1];

        client.commit(cmd.setNumberAttr(doc, b, "level", Number(doc.blocks(line)[b].attrs.level ?? 0) + (r() < 0.6 ? 1 : -1), line));
    } else if (roll < 0.65) {
        const types = doc.allowedIn(line).filter(t => doc.specOf(t)?.shape !== "text");

        const type = types.length ? pick(types) : null;
        const ops = type ? cmd.insertBlock(doc, posIn(), type, {rows: 1 + Math.floor(r() * 2), cols: 1 + Math.floor(r() * 3)}) : [];
        const made = ops[0]?.t === "node" ? doc.blocks(line).find(x => x.marker.id === (ops[0] as {id: unknown}).id) : undefined;

        // 이미지 그릇이면 그 안 image 에 그림도 함께 (편집기가 하듯 한 번에)
        if (made?.kind === "flow" && made.type === "image-component") {
            ops.push(...cmd.insertInline(doc, {line: made.body, b: 0, o: 0}, "inline-image", {src: "x.png"}));
            ops.push(...cmd.appendBlock(doc, made.body, "caption-paragraph"));
        }
        client.commit(ops);
    } else if (roll < 0.71) {
        const all = grids(doc);
        const grid = all.length ? pick(all) : null;
        const axis = r() < 0.5 ? "rows" : "cols";
        const size = grid ? grid[axis].length : 0;

        if (grid) {
            const sub = r();

            if (sub < 0.45) {
                client.commit(cmd.insertAxis(doc, grid, axis, Math.floor(r() * (size + 1))));
            } else if (sub < 0.7) {
                client.commit(cmd.deleteAxis(doc, grid, axis, Math.floor(r() * size)));
            } else if (sub < 0.82) {
                // 칸 배경색
                const row = Math.floor(r() * grid.rows.length);
                const col = Math.floor(r() * grid.cols.length);

                client.commit(cmd.setCellAttr(doc, grid, row, col, "backgroundColor", pick(["", "#fef3c7", "#dcfce7"])));
            } else {
                // 칸 합치기·나누기 (1×1 이면 나누기)
                const row = Math.floor(r() * grid.rows.length);
                const col = Math.floor(r() * grid.cols.length);

                client.commit(cmd.setSpan(doc, grid, row, col, 1 + Math.floor(r() * 2), 1 + Math.floor(r() * 3)));
            }
        }
    } else if (roll < 0.73) {
        const others = doc
            .blocks(line)
            .map((b, i) => [b, i] as const)
            .filter(([b]) => b.kind !== "text");

        others.length && client.commit(cmd.deleteBlock(doc, pick(others)[1], line));
    } else if (roll < 0.74) {
        const b = doc.blocks(MAIN).findIndex(x => x.kind === "grid");

        b >= 0 && client.commit(cmd.setAttr(doc, b, "header", r() < 0.5));
    } else if (roll < 0.77) {
        // 글 안 그림 넣기, 또는 보이는 그림 하나의 크기 바꾸기
        const images = visibleLines(doc).flatMap(l => doc.blocks(l).flatMap(x => (x.kind === "text" ? x.chars.filter(c => doc.isInline(c)) : [])));

        r() < 0.5 || !images.length
            ? client.commit(cmd.insertInline(doc, posIn(), "inline-image", {src: "y.png"}))
            : client.commit(cmd.setItemAttr(doc, pick(images), "width", 16 + Math.floor(r() * 400)));
    } else if (roll < 0.87) {
        client.undo();
    } else if (roll < 0.93) {
        client.redo();
    } else {
        client.online ? client.disconnect() : client.connect();
    }
};

const model = (client: {doc: {toJSON(): unknown}}): string => JSON.stringify(client.doc.toJSON());

export type SeedResult = {
    same: boolean;
    detail: string;
    compacted: number;
    gcs: number;
    tables: number;
    spans: number;
    /** 거울이 CRDT 모델과 달랐던 횟수 (0 이어야 한다) */
    mirrorMismatch: number;
    /** 받는 쪽 이벤트가 검산에 틀려 통째 바꾸기로 물러선 횟수 (0 이어야 한다) */
    fallbacks: number;
    /** 내 편집에 normalize 가 붙은 횟수 (CRDT 규칙으로 모양이 달라진 드문 경우) */
    normalized: number;
    /** 받는 쪽 이벤트 수 */
    events: number;
};

export const runSeed = async (seed: number, peers: number, options: {gc?: boolean; steps?: number} = {}): Promise<SeedResult> => {
    const r = rng(seed);
    const net = new MemoryNet();
    const clients = Array.from({length: peers}, (_, i) => net.add(String.fromCharCode(65 + i)));
    let gcs = 0;
    let mirrorMismatch = 0;
    let normalized = 0;
    let firstMismatch = "";

    // 거울 — 편집기 쪽 모델
    clients.forEach(c => {
        let mirror = c.doc.toJSON();
        const check = (why: string) => {
            const want = JSON.stringify(c.doc.toJSON());

            if (JSON.stringify(mirror) !== want) {
                mirrorMismatch += 1;
                firstMismatch ||= `${c.actor} ${why}\n거울 ${JSON.stringify(mirror)}\n문서 ${want}`;
                mirror = c.doc.toJSON();
            }
        };

        c.onLocalEdits = (edits, normalize) => {
            mirror = applyEdits(c.schema, mirror, edits);
            normalize.length && ((normalized += 1), (mirror = applyEdits(c.schema, mirror, normalize)));
            check(`내 편집 ${JSON.stringify(edits)}`);
        };
        c.onModelEvents = (events, info) => {
            mirror = applyEdits(c.schema, mirror, events);
            check(`${info.cause} ${JSON.stringify(events)}`);
        };
    });

    clients.forEach(c => c.connect());
    await net.settle();
    clients[0].commit(cmd.insertText(clients[0].doc, {b: 0, o: 0}, "abcdefgh"));
    // 반쯤은 표가 하나 있는 문서에서 시작한다
    seed % 2 && clients[0].commit(cmd.insertBlock(clients[0].doc, {b: 0, o: 4}, "table", {rows: 2, cols: 2}));
    await net.settle();

    for (let step = 0; step < (options.steps ?? 28); step += 1) {
        act(clients[Math.floor(r() * peers)], r);

        const flow = r();

        if (flow < 0.3) {
            net.up();
        } else if (flow < 0.55) {
            net.down(clients[Math.floor(r() * peers)].actor);
        } else if (flow < 0.65) {
            await net.settle();
        } else if (options.gc && flow < 0.8) {
            // 서버가 아무 때나 GC 를 시도한다 — 기준점에 닿은 묘비가 있으면 로그에 GC 줄이 들어간다
            net.hub.gc() && (gcs += 1);
        }

        await new Promise(resolve => setImmediate(resolve));
    }

    clients.forEach(c => c.connect());
    await net.settle();

    if (options.gc) {
        net.hub.gc() && (gcs += 1);
        await net.settle();
    }

    const server = model({doc: net.hub.doc});
    const same = clients.every(c => model(c) === server);
    const compacted = net.hub.doc.lines().reduce((n, l) => n + l.items.filter(i => i.compact).reduce((m, i) => m + i.span, 0), 0);

    return {
        same,
        compacted,
        gcs,
        tables: grids(net.hub.doc).length,
        mirrorMismatch,
        fallbacks: clients.reduce((n, c) => n + c.eventStats.fallbacks, 0),
        normalized,
        events: clients.reduce((n, c) => n + c.eventStats.events, 0),
        spans: grids(net.hub.doc).reduce((n, g) => n + g.spans.size, 0),
        detail: same ? firstMismatch : `서버 ${show({doc: net.hub.doc})}\n${clients.map(c => `${c.actor} ${show(c)}`).join("\n")}`,
    };
};
