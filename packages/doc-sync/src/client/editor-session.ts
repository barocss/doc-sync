import type {Op} from "../crdt/doc.ts";
import type {EditorSession} from "../editor/host-contract.ts";

/** The bridge owns origin and pending operations, not the session adapter. */
export interface SessionScope {
    settled(): void;
    scoped<T>(origin: object, run: () => T): T;
    apply(origin: object, run: () => Op[] | null): Op[] | null;
    commit(origin: object, ops: Op[], run: () => void): void;
}

/** Preserve optional fields and accessors without eagerly reading base getters. */
export function overrideEditorView<T extends object>(base: T, overrides: Partial<T>): T {
    return Object.defineProperties({}, {
        ...Object.getOwnPropertyDescriptors(base),
        ...Object.getOwnPropertyDescriptors(overrides),
    }) as T;
}

export function wrapEditorSession(input: EditorSession, state: SessionScope, origin: object): EditorSession {
    return overrideEditorView(input, {
        get active() { return input.active; },
        begin: () => { state.settled(); state.scoped(origin, () => input.begin()); },
        apply: edits => input.active ? state.scoped(origin, () => input.apply(edits)) : state.apply(origin, () => input.apply(edits))!,
        applyModelEdits: (before, edits) => input.active ? state.scoped(origin, () => input.applyModelEdits(before, edits)) : state.apply(origin, () => input.applyModelEdits(before, edits))!,
        deleteRange: (from, to) => input.active ? state.scoped(origin, () => input.deleteRange(from, to)) : state.apply(origin, () => input.deleteRange(from, to)),
        commit: (ops, record) => input.active ? state.scoped(origin, () => input.commit(ops, record)) : state.commit(origin, ops, () => input.commit(ops, record)),
        end: () => { if (input.active) state.settled(); return state.scoped(origin, () => input.end()); },
        cancel: () => state.scoped(origin, () => input.cancel()),
    });
}
