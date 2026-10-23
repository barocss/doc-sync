import {MAIN, isAlive} from "@barocss/doc-sync";
import {shortOf} from "@barocss/doc-sync";
import type {Item, Line, Doc} from "@barocss/doc-sync";
import type {Envelope} from "@barocss/doc-sync/sync";

/**
 * 문서 아래의 토큰 줄들을 그대로 보여 준다. 편집기는 이 줄들에서 계산한 결과일 뿐이다.
 *   - 본문 줄, 그리고 노드마다의 자리 줄: 표의 행 줄·열 줄·칸 줄, 상자의 안 줄
 *   - ¶ 블록 표지: 파랑 = 블록을 여는 표지, 주황 = 같은 경계의 동시 Enter 라 흡수된 표지
 *   - 회색 취소선 = 묘비(지워졌지만 위치 기준으로 남아 있는 토큰), 점선 ▒ = GC 로 압축된 묘비
 */
export const renderTokens = (container: HTMLElement, doc: Doc): void => {
    const lines = doc.lines().filter(l => l.key === MAIN || l.items.length > 1);
    const all = lines.flatMap(l => l.items);
    const alive = all.filter(isAlive).length;
    const compact = all.filter(i => i.compact);
    const compactChars = compact.reduce((n, i) => n + (i.kind === "char" ? i.span : 0), 0);

    container.innerHTML = "";

    const summary = document.createElement("div");

    summary.className = "token-summary";
    summary.textContent =
        `줄 ${lines.length} · 토큰 ${all.length} · 살아 있음 ${alive} · 묘비 ${all.length - alive - compact.length}` +
        ` · 압축된 묘비 ${compact.length}개(글자 ${compactChars}자리)`;
    container.append(summary);

    lines.forEach(line => {
        const primaries = new Set<Item>();
        const aliases = new Set<Item>();

        if (isFlow(line)) {
            doc.blocks(line.key).forEach(b => {
                b.kind === "text" && !b.virtual && primaries.add(b.marker);
                b.kind === "text" && b.aliases.forEach(a => aliases.add(a));
            });
        }

        const row = document.createElement("div");
        const title = document.createElement("div");
        const strip = document.createElement("div");
        const visible = !isFlow(line) || doc.visible(line.key);

        row.className = `token-line${visible ? "" : " hidden-line"}`;
        title.className = "token-line-title";
        title.textContent = `${lineLabel(line)}${visible ? "" : " — 지금 안 보임"}`;
        strip.className = "token-strip";
        line.items.forEach(item => strip.append(chip(item, doc, primaries.has(item), aliases.has(item))));
        row.append(title, strip);
        container.append(row);
    });
};

const isFlow = (line: Line): boolean => line.slot !== "rows" && line.slot !== "cols";

const lineLabel = (line: Line): string => {
    if (!line.owner) {
        return "본문";
    }

    const owner = `${line.owner.born} ${shortOf(line.owner.id)}`;

    if (line.slot === "rows") {
        return `${owner} · 행 줄`;
    }

    if (line.slot === "cols") {
        return `${owner} · 열 줄`;
    }

    if (line.slot === "body") {
        return `${owner} · 안`;
    }

    const [row, col] = line.slot.slice(5).split(",");

    return `${owner} · 칸 (행 ${short(row)}, 열 ${short(col)})`;
};

const short = (key: string): string => {
    const [lamport, actor] = key.split("@");

    return `${lamport}${actor.slice(0, 1).toUpperCase()}`;
};

const SYMBOL: Record<string, string> = {row: "↧", col: "↦"};

const chip = (item: Item, doc: Doc, primary: boolean, alias: boolean): HTMLElement => {
    const node = document.createElement("span");

    if (item.compact) {
        node.className = "tok compact";
        node.innerHTML = `<b>▒${item.span > 1 ? `×${item.span}` : ""}</b><i>${shortOf(item.id)}</i>`;
        node.title =
            `GC 로 압축된 묘비 — ${item.kind === "char" ? `글자 ${item.span}자리` : `노드 ${item.born}`}\n` +
            "내용·기록은 버리고 자리만 남겼다. 새 토큰이 들어올 때의 자리 판단은 원래 토큰과 똑같다.";

        return node;
    }

    const dead = !isAlive(item);
    const label = document.createElement("b");
    const id = document.createElement("i");
    const head = item.boundary === "root" || item.kind === "head";
    const type = item.kind === "node" ? doc.typeOf(item) : "";
    const shape = type ? doc.specOf(type)?.shape : undefined;

    node.className = [
        "tok",
        item.kind === "char" ? "char" : shape === "text" || (head && item.kind === "node") ? "block" : "node",
        dead ? "dead" : "",
        !dead && primary ? "primary" : "",
        !dead && alias ? "alias" : "",
    ].join(" ");

    if (item.kind === "char") {
        label.textContent = item.ch === " " ? "␣" : item.ch;
        Object.keys(doc.marksOf(item)).forEach(k => label.classList.add(k));
    } else if (item.kind === "head") {
        label.textContent = "▸";
    } else if (shape === "text" || head) {
        label.textContent = `¶${typeMark(item, doc, type)}`;
    } else {
        label.textContent = SYMBOL[type] ?? (shape === "grid" ? `▦ ${type}` : shape === "flow" ? `▭ ${type}` : `― ${type}`);
    }

    id.textContent = head ? "머리" : shortOf(item.id);
    node.append(label, id);
    node.title = describe(item, doc, type, primary, alias, dead);

    return node;
};

const typeMark = (item: Item, doc: Doc, type: string): string => {
    if (type === doc.defaultIn(item.line.key) || !type) {
        return "";
    }

    const level = Number(item.attrs.get("level")?.value ?? 0);
    const listType = item.attrs.get("listType")?.value;
    const mark: Record<string, string> = {heading1: " H1", heading2: " H2", quote: " >"};

    if (doc.specOf(type)?.ui?.list) {
        return `${listType === "numbered" ? " 1." : " •"}${level ? `→${level}` : ""}`;
    }

    return mark[type] ?? ` ${type}`;
};

const nameOf = (key: string | null, doc: Doc): string => {
    if (!key) {
        return "—";
    }

    if (key === "end") {
        return "줄 끝";
    }

    const item = doc.get(key);

    if (!item) {
        return key;
    }

    if (item.boundary === "root" || item.kind === "head") {
        return "줄 머리";
    }

    return item.kind === "char" ? `'${item.ch}' ${shortOf(item.id)}` : `${doc.typeOf(item)} ${shortOf(item.id)}`;
};

const describe = (item: Item, doc: Doc, type: string, primary: boolean, alias: boolean, dead: boolean): string => {
    const lines = [
        `${item.kind === "char" ? `글자 '${item.ch}'` : item.kind === "head" ? "줄 머리" : `노드 ${type}`}  이름표 ${item.key}`,
        `기준(왼쪽) ${nameOf(item.origin, doc)}`,
    ];

    if (item.boundary && item.boundary !== "root") {
        const [left, right] = item.boundary.split("|");

        lines.push(`만든 쪽이 본 경계 ${nameOf(left, doc)} ↔ ${nameOf(right, doc)}`);
        lines.push(primary ? "이 경계의 첫 표지 → 블록을 연다" : alias ? "같은 경계의 동시 Enter → 앞 표지에 흡수" : "");
    }

    const attrs = [...item.attrs].filter(([k]) => k !== "$type" || item.kind === "node");

    attrs.length && lines.push(`속성 ${attrs.map(([k, v]) => `${k}=${JSON.stringify(v.value)}`).join(", ")}`);
    item.dels.size && lines.push(`지운 연산 ${[...item.dels].join(", ")}`);
    item.cancels.size && lines.push(`취소된 지우기 ${[...item.cancels].join(", ")}`);
    lines.push(dead ? "→ 묘비" : "→ 살아 있음");

    return lines.filter(Boolean).join("\n");
};

/** 서버 로그 한 줄 요약 */
export const describeEnvelope = (envelope: Envelope): string => {
    if (envelope.gc !== undefined) {
        return `#${envelope.serverSeq} 서버: GC — 기준점 #${envelope.gc} 까지의 안정된 묘비를 압축`;
    }

    const {change} = envelope;
    const who = change.actor.slice(0, 1);
    const parts = change.ops.map(op => {
        switch (op.t) {
            case "text":
                return `글자 "${op.text}"`;
            case "node":
                return op.type === "col" ? "열" : op.boundary ? `¶ ${op.type}` : op.type;
            case "del":
                return `지우기 ${op.ids.length}개`;
            case "undel":
                return `지우기 취소 ${op.ids.length}개`;
            case "move":
                return `이동 ${shortOf(op.target)} → ${shortOf(op.parent)}`;
            case "set":
                return `${op.key === "$type" ? "종류" : op.key} → ${JSON.stringify(op.value)} (${op.ids.length})`;
        }
    });
    // 같은 것이 이어지면 묶는다 (표 넣기 = 표 + ¶ + 행 둘 + 열 셋 …)
    const grouped: string[] = [];

    parts.forEach(p => {
        const last = grouped.at(-1);
        const match = last && /^(.*?)(?: ×(\d+))?$/.exec(last);

        match && match[1] === p ? (grouped[grouped.length - 1] = `${p} ×${Number(match[2] ?? 1) + 1}`) : grouped.push(p);
    });

    return `#${envelope.serverSeq} ${who}: ${grouped.join(", ")}`;
};
