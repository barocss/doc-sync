import type {Client} from "../client/index.ts";
import {schemaVersion} from "../crdt/schema-version.ts";
import {createDataSchema} from "./schema.ts";
import type {EditOp, NodeJSON} from "../crdt/model.ts";

export type DataId = string;
export type DataScalar = null | boolean | number | string;
export type DataValue = DataScalar | SharedMap | SharedList;
export interface DataWrite {readonly collection: DataId; readonly kind: "map" | "list"; readonly operation: "set" | "insert" | "delete" | "move"; readonly key?: string; readonly id?: DataId; readonly index?: number; readonly value?: DataValue}
/** Application policy for local writes only. Remote admission needs server policy. */
export type DataValidator = (write: Readonly<DataWrite>) => void;
/** Collection access for one Client. Client owns editing, history and persistence. */
export interface SharedData {
    readonly root: SharedMap;
    createMap(): SharedMap;
    createList(): SharedList;
    getMap(id: DataId): SharedMap | undefined;
    getList(id: DataId): SharedList | undefined;
}
type Encoded = {scalar: DataScalar} | {reference: DataId; kind: "map" | "list"};
type Indexed = {id: DataId; node: NodeJSON; path: number[]};
const ROOT = "$root";
const validId = (id: unknown): id is DataId => typeof id === "string" && /^data:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id);
const fail = (message: string): never => {throw new Error(`Data: ${message}`);};
function freeze<T>(value: T): T {
    if (value && typeof value === "object" && !Object.isFrozen(value)) { Object.values(value).forEach(freeze); Object.freeze(value); }
    return value;
}

/** Map/List facade. All edits, history and transport use the existing Client. */
class DataAccess implements SharedData {
    readonly #client: Client;
    readonly root: SharedMap;
    readonly #validate: DataValidator;
    readonly #assertMutable: () => void;
    private index = new Map<DataId, Indexed>();
    private childIndex = new Map<DataId, Indexed[]>();
    private keyIndex = new Map<DataId, Map<string, Indexed[]>>();
    private version = "";
    private handles = new Map<DataId, SharedMap | SharedList>();
    constructor(client: Client, validate: DataValidator, assertMutable: () => void) {
        this.#client = client;
        this.#validate = validate;
        this.#assertMutable = assertMutable;
        this.root = new SharedMap(this, ROOT);
        this.handles.set(ROOT, this.root);
    }
    createMap(): SharedMap { return this.create("map") as SharedMap; }
    createList(): SharedList { return this.create("list") as SharedList; }
    getMap(id: DataId): SharedMap | undefined { const item = this.lookup(id); return item?.node.type === "map" || id === ROOT ? this.handle(id, "map") as SharedMap : undefined; }
    getList(id: DataId): SharedList | undefined { return this.lookup(id)?.node.type === "list" ? this.handle(id, "list") as SharedList : undefined; }
    mutable() { this.#assertMutable(); assertDataSchema(this.#client); }
    private refresh() {
        assertDataSchema(this.#client);
        const stamp = this.#client.stamp(), version = `${stamp.generation}:${stamp.revision}`;
        if (this.version === version) return;
        const index = new Map<DataId, Indexed>(), children = new Map<DataId, Indexed[]>(), keys = new Map<DataId, Map<string, Indexed[]>>();
        const visit = (node: NodeJSON, path: number[], parent?: DataId) => {
            const id = path.length ? node.attrs?.id : ROOT;
            if (path.length ? !validId(id) : id !== ROOT) fail("invalid storage ID");
            if (index.has(id as string)) fail("duplicate storage ID");
            const item = freeze({id: id as string, node, path}); index.set(item.id, item);
            if (parent !== undefined && node.type === "entry") {
                const list = children.get(parent) ?? []; list.push(item); children.set(parent, list);
                const keyMap = keys.get(parent) ?? new Map<string, Indexed[]>(), key = node.attrs!.key as string;
                const candidates = keyMap.get(key) ?? []; candidates.push(item); keyMap.set(key, candidates); keys.set(parent, keyMap);
            }
            node.children?.forEach((child, at) => visit(child, [...path, at], item.id));
        };
        visit(structuredClone(this.#client.model()), []);
        let retainedKinds: Map<string, string> | undefined;
        const retainedKind = (id: string): string | undefined => {
            if (!retainedKinds) {
                retainedKinds = new Map();
                for (const line of this.#client.snapshot().lines) for (const item of line.items) {
                    if (item.z || item.k !== "n" || !["map", "list", "entry"].includes(item.b ?? "")) continue;
                    const storedId = item.a?.find(([key]) => key === "id")?.[1];
                    if (!validId(storedId)) fail("invalid storage ID");
                    if (retainedKinds.has(storedId as string)) fail("duplicate storage ID");
                    retainedKinds.set(storedId as string, item.b!);
                }
            }
            return retainedKinds.get(id);
        };
        for (const item of index.values()) if (item.node.type === "entry") {
            if (typeof item.node.attrs!.key !== "string") fail("invalid encoded map key");
            const value = item.node.attrs!.value;
            if (!value || typeof value !== "object" || Array.isArray(value)) fail("invalid encoded value");
            const encoded = value as Record<string, unknown>, fields = Object.keys(encoded);
            if (fields.length === 1 && Object.hasOwn(encoded, "scalar")) {
                const scalar = encoded.scalar;
                if (scalar !== null && typeof scalar !== "boolean" && typeof scalar !== "string" && !(typeof scalar === "number" && Number.isFinite(scalar))) fail("invalid encoded scalar");
            } else if (fields.length === 2 && Object.hasOwn(encoded, "reference") && Object.hasOwn(encoded, "kind")) {
                const target = index.get(encoded.reference as string), kind = encoded.kind;
                const targetKind = encoded.reference === ROOT ? "map" : target?.node.type ?? retainedKind(encoded.reference as string);
                if ((kind !== "map" && kind !== "list") || targetKind !== kind) fail("invalid encoded reference");
            } else fail("invalid encoded value");
        }
        for (const list of children.values()) Object.freeze(list);
        for (const keyMap of keys.values()) for (const candidates of keyMap.values()) { candidates.sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0); Object.freeze(candidates); }
        this.index = index; this.childIndex = children; this.keyIndex = keys; this.version = version;
    }
    private lookup(id: DataId) { this.refresh(); return this.index.get(id); }
    /** Internal facade operation; deleted collections reject new edits. */
    collection(id: DataId, kind: "map" | "list"): Indexed {
        const value = this.lookup(id);
        if (!value || (id === ROOT ? kind !== "map" : value.node.type !== kind)) return fail("collection is not visible");
        return value;
    }
    children(id: DataId, kind: "map" | "list"): Indexed[] {
        this.collection(id, kind); return this.childIndex.get(id) ?? [];
    }
    candidates(id: DataId, key: string): Indexed[] { this.collection(id, "map"); return this.keyIndex.get(id)?.get(key) ?? []; }
    findEntry(collection: DataId, id: DataId): Indexed | undefined {
        const parent = this.collection(collection, "list"), entry = this.lookup(id);
        return entry?.node.type === "entry" && entry.path.length === parent.path.length + 1 && parent.path.every((part, index) => entry.path[index] === part) ? entry : undefined;
    }
    private newId(): DataId { return `data:${globalThis.crypto.randomUUID()}`; }
    private create(kind: "map" | "list") {
        this.mutable(); const id = this.newId();
        // Allocation is structural and permanent. Undo cannot hide peer descendants.
        this.#client.edit([{op: "insert", at: [this.#client.model().children?.length ?? 0], content: [{type: kind, attrs: {id}, children: []}]}], null);
        return this.handle(id, kind);
    }
    private handle(id: DataId, kind: "map" | "list", retained = false) {
        // A validated reference can name a retained hidden collection. Reads can
        // return its handle; collection operations still require visibility.
        if (!retained) this.collection(id, kind);
        let handle = this.handles.get(id);
        if (handle && (handle instanceof SharedMap ? kind !== "map" : kind !== "list")) fail("reference kind mismatch");
        if (!handle) { handle = kind === "map" ? new SharedMap(this, id) : new SharedList(this, id); this.handles.set(id, handle); }
        return handle;
    }
    private encode(value: DataValue): Encoded {
        if (value instanceof SharedMap || value instanceof SharedList) {
            if (value.owner !== this) return fail("shared reference belongs to another client");
            const kind = value instanceof SharedMap ? "map" : "list"; this.collection(value.id, kind);
            return {reference: value.id, kind};
        }
        if (value === null || typeof value === "boolean" || typeof value === "string" || typeof value === "number" && Number.isFinite(value)) return {scalar: value};
        return fail("value must be a finite scalar or a shared collection");
    }
    decode(item: Indexed): DataValue {
        const value = item.node.attrs!.value as Encoded;
        if ("scalar" in value) return value.scalar;
        return this.handle(value.reference, value.kind, true);
    }
    private check(write: DataWrite) {
        this.mutable(); this.#validate(Object.freeze({...write}));
    }
    write(write: DataWrite, edits: EditOp[]) { this.check(write); this.#client.edit(edits); }
    set(map: SharedMap, key: string, value: DataValue) {
        const encoded = this.encode(value), entries = map.candidates(key), winner = entries.at(-1);
        const parent = this.collection(map.id, "map");
        this.write({collection: map.id, kind: "map", operation: "set", key, value}, winner
            ? [{op: "update", at: winner.path, attrs: {value: encoded}}]
            : [{op: "insert", at: [...parent.path, parent.node.children?.length ?? 0], content: [{type: "entry", attrs: {id: this.newId(), key, value: encoded}}]}]);
    }
    insert(list: SharedList, index: number, value: DataValue): DataId {
        const encoded = this.encode(value), children = this.children(list.id, "list");
        if (!Number.isSafeInteger(index) || index < 0 || index > children.length) return fail("invalid list index");
        const parent = this.collection(list.id, "list"), id = this.newId();
        this.write({collection: list.id, kind: "list", operation: "insert", index, id, value}, [{op: "insert", at: [...parent.path, index], content: [{type: "entry", attrs: {id, value: encoded}}]}]);
        return id;
    }
    update(list: SharedList, id: DataId, value: DataValue) {
        const encoded = this.encode(value), entry = list.entry(id);
        this.write({collection: list.id, kind: "list", operation: "set", id, value}, [{op: "update", at: entry.path, attrs: {value: encoded}}]);
    }
}

export class SharedMap {
    readonly owner: DataAccess;
    readonly id: DataId;
    constructor(owner: DataAccess, id: DataId) { this.owner = owner; this.id = id; Object.freeze(this); }
    candidates(key: string): Indexed[] {
        if (typeof key !== "string") return fail("map key must be a string");
        return this.owner.candidates(this.id, key);
    }
    get(key: string): DataValue | undefined { const value = this.candidates(key).at(-1); return value ? this.owner.decode(value) : undefined; }
    has(key: string): boolean { return this.candidates(key).length > 0; }
    set(key: string, value: DataValue): this { this.owner.mutable(); this.owner.set(this, key, value); return this; }
    delete(key: string): boolean {
        this.owner.mutable();
        const entries = this.candidates(key); if (!entries.length) return false;
        this.owner.write({collection: this.id, kind: "map", operation: "delete", key}, [...entries].sort((a, b) => b.path.at(-1)! - a.path.at(-1)!).map(item => ({op: "delete", at: item.path, count: 1})));
        return true;
    }
    entries(): Array<[string, DataValue]> {
        const keys = [...new Set(this.owner.children(this.id, "map").map(item => item.node.attrs!.key as string))].sort();
        return keys.map(key => [key, this.get(key)!]);
    }
    get size() { return this.entries().length; }
}

export class SharedList {
    readonly owner: DataAccess;
    readonly id: DataId;
    constructor(owner: DataAccess, id: DataId) { this.owner = owner; this.id = id; Object.freeze(this); }
    entry(id: DataId): Indexed { return this.owner.findEntry(this.id, id) ?? fail("list entry is not visible"); }
    entries(): Array<{id: DataId; value: DataValue}> { return this.owner.children(this.id, "list").map(item => ({id: item.id, value: this.owner.decode(item)})); }
    get length() { return this.owner.children(this.id, "list").length; }
    get(id: DataId): DataValue | undefined { const entry = this.owner.findEntry(this.id, id); return entry ? this.owner.decode(entry) : undefined; }
    at(index: number): {id: DataId; value: DataValue} | undefined { return this.entries().at(index); }
    insert(index: number, value: DataValue): DataId { this.owner.mutable(); return this.owner.insert(this, index, value); }
    push(value: DataValue): DataId { this.owner.mutable(); return this.insert(this.length, value); }
    set(id: DataId, value: DataValue): void { this.owner.mutable(); this.owner.update(this, id, value); }
    delete(id: DataId): boolean {
        this.owner.mutable();
        const entry = this.owner.findEntry(this.id, id); if (!entry) return false;
        this.owner.write({collection: this.id, kind: "list", operation: "delete", id}, [{op: "delete", at: entry.path, count: 1}]); return true;
    }
    /** index is the position in the resulting list, after removal. */
    move(id: DataId, index: number): void {
        this.owner.mutable();
        const entry = this.entry(id), parent = this.owner.collection(this.id, "list");
        if (!Number.isSafeInteger(index) || index < 0 || index >= this.length) return fail("invalid list index");
        this.owner.write({collection: this.id, kind: "list", operation: "move", id, index}, [{op: "move", from: entry.path, at: [...parent.path, index]}]);
    }
}

/** Internal attachment. The schema check does not modify the Client. */
export function createDataAccess(client: Client, validate: DataValidator, assertMutable: () => void): SharedData {
    assertDataSchema(client);
    return new DataAccess(client, validate, assertMutable);
}

const dataSchemaVersion = schemaVersion(createDataSchema());
const checkedSchemas = new WeakSet<object>();
/** Recheck schema transitions for both cached access and retained handles. */
export function assertDataSchema(client: Client): void {
    const schema = client.schema;
    if (checkedSchemas.has(schema)) return;
    if (schemaVersion(schema) !== dataSchemaVersion) fail("client.data requires createDataSchema()");
    // Engine schemas are deeply frozen. A mutable external schema must be checked again.
    const deeplyFrozen = (value: unknown): boolean => !value || typeof value !== "object" ||
        Object.isFrozen(value) && Object.values(value).every(deeplyFrozen);
    if (deeplyFrozen(schema)) checkedSchemas.add(schema);
}
