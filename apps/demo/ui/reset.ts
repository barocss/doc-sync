import type {SyncClient} from "@barocss/doc-sync/sync";

type ResetClient = Pick<SyncClient, "onEvent">;

/** Wait for the reset itself. A new document already has serverSeq 0. */
export async function resetAndWait(clients: readonly ResetClient[], request: () => Promise<unknown>, timeoutMs = 4000): Promise<void> {
    const waiting = new Set(clients);
    const hooks: Array<() => void> = [];
    let timer: ReturnType<typeof setTimeout> | undefined;
    const received = new Promise<void>((resolve, reject) => {
        timer = setTimeout(() => reject(new Error("문서 초기화 이벤트 대기 시간 초과")), timeoutMs);
        for (const client of waiting) {
            const previous = client.onEvent;
            const listener: SyncClient["onEvent"] = event => {
                previous?.call(client, event);
                if (event.type === "reset") {
                    waiting.delete(client);
                    if (!waiting.size) resolve();
                }
            };

            client.onEvent = listener;
            hooks.push(() => {
                if (client.onEvent === listener) client.onEvent = previous;
            });
        }
        if (!waiting.size) resolve();
    });

    try {
        await Promise.all([received, Promise.resolve().then(request)]);
    } finally {
        clearTimeout(timer);
        hooks.forEach(restore => restore());
    }
}

/** Ignore another UI action until the active scenario, including its reset and seed, has finished. */
export function createActionGuard(): (action: () => Promise<void>) => Promise<void> {
    let active = false;

    return async action => {
        if (active) return;
        active = true;
        try {
            await action();
        } finally {
            active = false;
        }
    };
}
