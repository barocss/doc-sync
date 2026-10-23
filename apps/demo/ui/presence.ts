import {MAIN, comparePos} from "@barocss/doc-sync";
import type {Doc, Pos} from "@barocss/doc-sync";
import type {Presence} from "@barocss/doc-sync/sync";

const lineOf = (pos: Pos): string => pos.line ?? MAIN;

/** 데모 선택은 같은 CRDT 줄(slot) 안에서만 표시한다. 숨은 칸의 끝점을 옆 칸으로 옮겨 칠하지 않는다. */
export const resolvePresence = (doc: Doc, presence: Presence): {pos: Pos; range: [Pos, Pos] | null} | null => {
    const endpoint = (key: string | null): Pos | null => {
        const item = key ? doc.get(key) : null;

        const visible = doc.hasMoves || doc.hasCardinality ? key && doc.tokenLocation(key)?.visible : item && doc.visible(item.line.key);
        return item && visible ? doc.posAfter(key!) : null;
    };
    const pos = endpoint(presence.anchor);

    if (!pos) {
        return null;
    }

    const focus = endpoint(presence.focus);
    const order = focus && lineOf(pos) === lineOf(focus) ? comparePos(pos, focus) : 0;

    return {pos, range: focus && order ? (order < 0 ? [pos, focus] : [focus, pos]) : null};
};

export const rangeContains = (range: [Pos, Pos] | null, here: Pos): boolean =>
    !!range && lineOf(here) === lineOf(range[0]) && comparePos(here, range[0]) >= 0 && comparePos({...here, o: here.o + 1}, range[1]) <= 0;
