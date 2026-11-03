import {createSpreadsheetSchema, spreadsheetSchemaVersion, validateSpreadsheetFieldValue} from "./schema.ts";
import type {SpreadsheetSchema} from "./schema.ts";
import {Clock, compareTicket, keyOf} from "../crdt/ticket.ts";
import type {Ticket} from "../crdt/ticket.ts";

const PLAIN_RECORD_PROTOTYPES = Object.freeze([Object.prototype, null]);

const SCHEMA_SHEET_OPTION_FIELDS = Object.freeze(["actor", "sheetId", "rows", "columns", "schema"]);
const SHEET_OPTION_FIELDS = Object.freeze(["actor", "sheetId", "rows", "columns"]);
const SCHEMA_CELL_OPERATION_FIELDS = Object.freeze(["at", "sheetId", "row", "column", "field", "value", "schemaVersion"]);
const CELL_OPERATION_FIELDS = Object.freeze(["at", "sheetId", "row", "column", "field", "value"]);
const CELL_TICKET_FIELDS = Object.freeze(["lamport", "actor"]);
const SCHEMA_SHEET_STATE_FIELDS = Object.freeze(["format", "schemaVersion", "options", "journal", "checkpoint"]);
const SHEET_STATE_FIELDS = Object.freeze(["format", "options", "journal", "checkpoint"]);
const CELL_JOURNAL_FIELDS = Object.freeze(["type", "row", "column", "patch", "ops"]);
const HISTORY_JOURNAL_FIELDS = Object.freeze(["type", "ops"]);

const UNSAFE_PROPERTY_NAMES = Object.freeze(["__proto__", "prototype", "constructor"]);
const SHEET_QUERY_FIELDS = Object.freeze(["row", "column", "rowCount", "columnCount", "limit"]);


export interface SparseSheetOptions {actor: string; sheetId: string; rows: number; columns: number; schema?: SpreadsheetSchema}
/** Custom schemas can reuse any field name with their declared scalar type.
 * Runtime validation enforces the schema, including legacy field types.
 */
export type SparseCellPatch = Record<string, string | number | boolean | null | undefined>;
export type SparseCell = Record<string, string | number | boolean | undefined>;
export type SparseField = string;
export interface SparseSheetOp {
    schemaVersion?: string;
    at: Ticket; sheetId: string; row: number; column: number; field: SparseField;
    value: string | number | boolean | null;
}
export interface SparseRange {row: number; column: number; rowCount: number; columnCount: number; limit?: number}
export interface SparseRangeEntry {row: number; column: number; cell: SparseCell}
type Register = {at: Ticket; value: SparseSheetOp["value"]};
type StateRef = {at: Ticket | null; value: SparseSheetOp["value"]};
type HistoryTarget = {row: number; column: number; field: SparseField; before: StateRef; after: StateRef; undone: boolean};
type JournalEntry =
    | {type: "set"; row: number; column: number; patch: SparseCellPatch; ops: SparseSheetOp[]}
    | {type: "receive"; ops: SparseSheetOp[]}
    | {type: "undo" | "redo"; ops: SparseSheetOp[]}
    | {type: "acknowledge"; ops: SparseSheetOp[]};
export interface SparseSheetState {
    format: "doc-sync-sparse-sheet-experiment-v1" | "doc-sync-sparse-sheet-experiment-v2";
    schemaVersion?: string;
    options: SparseSheetOptions;
    journal: JournalEntry[];
    checkpoint: {
        clock: number;
        registers: Array<[string, Register]>;
        retainedOps: SparseSheetOp[];
        pending: SparseSheetOp[];
        undo: HistoryTarget[][];
        redo: HistoryTarget[][];
    };
}

const fields = ["value", "formula", "fill", "bold", "numberFormat"] as const;
const FORMAT = "doc-sync-sparse-sheet-experiment-v1" as const;
const SNAPSHOT_FORMATS: readonly string[] = Object.freeze([FORMAT, "doc-sync-sparse-sheet-experiment-v2"]);
const copy = <T>(value: T): T => structuredClone(value);
function fail(message: string): never { throw new Error(`Sparse sheet: ${message}`); }
const integer = (value: unknown, min = 0): value is number => Number.isSafeInteger(value) && (value as number) >= min;
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value) &&
    PLAIN_RECORD_PROTOTYPES.includes(Object.getPrototypeOf(value));
const exactKeys = (value: Record<string, unknown>, names: readonly string[]): boolean => {
    const keys = Object.keys(value);
    return keys.length === names.length && keys.every(key => names.includes(key));
};
// Inspect descriptors before reading user data. This also rejects cycles and nonfinite values.
const safeJson = (value: unknown, active = new Set<object>(), depth = 0): boolean => {
    if (value === null || typeof value === "string" || typeof value === "boolean") return true;
    if (typeof value === "number") return Number.isFinite(value);
    if (depth > 100 || typeof value !== "object" || !value || active.has(value)) return false;
    if (Array.isArray(value) ? Object.getPrototypeOf(value) !== Array.prototype : !record(value)) return false;
    active.add(value);
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const keys = Reflect.ownKeys(value);
    const ok = keys.every(key => {
        if (Array.isArray(value) && key === "length") return true;
        if (typeof key !== "string" || UNSAFE_PROPERTY_NAMES.includes(key)) return false;
        const descriptor = descriptors[key];
        return !!descriptor && descriptor.enumerable && "value" in descriptor && safeJson(descriptor.value, active, depth + 1);
    }) && (!Array.isArray(value) || keys.length === value.length + 1 && Array.from({length: value.length}, (_, at) => String(at)).every(key => Object.hasOwn(descriptors, key)));
    active.delete(value);
    return ok;
};
const canonical = (value: unknown): string => {
    if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
    if (record(value)) return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
    return JSON.stringify(value);
};
const equal = (a: unknown, b: unknown) => canonical(a) === canonical(b);
const slotKey = (sheetId: string, row: number, column: number, field: SparseField) => JSON.stringify([sheetId, row, column, field]);
const sameStamp = (a: Ticket | null | undefined, b: Ticket | null | undefined) => !!a && !!b && compareTicket(a, b) === 0;
const validValue = (field: SparseField, value: unknown): boolean => value === null ||
    (field === "value" ? typeof value === "string" || typeof value === "boolean" || typeof value === "number" && Number.isFinite(value)
        : field === "bold" ? typeof value === "boolean" : typeof value === "string");

/** Public experimental fixed-axis sheet. Client/DocHub integration, transport, formula evaluation, and GC are unsupported. */
export class SparseSheet {
    private options: SparseSheetOptions;
    private fieldNames: readonly string[];
    private schemaIdentity?: string;
    private clock: Clock;
    private registers = new Map<string, Register>();
    private ledger = new Map<string, SparseSheetOp>();
    private pending: SparseSheetOp[] = [];
    private undoStack: HistoryTarget[][] = [];
    private redoStack: HistoryTarget[][] = [];
    private linked = new Map<string, StateRef>();
    private journal: JournalEntry[] = [];

    constructor(options: SparseSheetOptions) {
        if (!safeJson(options) || !record(options) || !exactKeys(options, Object.hasOwn(options, "schema") ? SCHEMA_SHEET_OPTION_FIELDS : SHEET_OPTION_FIELDS) ||
            typeof options.actor !== "string" || !/^[\w~-]{1,128}$/.test(options.actor) || options.actor === "~root" ||
            typeof options.sheetId !== "string" || !options.sheetId.length || options.sheetId.length > 256 ||
            !integer(options.rows, 1) || !integer(options.columns, 1)) fail("invalid options");
        this.options = copy(options);
        if (Object.hasOwn(options, "schema")) {
            this.options.schema = createSpreadsheetSchema(options.schema!);
            this.schemaIdentity = spreadsheetSchemaVersion(this.options.schema);
        }
        this.fieldNames = this.options.schema ? Object.keys(this.options.schema.fields).sort() : fields;
        this.clock = new Clock(options.actor);
    }

    private valid(field: string, value: unknown): boolean {
        return this.options.schema ? validateSpreadsheetFieldValue(this.options.schema, field, value) : this.fieldNames.includes(field) && validValue(field, value);
    }
    private binding() { return this.schemaIdentity ? {schemaVersion: this.schemaIdentity} : {}; }
    private coordinate(row: unknown, column: unknown): void {
        if (!integer(row) || !integer(column) || row >= this.options.rows || column >= this.options.columns) fail("coordinate outside extent");
    }
    private key(row: number, column: number, field: SparseField) { return slotKey(this.options.sheetId, row, column, field); }
    private validateOp(value: unknown): asserts value is SparseSheetOp {
        if (!record(value) || !exactKeys(value, this.schemaIdentity ? SCHEMA_CELL_OPERATION_FIELDS : CELL_OPERATION_FIELDS) ||
            value.schemaVersion !== this.schemaIdentity ||
            !record(value.at) || !exactKeys(value.at, CELL_TICKET_FIELDS) || !integer(value.at.lamport, 1) ||
            typeof value.at.actor !== "string" || !/^[\w~-]{1,128}$/.test(value.at.actor) || value.at.actor === "~root" || value.sheetId !== this.options.sheetId ||
            typeof value.field !== "string" || !this.valid(value.field, value.value)) fail("invalid operation");
        this.coordinate(value.row, value.column);
    }
    private apply(ops: readonly SparseSheetOp[]) {
        for (const op of ops) {
            const id = keyOf(op.at);
            if (this.ledger.has(id)) continue;
            this.ledger.set(id, copy(op)); this.clock.observe(op.at);
            const key = this.key(op.row, op.column, op.field), current = this.registers.get(key);
            if (!current || compareTicket(op.at, current.at) > 0) this.registers.set(key, {at: copy(op.at), value: op.value});
        }
    }

    setCell(row: number, column: number, patch: SparseCellPatch): SparseSheetOp[] {
        this.coordinate(row, column);
        if (!safeJson(patch) || !record(patch) || Object.entries(patch).some(([field, value]) => !this.valid(field, value))) fail("invalid cell patch");
        const entries = this.fieldNames.filter(field => Object.hasOwn(patch, field)).map(field => [field, patch[field] as SparseSheetOp["value"]] as const);
        if (!entries.length) return [];
        if (this.clock.lamport > Number.MAX_SAFE_INTEGER - entries.length) fail("Lamport clock exhausted");
        const ops: SparseSheetOp[] = [], targets: HistoryTarget[] = [];
        for (const [field, value] of entries) {
            const key = this.key(row, column, field), current = this.registers.get(key), linked = this.linked.get(key);
            const before = linked && sameStamp(linked.at, current?.at) ? linked : {at: current?.at ? copy(current.at) : null, value: current?.value ?? null};
            const at = this.clock.next(), after = {at: copy(at), value};
            targets.push({row, column, field, before, after, undone: false});
            ops.push({...this.binding(), at, sheetId: this.options.sheetId, row, column, field, value});
            this.linked.set(key, after);
        }
        this.apply(ops); this.pending.push(...copy(ops)); this.undoStack.push(targets); this.redoStack = [];
        this.journal.push({type: "set", row, column, patch: copy(patch), ops: copy(ops)});
        return copy(ops);
    }

    receive(ops: readonly SparseSheetOp[]): void {
        if (!safeJson(ops) || !Array.isArray(ops)) fail("operations must be a plain JSON array");
        const staged = new Map<string, SparseSheetOp>(), fresh: SparseSheetOp[] = [];
        for (const op of ops) {
            this.validateOp(op);
            const id = keyOf(op.at), known = staged.get(id) ?? this.ledger.get(id);
            if (known && !equal(known, op)) fail("conflicting operation identity");
            if (!known) {
                if (op.at.actor === this.options.actor) fail("unseen operation from this actor; actor forks are unsupported");
                staged.set(id, op); fresh.push(copy(op));
            }
        }
        if (!fresh.length) return;
        this.apply(fresh); this.journal.push({type: "receive", ops: fresh});
    }

    getCell(row: number, column: number): SparseCell {
        this.coordinate(row, column);
        const cell: SparseCell = {};
        for (const field of this.fieldNames) {
            const current = this.registers.get(this.key(row, column, field));
            if (current && current.value !== null) Object.assign(cell, {[field]: current.value});
        }
        return cell;
    }
    getCellValue(row: number, column: number, field: string): string | number | boolean | null {
        this.coordinate(row, column);
        if (!this.fieldNames.includes(field)) fail("unknown field");
        return this.registers.get(this.key(row, column, field))?.value ?? this.options.schema?.fields[field].default ?? null;
    }
    getRange(range: SparseRange): SparseRangeEntry[] {
        if (!safeJson(range) || !record(range) || Object.keys(range).some(key => !SHEET_QUERY_FIELDS.includes(key)) ||
            !integer(range.rowCount) || !integer(range.columnCount) || !integer(range.row) || !integer(range.column) ||
            range.row > this.options.rows || range.column > this.options.columns ||
            range.rowCount > this.options.rows - range.row || range.columnCount > this.options.columns - range.column ||
            !integer(range.limit ?? 10_000)) fail("invalid range");
        const limit = range.limit ?? 10_000, found = new Map<string, SparseRangeEntry>();
        for (const [key, register] of this.registers) {
            if (register.value === null) continue;
            const [, row, column, field] = JSON.parse(key) as [string, number, number, SparseField];
            if (row < range.row || row >= range.row + range.rowCount || column < range.column || column >= range.column + range.columnCount) continue;
            const cellKey = JSON.stringify([row, column]);
            let entry = found.get(cellKey);
            if (!entry) {
                if (found.size >= limit) fail("range result limit exceeded");
                entry = {row, column, cell: {}}; found.set(cellKey, entry);
            }
            Object.assign(entry.cell, {[field]: register.value});
        }
        return [...found.values()].sort((a, b) => a.row - b.row || a.column - b.column);
    }

    private history(undo: boolean): SparseSheetOp[] {
        const source = undo ? this.undoStack : this.redoStack, destination = undo ? this.redoStack : this.undoStack;
        const entry = source.at(-1);
        if (!entry) return [];
        const targets = entry.filter(target => {
            const current = this.registers.get(this.key(target.row, target.column, target.field));
            return target.undone !== undo && sameStamp(current?.at, (undo ? target.after : target.before).at);
        });
        if (this.clock.lamport > Number.MAX_SAFE_INTEGER - targets.length) fail("Lamport clock exhausted");
        const ops = targets.map(target => {
            const state = undo ? target.before : target.after, at = this.clock.next();
            state.at = copy(at); target.undone = undo;
            this.linked.set(this.key(target.row, target.column, target.field), state);
            return {...this.binding(), at, sheetId: this.options.sheetId, row: target.row, column: target.column, field: target.field, value: state.value};
        });
        this.apply(ops); this.pending.push(...copy(ops)); source.pop(); destination.push(entry);
        this.journal.push({type: undo ? "undo" : "redo", ops: copy(ops)});
        return copy(ops);
    }
    undo(): SparseSheetOp[] { return this.history(true); }
    redo(): SparseSheetOp[] { return this.history(false); }
    pendingChanges(): SparseSheetOp[] { return copy(this.pending); }
    acknowledge(ops: readonly SparseSheetOp[]): void {
        if (!safeJson(ops) || !Array.isArray(ops) || ops.length > this.pending.length || !ops.every((op, index) => equal(op, this.pending[index]))) fail("acknowledgement must match the exact pending prefix");
        if (!ops.length) return;
        this.pending.splice(0, ops.length); this.journal.push({type: "acknowledge", ops: copy([...ops])});
    }
    stats() { return {registers: this.registers.size, retainedOps: this.ledger.size, pending: this.pending.length, undo: this.undoStack.length, redo: this.redoStack.length, clock: this.clock.lamport}; }

    captureState(): SparseSheetState {
        return copy({...this.binding(), format: this.schemaIdentity ? "doc-sync-sparse-sheet-experiment-v2" : FORMAT, options: this.options, journal: this.journal, checkpoint: {
            clock: this.clock.lamport, registers: [...this.registers].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0),
            retainedOps: [...this.ledger.values()], pending: this.pending, undo: this.undoStack, redo: this.redoStack,
        }});
    }
    static fromState(state: unknown): SparseSheet {
        if (!safeJson(state) || !record(state) || !exactKeys(state, state.format === "doc-sync-sparse-sheet-experiment-v2" ? SCHEMA_SHEET_STATE_FIELDS : SHEET_STATE_FIELDS) || !SNAPSHOT_FORMATS.includes(state.format as string) || !Array.isArray(state.journal)) fail("invalid snapshot");
        const sheet = new SparseSheet(state.options as unknown as SparseSheetOptions);
        if (state.schemaVersion !== sheet.schemaIdentity || (state.format === FORMAT) !== !sheet.schemaIdentity) fail("snapshot schema differs");
        for (const entry of state.journal) {
            if (!record(entry) || typeof entry.type !== "string") fail("invalid snapshot journal entry");
            if (entry.type === "set") {
                if (!exactKeys(entry, CELL_JOURNAL_FIELDS)) fail("invalid set journal entry");
                const ops = sheet.setCell(entry.row as number, entry.column as number, entry.patch as SparseCellPatch);
                if (!equal(ops, entry.ops) || !ops.length) fail("invalid generated set operations");
            } else if (entry.type === "receive") {
                if (!exactKeys(entry, HISTORY_JOURNAL_FIELDS)) fail("invalid receive journal entry");
                const count = sheet.journal.length; sheet.receive(entry.ops as SparseSheetOp[]);
                if (sheet.journal.length === count || !equal(sheet.journal.at(-1), entry)) fail("invalid receive replay");
            } else if (entry.type === "undo" || entry.type === "redo") {
                if (!exactKeys(entry, HISTORY_JOURNAL_FIELDS)) fail("invalid history journal entry");
                const count = sheet.journal.length, ops = sheet[entry.type]();
                if (sheet.journal.length === count || !equal(ops, entry.ops)) fail("invalid history replay");
            } else if (entry.type === "acknowledge") {
                if (!exactKeys(entry, HISTORY_JOURNAL_FIELDS)) fail("invalid acknowledgement journal entry");
                const count = sheet.journal.length; sheet.acknowledge(entry.ops as SparseSheetOp[]);
                if (sheet.journal.length === count) fail("empty acknowledgement journal entry");
            } else fail("unknown snapshot journal entry");
        }
        if (!equal(sheet.captureState(), state)) fail("snapshot checkpoint does not match replayed state");
        return sheet;
    }
    restoreState(state: unknown): void {
        const next = SparseSheet.fromState(state);
        if (!equal(next.options, this.options)) fail("snapshot actor, sheet, or extent differs");
        this.clock = next.clock; this.registers = next.registers; this.ledger = next.ledger; this.pending = next.pending;
        this.undoStack = next.undoStack; this.redoStack = next.redoStack; this.linked = next.linked; this.journal = next.journal;
    }
}
