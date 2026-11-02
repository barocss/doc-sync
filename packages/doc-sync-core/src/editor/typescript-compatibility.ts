import {Doc, MAIN} from "../crdt/doc.ts";
import {anchorAt, pathAt, posOfPath} from "../crdt/edit.ts";
import {deleteRange} from "../crdt/commands.ts";
import type {Op} from "../crdt/doc.ts";
import type {RecordOptions} from "../crdt/history.ts";
import type {EditOp, ModelPath, NodeJSON} from "../crdt/model.ts";
import type {SyncClient} from "../sync/client.ts";
import type {EngineInputSession} from "../engine/client-contract.ts";
import type {AnchoredRange, ModelRange} from "./index.ts";
import {commitModelEdits} from "../engine/editing.ts";
/** Keep composition edits on their original token identities while remote receipt stays live. */
class TypeScriptCompatibilityInputSession {
    readonly client: SyncClient;
    private fork: Doc | null = null;
    private pending: Array<{ops: Op[]; record?: RecordOptions | null}> = [];

    constructor(client: SyncClient) { this.client = client; }
    get active(): boolean { return this.fork !== null; }
    get doc(): Doc { this.reserveClock(); return this.fork ?? this.client.doc; }

    reserveClock(): void {
        if (!this.fork) return;
        const lamport = Math.max(this.fork.clock.lamport, this.client.doc.clock.lamport);
        this.fork.clock.lamport = lamport;
        this.client.doc.clock.lamport = lamport;
    }

    begin(): void {
        if (this.fork) return;
        this.fork = Doc.fromSnapshot(this.client.actor, this.client.doc.snapshot(), this.client.schema);
        this.pending = [];
    }

    publish(): {ops: Op[]; record: RecordOptions} | null {
        if (!this.fork) return null;
        this.client.assertLocalEditing();
        this.reserveClock();
        const ops = this.pending.flatMap(change => change.ops);
        const first = this.pending[0]?.record, last = this.pending.at(-1)?.record;
        this.client.doc.emit(ops);
        return {ops, record: {caretBefore: first?.caretBefore ?? "", caretAfter: last?.caretAfter ?? "", typing: false}};
    }

    cancel(): void { this.fork = null; this.pending = []; }

    collect(ops: Op[], record?: RecordOptions | null): void {
        this.client.assertLocalEditing();
        if (this.fork) {
            this.reserveClock();
            if (ops.length) this.pending.push({ops, record});
        } else if (record === undefined) this.client.commit(ops);
        else this.client.commit(ops, record);
    }

    capture(range: ModelRange | null): AnchoredRange | null {
        if (!range) return null;
        const doc = this.doc;
        const valid = (path: ModelPath) => {
            if (path.length < 2 || path.some(value => !Number.isInteger(value) || value < 0)) return null;
            const pos = posOfPath(doc, path);
            return pos && pos.o === path.at(-1) && doc.visible(pos.line ?? MAIN) ? anchorAt(doc, path) : null;
        };
        const anchor = valid(range.anchor), focus = valid(range.focus);
        return anchor && focus ? {anchor, focus} : null;
    }

    resolve(range: AnchoredRange | null): ModelRange | null {
        if (!range) return null;
        const doc = this.client.doc;
        const resolve = (key: string) => {
            const item = doc.get(key);
            const visible = doc.hasMoves || doc.hasCardinality ? doc.tokenLocation(key)?.visible : item && doc.visible(item.line.key);
            return item && visible ? pathAt(doc, key) : null;
        };
        const anchor = resolve(range.anchor), focus = resolve(range.focus);
        return anchor && focus ? {anchor, focus} : null;
    }
}


/** Preserve Doc-based test clients and application facades without creating a shadow Doc. */
export function createTypeScriptCompatibilitySession(client: SyncClient): EngineInputSession & {typescriptDocument(): Doc} {
    const input = new TypeScriptCompatibilityInputSession(client);
    let current: Doc | null = null, generation = 0;
    const mutable = () => { client.assertLocalEditing(); const doc = input.doc; if (doc !== client.doc) client.doc.editGuard?.(); return doc; };
    return {
        get active() { return input.active; },
        begin: () => input.begin(), reserveClock: () => input.reserveClock(),
        collect: (ops, record) => input.collect(ops, record), publish: () => input.publish(), cancel: () => input.cancel(),
        capture: range => input.capture(range), resolve: range => input.resolve(range),
        typescriptDocument: () => input.doc,
        stamp() { const doc = input.doc; if (current !== doc) { current = doc; generation++; } return {generation, revision: doc.version}; },
        model: () => input.doc.toJSON(),
        apply: (edits: EditOp[]) => mutable().edit(edits).ops,
        applyModelEdits: (before: NodeJSON, edits: EditOp[]) => commitModelEdits(mutable(), before, edits),
        deleteRange(from: ModelPath, to: ModelPath) { const doc = mutable(), a = posOfPath(doc, from), b = posOfPath(doc, to); return a && b ? deleteRange(doc, a, b) : null; },
        captureAnchor: path => anchorAt(input.doc, path),
        locateAnchor(key, visibility) { const doc = input.doc, item = doc.get(key); if (visibility === "visible") { const visible = doc.hasMoves || doc.hasCardinality ? doc.tokenLocation(key)?.visible : item && doc.visible(item.line.key); if (!item || !visible) return null; } return pathAt(doc, key); },
    };
}
