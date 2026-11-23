/** Reservations are synchronous, and remain owned until resource cleanup finishes. */
export class SessionRegistry<T> {
    readonly entries = new Map<string, {principal: string; value: T}>();
    private readonly maximum: number;
    private readonly perPrincipal: number;
    constructor(maximum: number, perPrincipal: number) { this.maximum = maximum; this.perPrincipal = perPrincipal; }
    reserve(identity: string, principal: string, value: T): void {
        if (this.entries.has(identity)) throw new Error("Logical identity already active");
        if (this.entries.size >= this.maximum || [...this.entries.values()].filter(e => e.principal === principal).length >= this.perPrincipal) throw new Error("Session capacity reached");
        this.entries.set(identity, {principal, value});
    }
    release(identity: string, value: T): void {
        if (this.entries.get(identity)?.value === value) this.entries.delete(identity);
    }
}
