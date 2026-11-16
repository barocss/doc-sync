/** A bounded, read-only watcher. It does not persist a cursor or resume after restart. */
export type WatchState = {generation: string | null; epoch: string; schemaVersion: string | null; serverSeq: number};
export type ReviewOutcome = {status: string};

function snapshot(state: WatchState): WatchState {
    const value = {generation:state.generation, epoch:state.epoch, schemaVersion:state.schemaVersion, serverSeq:state.serverSeq};
    if (typeof value.generation !== "string" || !value.generation || typeof value.epoch !== "string" || !value.epoch || typeof value.schemaVersion !== "string" || !value.schemaVersion || !Number.isSafeInteger(value.serverSeq) || value.serverSeq < 0) throw new Error("Document state is unavailable");
    return value;
}
function compatible(current: WatchState, previous: WatchState): void {
    if (current.generation !== previous.generation || current.epoch !== previous.epoch || current.schemaVersion !== previous.schemaVersion || current.serverSeq < previous.serverSeq) {
        throw new Error("Document generation, epoch, schema or sequence changed; restart the watcher after inspection");
    }
}

export class ReviewWatch {
    private baseline: WatchState | null = null;
    private busy = false;
    private stopped = false;
    private runs = 0;
    private readonly read: () => Promise<WatchState>;
    private readonly review: (change: {from: number; to: number}) => Promise<ReviewOutcome>;
    readonly maxRuns: number;
    constructor(read: () => Promise<WatchState>, review: (change: {from: number; to: number}) => Promise<ReviewOutcome>, maxRuns: number) {
        this.read = read; this.review = review; this.maxRuns = maxRuns;
        if (!Number.isSafeInteger(maxRuns) || maxRuns < 1 || maxRuns > 100) throw new Error("Review limit must be 1–100");
    }
    stop(): void { this.stopped = true; }
    get done(): boolean { return this.stopped || this.runs >= this.maxRuns; }
    async poll(): Promise<"baseline" | "unchanged" | "reviewed" | "stopped"> {
        if (this.done) return "stopped";
        if (this.busy) throw new Error("A review poll is already in progress");
        this.busy = true;
        try {
            const observed = await this.read();
            if (this.stopped) return "stopped";
            const current = snapshot(observed);
            if (!this.baseline) { this.baseline = {...current}; return "baseline"; }
            compatible(current, this.baseline);
            if (current.serverSeq === this.baseline.serverSeq) return "unchanged";
            const outcome = await this.review({from: this.baseline.serverSeq, to: current.serverSeq});
            this.runs++;
            if (this.stopped) return "stopped";
            if (outcome.status !== "completed") throw new Error("Review needs attention; watcher stopped");
            const afterReview = await this.read();
            if (this.stopped) return "stopped";
            compatible(snapshot(afterReview), current);
            // Newer peer changes were not covered by this review. Leave them for the next poll.
            this.baseline = {...current};
            return "reviewed";
        } catch (error) { this.stopped = true; throw error; }
        finally { this.busy = false; }
    }
}
