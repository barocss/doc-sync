import assert from "node:assert/strict";
import {setImmediate} from "node:timers/promises";
import {test} from "node:test";
import {createActionGuard, resetAndWait} from "../ui/reset.ts";
import type {SyncClient, ServerEvent} from "@barocss/doc-sync/sync";

test("초기화: seq0이어도 모든 reset 이벤트 전에는 끝나지 않고 기존 훅을 복구한다", async () => {
    const observed: ServerEvent[] = [];
    const hook = (event: ServerEvent) => { observed.push(event); };
    const peers: Array<Pick<SyncClient, "onEvent" | "serverSeq">> = [
        {onEvent: hook, serverSeq: 0},
        {onEvent: null, serverSeq: 0},
    ];
    let completed = false;
    let requested = false;
    const pending = resetAndWait(peers, async () => { requested = true; }).then(() => { completed = true; });

    await setImmediate();
    assert.equal(requested, true);
    assert.equal(completed, false);
    peers[0].onEvent?.({type: "reset"});
    await setImmediate();
    assert.equal(completed, false);
    assert.equal(peers[0].onEvent === hook, false);
    peers[1].onEvent?.({type: "reset"});
    await pending;
    assert.equal(completed, true);
    assert.deepEqual(observed, [{type: "reset"}]);
    assert.equal(peers[0].onEvent, hook);
    assert.equal(peers[1].onEvent, null);
});

test("초기화: POST 실패와 이벤트 시간 초과에도 훅을 복구하고 다음 초기화를 허용한다", async () => {
    const hook = (_event: ServerEvent) => undefined;
    const client: Pick<SyncClient, "onEvent"> = {onEvent: hook};

    await assert.rejects(resetAndWait([client], async () => { throw new Error("HTTP 500"); }), /HTTP 500/);
    assert.equal(client.onEvent, hook);
    await assert.rejects(resetAndWait([client], async () => undefined, 10), /시간 초과/);
    assert.equal(client.onEvent, hook);
    await resetAndWait([client], async () => { client.onEvent?.({type: "reset"}); });
    assert.equal(client.onEvent, hook);
});

test("초기화 UI guard: reset 요청·이벤트 대기·seed 처리 전체에서 중복 진입을 막는다", async () => {
    const hook = (_event: ServerEvent) => undefined;
    const client: Pick<SyncClient, "onEvent"> = {onEvent: hook};
    const guard = createActionGuard();
    let requestCount = 0;
    let seedCount = 0;
    let releaseSeed!: () => void;
    const seed = new Promise<void>(resolve => { releaseSeed = resolve; });
    const reset = () => guard(async () => {
        await resetAndWait([client], async () => { requestCount += 1; });
        seedCount += 1;
        await seed;
    });
    const first = reset();

    await setImmediate();
    await reset();
    assert.equal(requestCount, 1);
    assert.equal(seedCount, 0);
    client.onEvent?.({type: "reset"});
    await setImmediate();
    assert.equal(seedCount, 1);
    assert.equal(client.onEvent, hook);
    await reset();
    assert.equal(requestCount, 1, "seed 중에도 다음 초기화 요청을 보내지 않는다");
    releaseSeed();
    await first;
    const next = reset();

    await setImmediate();
    assert.equal(requestCount, 2, "완료 후에는 새 초기화를 허용한다");
    client.onEvent?.({type: "reset"});
    await next;
    assert.equal(seedCount, 2);
    assert.equal(client.onEvent, hook);
});

test("초기화 UI guard: 실패 후 다음 작업을 허용한다", async () => {
    const guard = createActionGuard();
    let called = false;

    await assert.rejects(guard(async () => { throw new Error("reset 실패"); }), /reset 실패/);
    await guard(async () => { called = true; });
    assert.equal(called, true);
});
