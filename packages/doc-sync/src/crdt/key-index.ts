/** Runtime ID metadata. Logical IDs and Item identities remain unchanged. */
const LIMIT = 256;
type Actor<T> = {ranges: Range<T>[]; sparse: Map<number, T> | null; size: number};
type Range<T> = {start: number; count: number; value: T; values: T[] | null};

export class KeyIndex<T extends object> {
    private readonly actors = new Map<string, Actor<T>>();
    private readonly other = new Map<string, T>();
    size = 0;

    get rangeCount(): number {
        let count = 0;
        for (const actor of this.actors.values()) count += actor.ranges.length;
        return count;
    }

    get sparseCount(): number {
        let count = 0;
        for (const actor of this.actors.values()) count += actor.sparse?.size ?? 0;
        return count;
    }

    get denseCount(): number {
        let count = 0;
        for (const actor of this.actors.values()) for (const range of actor.ranges) if (range.values) count += 1;
        return count;
    }

    get(key: string): T | undefined {
        const split = key.indexOf("@");
        const id = Number(key.slice(0, split));
        if (split < 1 || !Number.isSafeInteger(id) || id < 0 || String(id) !== key.slice(0, split)) return this.other.get(key);
        const actor = this.actors.get(key.slice(split + 1));
        if (!actor) return undefined;
        if (actor.sparse) return actor.sparse.get(id);
        const ranges = actor.ranges;
        const range = ranges[this.find(ranges, id)];
        if (!range || id - range.start >= range.count) return undefined;
        return range.values ? range.values[id - range.start] : range.value;
    }

    has(key: string): boolean { return this.get(key) !== undefined; }

    set(key: string, value: T): this {
        const split = key.indexOf("@");
        const id = Number(key.slice(0, split));
        if (split < 1 || !Number.isSafeInteger(id) || id < 0 || String(id) !== key.slice(0, split)) {
            if (!this.other.has(key)) this.size += 1;
            this.other.set(key, value);
            return this;
        }
        const name = key.slice(split + 1);
        let actor = this.actors.get(name);
        if (!actor) { actor = {ranges: [], sparse: null, size: 0}; this.actors.set(name, actor); }
        if (actor.sparse) {
            if (!actor.sparse.has(id)) { this.size += 1; actor.size += 1; }
            actor.sparse.set(id, value);
            return this;
        }
        const ranges = actor.ranges;
        const at = this.find(ranges, id);
        const left = ranges[at];
        const offset = left ? id - left.start : -1;
        if (left && offset < left.count) {
            if (left.values) left.values[offset] = value;
            else if (left.value !== value) {
                left.values = Array<T>(left.count).fill(left.value);
                left.values[offset] = value;
            }
            return this;
        }
        this.size += 1;
        actor.size += 1;
        const right = ranges[at + 1];
        if (left && offset === left.count && left.count < LIMIT) {
            if (left.values) left.values.push(value);
            else if (left.value !== value) { left.values = Array<T>(left.count).fill(left.value); left.values.push(value); }
            left.count += 1;
            this.join(ranges, at);
        } else if (right && id + 1 === right.start && right.count < LIMIT) {
            if (right.values) right.values.unshift(value);
            else if (right.value !== value) { right.values = Array<T>(right.count).fill(right.value); right.values.unshift(value); }
            right.start = id;
            right.count += 1;
            if (at >= 0) this.join(ranges, at);
        } else {
            ranges.splice(at + 1, 0, {start: id, count: 1, value, values: null});
        }
        // A highly fragmented Lamport sequence must not allocate one range
        // object per ID. Numeric keys retain actor sharing without that overhead.
        if (ranges.length > 64 && actor.size < ranges.length * 4) {
            actor.sparse = new Map();
            for (const range of ranges) for (let i = 0; i < range.count; i++) actor.sparse.set(range.start + i, range.values ? range.values[i] : range.value);
            actor.ranges = [];
        }
        return this;
    }

    clear(): void { this.actors.clear(); this.other.clear(); this.size = 0; }

    /** Release dense references after stable tombstone aliases have merged. */
    compact(): void {
        for (const actor of this.actors.values()) for (const range of actor.ranges) {
            if (range.values && range.values.every(value => value === range.values![0])) {
                range.value = range.values[0];
                range.values = null;
            }
        }
    }

    // Largest start <= id, or -1. The final-range check covers normal append input.
    private find(ranges: Range<T>[], id: number): number {
        if (ranges.length && ranges[ranges.length - 1].start <= id) return ranges.length - 1;
        let lo = 0, hi = ranges.length;
        while (lo < hi) {
            const mid = (lo + hi) >>> 1;
            if (ranges[mid].start <= id) lo = mid + 1;
            else hi = mid;
        }
        return lo - 1;
    }

    private join(ranges: Range<T>[], at: number): void {
        const left = ranges[at], right = ranges[at + 1];
        if (!right || left.start + left.count !== right.start || left.count + right.count > LIMIT) return;
        if (left.values || right.values || left.value !== right.value) {
            const values = left.values ?? Array<T>(left.count).fill(left.value);
            if (right.values) values.push(...right.values);
            else for (let i = 0; i < right.count; i++) values.push(right.value);
            left.values = values;
        }
        left.count += right.count;
        ranges.splice(at + 1, 1);
    }
}
