import {Client} from "@barocss/doc-sync/client";
import type {ActorProfile} from "@barocss/doc-sync/client";
import {MAIN, visibleBlocks} from "@barocss/doc-sync";
import type {EditOp, NodeJSON} from "@barocss/doc-sync";
import type {Transport} from "@barocss/doc-sync/sync";
import {CANVAS_SCHEMA} from "../../../fixtures/graphic-canvas-schema.ts";
import type {CanvasKind, CanvasTransform, CanvasSize} from "../../../fixtures/graphic-canvas-schema.ts";
import {reparentTransform, worldTransform} from "./geometry.ts";
import {HeldTransport, browserTransport} from "./transport.ts";

const splitsPair = (value: string, at: number) => at > 0 && at < value.length &&
    value.charCodeAt(at - 1) >= 0xD800 && value.charCodeAt(at - 1) <= 0xDBFF &&
    value.charCodeAt(at) >= 0xDC00 && value.charCodeAt(at) <= 0xDFFF;

const GRAPHIC_CONTAINER_TYPES = Object.freeze(["frame", "object-group"]);

export interface SceneObject {
    id: string; type: CanvasKind; parentId: string | null; transform: CanvasTransform;
    size?: CanvasSize; fill?: string; text?: string; locked?: boolean;
    [key: string]: unknown;
}
type Entry = {object: SceneObject; path: number[]; node: NodeJSON};
const identity: CanvasTransform = {x: 0, y: 0, rotation: 0, scale: 1};
export class SceneSession {
    readonly client: Client;
    readonly transport: HeldTransport;
    readonly metrics = {lookupCount: 0, lookupMs: 0, reindexCount: 0, reindexMs: 0, editMs: 0, remoteMs: 0};
    private index = new Map<string, Entry>();
    private indexRevision = "";
    private raw: NodeJSON = {type: "canvas", children: []};
    private listeners = new Set<() => void>();
    private notificationPending = false;
    private disposed = false;
    private stop: () => void;
    private errors: string[] = [];
    private selection: string[] = [];
    private cursor: {x: number; y: number} | null = null;
    constructor(options: {actor: string; profile?: ActorProfile; transport?: Transport; doc?: string; origin?: string}) {
        this.transport = new HeldTransport(options.transport ?? browserTransport(options.doc ?? "canvas", options.actor, options.origin), () => this.emit(), message => { this.errors.push(message); this.client.disconnect(); this.emit(); });
        this.client = new Client({actor: options.actor, profile: options.profile, schema: CANVAS_SCHEMA, transport: this.transport});
        let remoteStart = 0;
        this.stop = this.client.subscribe({beforeEvent: () => { remoteStart = performance.now(); }, update: () => {
            if (remoteStart) { this.metrics.remoteMs = performance.now() - remoteStart; remoteStart = 0; }
            this.emit();
        }});
        this.client.connect();
    }
    private emit() {
        if (this.notificationPending || this.disposed) return;
        this.notificationPending = true;
        queueMicrotask(() => {
            this.notificationPending = false;
            if (this.disposed) return;
            for (const listener of [...this.listeners]) if (this.listeners.has(listener)) listener();
        });
    }
    subscribe(listener: () => void) { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; }
    private rebuild() {
        const stamp = this.client.stamp(), revision = `${stamp.generation}:${stamp.revision}`;
        if (revision === this.indexRevision) return;
        const start = performance.now();
        this.raw = this.client.model();
        const doc = this.client.sync!.doc, next = new Map<string, Entry>();
        const walk = (line: string, nodes: NodeJSON[], parentId: string | null, path: number[]) => {
            const blocks = doc.blocks(line), visible = visibleBlocks(doc, line);
            nodes.forEach((node, at) => {
                const block = blocks[visible[at]];
                if (!block) throw new Error("Scene projection does not match CRDT blocks");
                const id = block.marker.key, childPath = [...path, at];
                const object = {id, type: node.type as CanvasKind, parentId, ...node.attrs, ...(node.type === "label" ? {text: (node.runs ?? []).map(run => "text" in run ? run.text : "").join("")} : {})} as SceneObject;
                next.set(id, {object, path: childPath, node});
                if (node.children?.length && block.kind === "flow") walk(block.body, node.children, id, childPath);
            });
        };
        walk(MAIN, this.raw.children ?? [], null, []);
        this.index = next; this.indexRevision = revision;
        this.metrics.reindexCount++; this.metrics.reindexMs = performance.now() - start;
    }
    lookup(id: string): SceneObject | null { this.rebuild(); const start = performance.now(); const result = this.index.get(id)?.object ?? null; this.metrics.lookupCount++; this.metrics.lookupMs += performance.now() - start; return result; }
    benchmarkLookup(repetitions = 1000) {
        if (!Number.isSafeInteger(repetitions) || repetitions < 1 || repetitions > 100000) throw new Error("Invalid lookup count");
        this.rebuild(); const ids = [...this.index.keys()], start = performance.now();
        for (let at = 0; at < repetitions; at++) this.lookup(ids[at % Math.max(1, ids.length)] ?? "missing");
        return {repetitions, durationMs: performance.now() - start, reindexCount: this.metrics.reindexCount};
    }
    model(): SceneObject[] { this.rebuild(); return [...this.index.values()].map(entry => entry.object); }
    private get(id: string) {
        this.rebuild(); const start = performance.now(), entry = this.index.get(id);
        this.metrics.lookupCount++; this.metrics.lookupMs += performance.now() - start;
        if (!entry) throw new Error(`Object is missing or hidden: ${id}`);
        return entry;
    }
    private editable(id: string) { const entry = this.get(id); if (entry.object.locked) throw new Error("Object is locked"); return entry; }
    private edit(ops: EditOp[]) { const start = performance.now(); try { this.client.edit(ops); } finally { this.metrics.editMs = performance.now() - start; } }
    create(type: CanvasKind, attrs: Record<string, unknown> = {}, parentId: string | null = null): string {
        this.rebuild(); const parent = parentId === null ? null : this.editable(parentId);
        if (parent && !GRAPHIC_CONTAINER_TYPES.includes(parent.object.type)) throw new Error("Target is not a container");
        const children = parent ? parent.node.children ?? [] : this.raw.children ?? [];
        const {text, ...storedAttrs} = attrs;
        const node: NodeJSON = {type, attrs: {transform: {...identity}, ...storedAttrs}, ...(type === "label" ? {runs: [{text: typeof text === "string" ? text : "Label", marks: {}}]} : {}), ...(GRAPHIC_CONTAINER_TYPES.includes(type) ? {children: []} : {})};
        this.edit([{op: "insert", at: [...(parent?.path ?? []), children.length], content: [node]}]);
        this.rebuild(); const targetPath = [...(parent?.path ?? []), children.length];
        const result = [...this.index.values()].find(entry => entry.path.length === targetPath.length && entry.path.every((part, at) => part === targetPath[at]));
        if (!result) throw new Error("Created object was not visible"); return result.object.id;
    }
    update(id: string, attrs: Record<string, unknown>, expectedBaseText?: string) {
        const entry = this.get(id);
        if (entry.object.locked && !(Object.keys(attrs).length === 1 && attrs.locked === false)) throw new Error("Object is locked");
        if (expectedBaseText !== undefined && entry.object.text !== expectedBaseText) throw new Error("Label changed; reload before applying text");
        const {text, ...stored} = attrs, edits: EditOp[] = [];
        if (Object.keys(stored).length) edits.push({op: "update", at: entry.path, attrs: stored});
        if (text !== undefined) {
            if (entry.object.type !== "label" || typeof text !== "string" || text.length > 2000) throw new Error("Invalid label text");
            const before = entry.object.text ?? "";
            let start = 0, oldEnd = before.length, newEnd = text.length;
            while (start < oldEnd && start < newEnd && before[start] === text[start]) start++;
            // Model offsets count UTF-16 units. Never retain half of a surrogate pair.

            if (splitsPair(before, start) || splitsPair(text, start)) start--;
            while (oldEnd > start && newEnd > start && before[oldEnd - 1] === text[newEnd - 1]) { oldEnd--; newEnd--; }
            if (splitsPair(before, oldEnd) || splitsPair(text, newEnd)) { oldEnd++; newEnd++; }
            if (oldEnd > start) edits.push({op: "delete", at: [...entry.path, start], count: oldEnd - start});
            if (newEnd > start) edits.push({op: "insert", at: [...entry.path, start], content: text.slice(start, newEnd)});
        }
        this.edit(edits);
    }
    delete(id: string) { this.edit([{op: "delete", at: this.editable(id).path, count: 1}]); }
    moveWorld(id: string, x: number, y: number) {
        const entry = this.editable(id), objects = new Map(this.model().map(object => [object.id, object]));
        const current = worldTransform(objects, id), parent = entry.object.parentId ? worldTransform(objects, entry.object.parentId) : identity;
        const local = current && parent && reparentTransform({...current, x, y}, parent);
        if (!local) throw new Error("Invalid world transform");
        this.edit([{op: "update", at: entry.path, attrs: {transform: {x: local.x, y: local.y}}}]);
    }
    reparent(id: string, parentId: string | null) {
        const entry = this.editable(id), parent = parentId === null ? null : this.editable(parentId);
        if (parent && !GRAPHIC_CONTAINER_TYPES.includes(parent.object.type)) throw new Error("Target is not a container");
        for (let cursor = parent; cursor; cursor = cursor.object.parentId ? this.get(cursor.object.parentId) : null) if (cursor.object.id === id) throw new Error("Cannot create a cycle");
        if (entry.object.parentId === parentId) return;
        const map = new Map(this.model().map(object => [object.id, object]));
        const world = worldTransform(map, id), parentWorld = parentId ? worldTransform(map, parentId) : identity;
        const transform = world && parentWorld && reparentTransform(world, parentWorld);
        if (!transform) throw new Error("Invalid reparent transform");
        this.edit([{op: "update", at: entry.path, attrs: {transform}}, {op: "move", from: entry.path, at: [...(parent?.path ?? []), (parent?.node.children ?? this.raw.children ?? []).length]}]);
    }
    reorder(id: string, index: number) {
        const entry = this.editable(id), siblings = this.model().filter(object => object.parentId === entry.object.parentId);
        if (!Number.isSafeInteger(index) || index < 0 || index >= siblings.length) throw new Error("Invalid sibling index");
        this.edit([{op: "move", from: entry.path, at: [...entry.path.slice(0, -1), index]}]);
    }
    undo() { return this.client.undo(); }
    redo() { return this.client.redo(); }
    select(ids: string[]) { for (const id of ids) this.get(id); this.selection = [...new Set(ids)].slice(0, 128); this.presence(); this.emit(); }
    pointer(point: {x: number; y: number} | null) { if (point && (!Number.isFinite(point.x) || !Number.isFinite(point.y))) throw new Error("Invalid pointer"); this.cursor = point; this.presence(); }
    private presence() { this.client.setPresence({anchor: null, focus: null, metadata: {graphic: {cursor: this.cursor, selectedIds: this.selection}}}); }
    hold(value: boolean) { this.transport.hold(value); }
    connect() { this.client.connect(); }
    disconnect() { this.client.disconnect(); }
    snapshot() {
        const objects = this.model();
        return {actor: this.client.actor, online: this.client.online, ready: this.client.synchronized, pending: this.client.sync!.pending.length,
            revision: this.client.stamp().revision, model: this.raw, objects, peers: [...this.client.presence()], history: this.client.historyStatus(),
            metrics: {...this.metrics}, errors: [...this.errors, ...(this.client.sync!.connectionError ? [this.client.sync!.connectionError.message] : [])],
            selectedIds: this.selection.filter(id => this.index.has(id)), held: this.transport.held, queued: this.transport.queued};
    }
    dispose() { if (this.disposed) return; if (this.client.sync!.pending.length) throw new Error("Wait for pending edits before disposing"); this.client.clearHistory(); this.stop(); this.client.dispose(); this.disposed = true; this.listeners.clear(); }
}
