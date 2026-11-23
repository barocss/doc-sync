/** A bounded, read-only watcher. It does not persist a cursor or resume after restart. */
export type WatchState = {generation: string | null; epoch: string; schemaVersion: string | null; serverSeq: number};
export type ReviewOutcome = {status: string};

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
            const current = await this.read();
            if (this.stopped) return "stopped";
            if (!current.generation || !current.epoch || !current.schemaVersion || !Number.isSafeInteger(current.serverSeq) || current.serverSeq < 0) throw new Error("Document state is unavailable");
            if (!this.baseline) { this.baseline = {...current}; return "baseline"; }
            if (current.generation !== this.baseline.generation || current.epoch !== this.baseline.epoch || current.schemaVersion !== this.baseline.schemaVersion || current.serverSeq < this.baseline.serverSeq) {
                throw new Error("Document generation, epoch, schema or sequence changed; restart the watcher after inspection");
            }
            if (current.serverSeq === this.baseline.serverSeq) return "unchanged";
            const outcome = await this.review({from: this.baseline.serverSeq, to: current.serverSeq});
            this.runs++;
            if (outcome.status !== "completed") throw new Error("Review needs attention; watcher stopped");
            this.baseline = {...current};
            return "reviewed";
        } catch (error) { this.stopped = true; throw error; }
        finally { this.busy = false; }
    }
}
