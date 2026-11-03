import {createSpreadsheetSchema, spreadsheetSchemaVersion, validateSpreadsheetFieldValue} from "./schema.ts";
import {Clock, compareTicket, keyOf, ticketOf} from "../crdt/ticket.ts";
import type {Ticket} from "../crdt/ticket.ts";
import {IntervalAxis, axisSource} from "./axis.ts";
import type {AxisId, AxisAction} from "./axis.ts";
import {SparseSheet} from "./sheet.ts";
import type {SparseSheetOptions, SparseCell, SparseCellPatch, SparseField, SparseRange, SparseRangeEntry} from "./sheet.ts";

const PLAIN_RECORD_PROTOTYPES = Object.freeze([Object.prototype, null]);

const AXIS_ID_FIELDS = Object.freeze(["source", "offset"]);
const STRUCTURAL_TICKET_FIELDS = Object.freeze(["lamport", "actor"]);
const SCHEMA_VERSION_FIELDS = Object.freeze(["schemaVersion"]);
const INSERT_AXIS_FIELDS = Object.freeze(["before", "count"]);
const VISIBILITY_AXIS_FIELDS = Object.freeze(["targets", "visible"]);
const MOVE_AXIS_FIELDS = Object.freeze(["targets", "before"]);
const TOGGLE_AXIS_FIELDS = Object.freeze(["target", "active"]);
const SCHEMA_SHEET_STATE_FIELDS = Object.freeze(["format", "schemaVersion", "options", "journal", "checkpoint"]);
const SHEET_STATE_FIELDS = Object.freeze(["format", "options", "journal", "checkpoint"]);
const CELL_JOURNAL_FIELDS = Object.freeze(["type", "row", "column", "patch", "ops"]);
const AXIS_JOURNAL_FIELDS = Object.freeze(["type", "method", "args", "ops"]);
const HISTORY_JOURNAL_FIELDS = Object.freeze(["type", "ops"]);

const UNSAFE_PROPERTY_NAMES = Object.freeze(["__proto__", "prototype", "constructor"]);
const SHEET_QUERY_FIELDS = Object.freeze(["row", "column", "rowCount", "columnCount", "limit"]);
const STRUCTURAL_AXIS_OPERATIONS = Object.freeze(["insertRows", "insertColumns", "deleteRows", "deleteColumns", "moveRows", "moveColumns"]);


export type StructuralSheetOptions = SparseSheetOptions;
export interface StructuralCellOp {kind: "cell"; at: Ticket; sheetId: string; schemaVersion?: string; row: AxisId; column: AxisId; field: string; value: string | number | boolean | null}
export type StructuralAxisOp = AxisAction & {axis: "row" | "column"; sheetId: string; schemaVersion?: string};
export type StructuralSheetOp = StructuralCellOp | StructuralAxisOp;
type SourceRef = {axis: "row" | "column"; source: string; offset: number; toggle?: boolean};
type Register = {at: Ticket; value: StructuralCellOp["value"]};
type StateRef = {at: Ticket | null; value: StructuralCellOp["value"]};
type CellTarget = {row: AxisId; column: AxisId; field: string; before: StateRef; after: StateRef; undone: boolean};
type HistoryEntry = {type: "cell"; targets: CellTarget[]} | {type: "axis"; axis: "row" | "column"; target: Ticket; undone: boolean};
type AxisMethod = "insertRows" | "insertColumns" | "deleteRows" | "deleteColumns" | "moveRows" | "moveColumns";
type JournalEntry = {type: "set"; row: AxisId; column: AxisId; patch: SparseCellPatch; ops: StructuralSheetOp[]} |
    {type: "axis"; method: AxisMethod; args: number[]; ops: StructuralSheetOp[]} |
    {type: "receive" | "undo" | "redo" | "acknowledge"; ops: StructuralSheetOp[]};
export interface StructuralSheetState {format: "doc-sync-structural-sheet-v1"; schemaVersion?: string; options: StructuralSheetOptions; journal: JournalEntry[]; checkpoint: {
    clock: number; rows: AxisAction[]; columns: AxisAction[]; registers: Array<[string, Register]>; retainedOps: StructuralSheetOp[]; pending: StructuralSheetOp[]; undo: HistoryEntry[]; redo: HistoryEntry[];
}}

const fields = ["value", "formula", "fill", "bold", "numberFormat"] as const;
const FORMAT = "doc-sync-structural-sheet-v1" as const;
const copy = <T>(value: T): T => structuredClone(value);
function fail(message: string): never { throw new Error(`Structural sheet: ${message}`); }
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
const slotKey = (sheetId: string, row: AxisId, column: AxisId, field: SparseField) => canonical([sheetId, row, column, field]);
const sameStamp = (a: Ticket | null | undefined, b: Ticket | null | undefined) => !!a && !!b && compareTicket(a, b) === 0;
const validValue = (field: SparseField, value: unknown): boolean => value === null ||
    (field === "value" ? typeof value === "string" || typeof value === "boolean" || typeof value === "number" && Number.isFinite(value)
        : field === "bold" ? typeof value === "boolean" : typeof value === "string");

const validId = (id: unknown): id is AxisId => record(id) && exactKeys(id, AXIS_ID_FIELDS) && typeof id.source === "string" &&
    (id.source === "initial" || /^[1-9]\d*@[\w~-]{1,128}$/.test(id.source) && Number.isSafeInteger(Number(id.source.split("@")[0]))) && integer(id.offset);

/** Stable-axis standalone sheet. Hidden cell registers remain available through getCellById. */
export class StructuralSheet {
    private options: StructuralSheetOptions;
    private fieldNames: readonly string[];
    private schemaIdentity?: string;
    private clock: Clock;
    private rowAxis: IntervalAxis;
    private columnAxis: IntervalAxis;
    private registers = new Map<string, Register>();
    private ledger = new Map<string, StructuralSheetOp>();
    private pending: StructuralSheetOp[] = [];
    private references = new Map<string, SourceRef[]>();
    private undoStack: HistoryEntry[] = [];
    private redoStack: HistoryEntry[] = [];
    private linked = new Map<string, StateRef>();
    private journal: JournalEntry[] = [];

    constructor(options: StructuralSheetOptions) {
        // Share the established S1 options and schema boundary without generating operations.
        new SparseSheet(options);
        this.options = copy(options);
        if (options.schema) {
            this.options.schema = createSpreadsheetSchema(options.schema);
            this.schemaIdentity = spreadsheetSchemaVersion(this.options.schema);
        }
        this.fieldNames = this.options.schema ? Object.keys(this.options.schema.fields).sort() : fields;
        this.clock = new Clock(options.actor);
        this.rowAxis = new IntervalAxis(options.rows); this.columnAxis = new IntervalAxis(options.columns);
    }
    get rows(): number { return this.rowAxis.length; }
    get columns(): number { return this.columnAxis.length; }
    rowIdAt(index: number): AxisId { return this.rowAxis.idAt(index); }
    columnIdAt(index: number): AxisId { return this.columnAxis.idAt(index); }
    rowIndexOf(id: AxisId): number { if (!safeJson(id) || !validId(id)) fail("invalid row ID"); return this.rowAxis.indexOf(id); }
    columnIndexOf(id: AxisId): number { if (!safeJson(id) || !validId(id)) fail("invalid column ID"); return this.columnAxis.indexOf(id); }
    private binding() { return this.schemaIdentity ? {schemaVersion: this.schemaIdentity} : {}; }
    private valid(field: string, value: unknown): boolean { return this.options.schema ? validateSpreadsheetFieldValue(this.options.schema, field, value) : this.fieldNames.includes(field) && validValue(field, value); }
    private key(row: AxisId, column: AxisId, field: string): string { return slotKey(this.options.sheetId, row, column, field); }
    private checkIds(row: AxisId, column: AxisId, visible = false): void {
        if (!safeJson([row, column]) || !validId(row) || !validId(column) || !this.rowAxis.has(row) || !this.columnAxis.has(column) ||
            visible && (this.rowAxis.indexOf(row) < 0 || this.columnAxis.indexOf(column) < 0)) fail("cell ID outside extent or hidden");
    }
    private action(op: StructuralAxisOp): AxisAction { const {axis: _axis, sheetId: _sheet, schemaVersion: _version, ...action} = op; return action as AxisAction; }
    private validateOp(op: unknown): asserts op is StructuralSheetOp {
        if (!record(op) || op.schemaVersion !== this.schemaIdentity || op.sheetId !== this.options.sheetId || !record(op.at) ||
            !exactKeys(op.at, STRUCTURAL_TICKET_FIELDS) || !integer(op.at.lamport, 1) || typeof op.at.actor !== "string" ||
            !/^[\w~-]{1,128}$/.test(op.at.actor) || op.at.actor === "~root") fail("invalid operation");
        const common = ["kind", "at", "sheetId", ...(this.schemaIdentity ? SCHEMA_VERSION_FIELDS : [])];
        if (op.kind === "cell") {
            if (!exactKeys(op, [...common, "row", "column", "field", "value"]) || !validId(op.row) || !validId(op.column) || typeof op.field !== "string" || !this.valid(op.field, op.value)) fail("invalid cell operation");
            for (const id of [op.row, op.column]) if (id.source !== "initial" && (ticketOf(id.source).actor === "~root" || ticketOf(id.source).lamport >= (op.at.lamport as number))) fail("cell references must precede the operation");
            return;
        }
        if (op.axis !== "row" && op.axis !== "column") fail("invalid axis");
        const names = op.kind === "insert" ? INSERT_AXIS_FIELDS : op.kind === "visibility" ? VISIBILITY_AXIS_FIELDS : op.kind === "move" ? MOVE_AXIS_FIELDS : op.kind === "toggle" ? TOGGLE_AXIS_FIELDS : null;
        if (!names || !exactKeys(op, [...common, "axis", ...names])) fail("invalid axis operation");
    }
    private prepare(ops: readonly StructuralSheetOp[], requireKnownReferences = false): {row: IntervalAxis; column: IntervalAxis} {
        const structural = ops.some(op => op.kind !== "cell");
        const all = structural ? [...this.ledger.values(), ...ops] : ops;
        let row = this.rowAxis, column = this.columnAxis;
        if (structural) {
            row = new IntervalAxis(this.options.rows); column = new IntervalAxis(this.options.columns);
            for (const [dimension, axis] of [["row", row], ["column", column]] as const) {
                const actions = all.filter((op): op is StructuralAxisOp => op.kind !== "cell" && op.axis === dimension).map(op => this.action(op));
                for (let start = 0; start < actions.length; start += 10_000) axis.apply(actions.slice(start, start + 10_000));
            }
        }
        const staged = new Map(ops.map(op => [keyOf(op.at), op]));
        const validate = (ref: SourceRef) => {
            if (ref.source === "initial") {
                if (ref.offset >= (ref.axis === "row" ? this.options.rows : this.options.columns)) fail("reference outside initial extent");
                return;
            }
            const known = staged.get(ref.source) ?? this.ledger.get(ref.source);
            if (!known) { if (requireKnownReferences) fail("unknown source reference"); return; }
            if (ref.toggle) {
                if (known.kind === "cell" || known.kind === "toggle" || known.axis !== ref.axis) fail("invalid structural history target");
            } else if (known.kind !== "insert" || known.axis !== ref.axis || ref.offset >= known.count) fail("reference outside source extent or axis");
        };
        for (const op of ops) {
            for (const ref of this.sourceRefs(op)) validate(ref);
            for (const ref of this.references.get(keyOf(op.at)) ?? []) validate(ref);
        }
        return {row, column};
    }
    private sourceRefs(op: StructuralSheetOp): SourceRef[] {
        if (op.kind === "cell") return [{axis: "row", ...op.row}, {axis: "column", ...op.column}];
        const refs: SourceRef[] = [];
        if (op.kind === "toggle") refs.push({axis: op.axis, source: keyOf(op.target), offset: 0, toggle: true});
        if ((op.kind === "insert" || op.kind === "move") && op.before) refs.push({axis: op.axis, ...op.before});
        if (op.kind === "move" || op.kind === "visibility") for (const span of op.targets) refs.push({axis: op.axis, source: span.source, offset: span.start + span.count - 1});
        return refs;
    }
    private apply(ops: readonly StructuralSheetOp[], axes = this.prepare(ops)): void {
        this.rowAxis = axes.row; this.columnAxis = axes.column;
        for (const op of ops) {
            if (this.ledger.has(keyOf(op.at))) continue;
            this.ledger.set(keyOf(op.at), copy(op)); this.clock.observe(op.at);
            for (const ref of this.sourceRefs(op)) if (ref.source !== "initial") {
                const refs = this.references.get(ref.source) ?? []; refs.push(ref); this.references.set(ref.source, refs);
            }
            if (op.kind === "cell") {
                const key = this.key(op.row, op.column, op.field), current = this.registers.get(key);
                if (!current || compareTicket(op.at, current.at) > 0) this.registers.set(key, {at: copy(op.at), value: op.value});
            }
        }
    }
    private reserve(count: number): void { if (this.clock.lamport > Number.MAX_SAFE_INTEGER - count) fail("Lamport clock exhausted"); }
    setCell(row: number, column: number, patch: SparseCellPatch): StructuralSheetOp[] { return this.setCellById(this.rowIdAt(row), this.columnIdAt(column), patch); }
    setCellById(row: AxisId, column: AxisId, patch: SparseCellPatch): StructuralSheetOp[] {
        this.checkIds(row, column, true);
        if (!safeJson(patch) || !record(patch) || Object.entries(patch).some(([field, value]) => !this.valid(field, value))) fail("invalid cell patch");
        const entries = this.fieldNames.filter(field => Object.hasOwn(patch, field));
        if (!entries.length) return [];
        this.reserve(entries.length);
        const targets: CellTarget[] = [], ops: StructuralCellOp[] = [];
        for (const field of entries) {
            const key = this.key(row, column, field), current = this.registers.get(key), linked = this.linked.get(key);
            const before = linked && sameStamp(linked.at, current?.at) ? linked : {at: current?.at ? copy(current.at) : null, value: current?.value ?? null};
            const at = this.clock.next(), value = patch[field] as StructuralCellOp["value"], after = {at: copy(at), value};
            targets.push({row: copy(row), column: copy(column), field, before, after, undone: false});
            ops.push({...this.binding(), kind: "cell", at, sheetId: this.options.sheetId, row: copy(row), column: copy(column), field, value});
            this.linked.set(key, after);
        }
        this.apply(ops); this.pending.push(...copy(ops)); this.undoStack.push({type: "cell", targets}); this.redoStack = [];
        this.journal.push({type: "set", row: copy(row), column: copy(column), patch: copy(patch), ops: copy(ops)});
        return copy(ops);
    }
    getCell(row: number, column: number): SparseCell { return this.getCellById(this.rowIdAt(row), this.columnIdAt(column)); }
    /** Reads retained fields even when the row or column is hidden. Unknown IDs are rejected. */
    getCellById(row: AxisId, column: AxisId): SparseCell {
        this.checkIds(row, column);
        const cell: SparseCell = {};
        for (const field of this.fieldNames) { const value = this.registers.get(this.key(row, column, field))?.value; if (value !== null && value !== undefined) Object.assign(cell, {[field]: value}); }
        return cell;
    }
    getCellValue(row: number, column: number, field: string): string | number | boolean | null {
        const rowId = this.rowIdAt(row), columnId = this.columnIdAt(column);
        if (!this.fieldNames.includes(field)) fail("unknown field");
        return this.registers.get(this.key(rowId, columnId, field))?.value ?? this.options.schema?.fields[field].default ?? null;
    }
    getRange(range: SparseRange): SparseRangeEntry[] {
        if (!safeJson(range) || !record(range) || Object.keys(range).some(key => !SHEET_QUERY_FIELDS.includes(key)) ||
            !integer(range.rowCount) || !integer(range.columnCount) || !integer(range.row) || !integer(range.column) || range.row > this.rows || range.column > this.columns ||
            range.rowCount > this.rows - range.row || range.columnCount > this.columns - range.column || !integer(range.limit ?? 10_000)) fail("invalid range");
        const found = new Map<string, SparseRangeEntry>();
        for (const [key, register] of this.registers) {
            if (register.value === null) continue;
            const [, rowId, columnId, field] = JSON.parse(key) as [string, AxisId, AxisId, string];
            const row = this.rowIndexOf(rowId), column = this.columnIndexOf(columnId);
            if (row < range.row || row >= range.row + range.rowCount || column < range.column || column >= range.column + range.columnCount) continue;
            const cellKey = JSON.stringify([row, column]); let entry = found.get(cellKey);
            if (!entry) { if (found.size >= (range.limit ?? 10_000)) fail("range result limit exceeded"); entry = {row, column, cell: {}}; found.set(cellKey, entry); }
            Object.assign(entry.cell, {[field]: register.value});
        }
        return [...found.values()].sort((a, b) => a.row - b.row || a.column - b.column);
    }
    private axisEdit(method: AxisMethod, index: number, count: number, destination?: number): StructuralSheetOp[] {
        const dimension = method.endsWith("Rows") ? "row" : "column", axis = dimension === "row" ? this.rowAxis : this.columnAxis;
        const insert = method.startsWith("insert"), move = method.startsWith("move");
        if (!integer(index) || index > axis.length || !integer(count) || !insert && count > axis.length - index || insert && count > Number.MAX_SAFE_INTEGER - axis.length ||
            move && (!integer(destination) || destination > axis.length - count)) fail("invalid axis range");
        if (!count || move && destination === index) return [];
        this.reserve(1);
        const at = {lamport: this.clock.lamport + 1, actor: this.options.actor};
        const action: AxisAction = insert ? {kind: "insert", at, before: index === axis.length ? null : axis.idAt(index), count} :
            move ? {kind: "move", at, targets: axis.spans(index, count), before: destination === axis.length - count ? null : axis.idAt(destination! < index ? destination! : destination! + count)} :
            {kind: "visibility", at, targets: axis.spans(index, count), visible: false};
        const op: StructuralAxisOp = {...this.binding(), ...action, axis: dimension, sheetId: this.options.sheetId};
        const axes = this.prepare([op]); this.clock.next(); this.apply([op], axes); this.pending.push(copy(op));
        this.undoStack.push({type: "axis", axis: dimension, target: copy(at), undone: false}); this.redoStack = [];
        this.journal.push({type: "axis", method, args: destination === undefined ? [index, count] : [index, count, destination], ops: [copy(op)]});
        return [copy(op)];
    }
    insertRows(index: number, count = 1): StructuralSheetOp[] { return this.axisEdit("insertRows", index, count); }
    insertColumns(index: number, count = 1): StructuralSheetOp[] { return this.axisEdit("insertColumns", index, count); }
    deleteRows(index: number, count = 1): StructuralSheetOp[] { return this.axisEdit("deleteRows", index, count); }
    deleteColumns(index: number, count = 1): StructuralSheetOp[] { return this.axisEdit("deleteColumns", index, count); }
    /** destination is the index in the axis after removal of the selected range. */
    moveRows(index: number, count: number, destination: number): StructuralSheetOp[] { return this.axisEdit("moveRows", index, count, destination); }
    moveColumns(index: number, count: number, destination: number): StructuralSheetOp[] { return this.axisEdit("moveColumns", index, count, destination); }
    receive(ops: readonly StructuralSheetOp[], options: {requireKnownReferences?: boolean} = {}): void {
        if (!safeJson(options) || !record(options) || Object.keys(options).some(key => key !== "requireKnownReferences") || options.requireKnownReferences !== undefined && typeof options.requireKnownReferences !== "boolean") fail("invalid receive options");
        if (!safeJson(ops) || !Array.isArray(ops)) fail("operations must be a plain JSON array");
        const staged = new Map<string, StructuralSheetOp>(), fresh: StructuralSheetOp[] = [];
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
        const axes = this.prepare(fresh, options.requireKnownReferences === true); this.apply(fresh, axes); this.journal.push({type: "receive", ops: fresh});
    }
    private history(undo: boolean): StructuralSheetOp[] {
        const source = undo ? this.undoStack : this.redoStack, destination = undo ? this.redoStack : this.undoStack, entry = source.at(-1);
        if (!entry) return [];
        const ops: StructuralSheetOp[] = [];
        if (entry.type === "axis") {
            this.reserve(1);
            const op: StructuralAxisOp = {...this.binding(), kind: "toggle", at: {lamport: this.clock.lamport + 1, actor: this.options.actor}, sheetId: this.options.sheetId, axis: entry.axis, target: copy(entry.target), active: !undo};
            const axes = this.prepare([op]); this.clock.next(); this.apply([op], axes); ops.push(op); entry.undone = undo;
        } else {
            const targets = entry.targets.filter(target => target.undone !== undo && sameStamp(this.registers.get(this.key(target.row, target.column, target.field))?.at, (undo ? target.after : target.before).at));
            this.reserve(targets.length);
            for (const target of targets) {
                const state = undo ? target.before : target.after, at = this.clock.next(); state.at = copy(at); target.undone = undo;
                this.linked.set(this.key(target.row, target.column, target.field), state);
                ops.push({...this.binding(), kind: "cell", at, sheetId: this.options.sheetId, row: copy(target.row), column: copy(target.column), field: target.field, value: state.value});
            }
            this.apply(ops);
        }
        this.pending.push(...copy(ops)); source.pop(); destination.push(entry); this.journal.push({type: undo ? "undo" : "redo", ops: copy(ops)});
        return copy(ops);
    }
    undo(): StructuralSheetOp[] { return this.history(true); }
    redo(): StructuralSheetOp[] { return this.history(false); }
    pendingChanges(): StructuralSheetOp[] { return copy(this.pending); }
    acknowledge(ops: readonly StructuralSheetOp[]): void {
        if (!safeJson(ops) || !Array.isArray(ops) || ops.length > this.pending.length || !ops.every((op, index) => equal(op, this.pending[index]))) fail("acknowledgement must match the exact pending prefix");
        if (!ops.length) return;
        this.pending.splice(0, ops.length); this.journal.push({type: "acknowledge", ops: copy([...ops])});
    }
    stats() { return {registers: this.registers.size, retainedOps: this.ledger.size, pending: this.pending.length, undo: this.undoStack.length, redo: this.redoStack.length, clock: this.clock.lamport, rows: this.rows, columns: this.columns, rowRuns: this.rowAxis.stats().runs, columnRuns: this.columnAxis.stats().runs}; }
    captureState(): StructuralSheetState {
        return copy({...this.binding(), format: FORMAT, options: this.options, journal: this.journal, checkpoint: {
            clock: this.clock.lamport, rows: this.rowAxis.actions(), columns: this.columnAxis.actions(),
            registers: [...this.registers].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0), retainedOps: [...this.ledger.values()], pending: this.pending, undo: this.undoStack, redo: this.redoStack,
        }});
    }
    static fromState(state: unknown): StructuralSheet {
        if (!safeJson(state) || !record(state) || !exactKeys(state, Object.hasOwn(state, "schemaVersion") ? SCHEMA_SHEET_STATE_FIELDS : SHEET_STATE_FIELDS) || state.format !== FORMAT || !Array.isArray(state.journal)) fail("invalid snapshot");
        const sheet = new StructuralSheet(state.options as unknown as StructuralSheetOptions);
        if (state.schemaVersion !== sheet.schemaIdentity) fail("snapshot schema differs");
        for (const entry of state.journal) {
            if (!record(entry) || typeof entry.type !== "string") fail("invalid journal entry");
            const count = sheet.journal.length;
            if (entry.type === "set") {
                if (!exactKeys(entry, CELL_JOURNAL_FIELDS)) fail("invalid set journal entry");
                sheet.setCellById(entry.row as AxisId, entry.column as AxisId, entry.patch as SparseCellPatch);
            } else if (entry.type === "axis") {
                if (!exactKeys(entry, AXIS_JOURNAL_FIELDS) || !STRUCTURAL_AXIS_OPERATIONS.includes(entry.method as string) || !Array.isArray(entry.args) || entry.args.length !== ((entry.method as string).startsWith("move") ? 3 : 2)) fail("invalid axis journal entry");
                sheet.axisEdit(entry.method as AxisMethod, entry.args[0] as number, entry.args[1] as number, entry.args[2] as number | undefined);
            } else if (entry.type === "receive") {
                if (!exactKeys(entry, HISTORY_JOURNAL_FIELDS)) fail("invalid receive journal entry"); sheet.receive(entry.ops as StructuralSheetOp[]);
            } else if (entry.type === "undo" || entry.type === "redo") {
                if (!exactKeys(entry, HISTORY_JOURNAL_FIELDS)) fail("invalid history journal entry"); sheet[entry.type]();
            } else if (entry.type === "acknowledge") {
                if (!exactKeys(entry, HISTORY_JOURNAL_FIELDS)) fail("invalid acknowledgement journal entry"); sheet.acknowledge(entry.ops as StructuralSheetOp[]);
            } else fail("unknown snapshot journal entry");
            if (sheet.journal.length === count || !equal(sheet.journal.at(-1), entry)) fail("invalid journal replay");
        }
        if (!equal(sheet.captureState(), state)) fail("snapshot checkpoint does not match replayed state");
        return sheet;
    }
    restoreState(state: unknown): void {
        const next = StructuralSheet.fromState(state);
        if (!equal(next.options, this.options)) fail("snapshot actor, sheet, schema or initial extent differs");
        this.references = next.references; this.clock = next.clock; this.rowAxis = next.rowAxis; this.columnAxis = next.columnAxis; this.registers = next.registers; this.ledger = next.ledger;
        this.pending = next.pending; this.undoStack = next.undoStack; this.redoStack = next.redoStack; this.linked = next.linked; this.journal = next.journal;
    }
}
