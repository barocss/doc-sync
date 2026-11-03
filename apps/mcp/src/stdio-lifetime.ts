import {PassThrough} from "node:stream";

/** Buffer raw protocol input until recovery permits SDK admission. */
export function ownStdioInput(onClose: (error?: unknown) => void) {
    const input = new PassThrough({highWaterMark: 64 * 1024});
    // Backpressure can pause stdin and remove its event-loop reference before
    // the SDK starts reading. Hold a startup-only lease, not a timeout.
    const bootstrapLease = setInterval(() => {}, 60_000);
    const releaseBootstrap = () => clearInterval(bootstrapLease);
    const end = () => { releaseBootstrap(); onClose(); };
    const error = (cause: Error) => { releaseBootstrap(); onClose(cause); };
    process.stdin.once("end", end);
    process.stdin.once("close", end);
    process.stdin.on("error", error);
    input.on("error", error);
    process.stdin.pipe(input);
    if (process.stdin.readableEnded || process.stdin.destroyed) queueMicrotask(end);
    return {
        input,
        releaseBootstrap,
        close() {
            releaseBootstrap();
            process.stdin.unpipe(input);
            process.stdin.pause();
            process.stdin.off("end", end);
            process.stdin.off("close", end);
            process.stdin.off("error", error);
            input.destroy();
        },
    };
}
