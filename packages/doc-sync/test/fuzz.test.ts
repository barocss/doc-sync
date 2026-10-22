import assert from "node:assert/strict";
import {test} from "node:test";
import {runSeed} from "./fuzz-core.ts";

/** FUZZ_SEEDS=3000 처럼 씨앗 수를 바꿀 수 있다 */
const SEEDS = Number(process.env.FUZZ_SEEDS ?? 500);

for (const gc of [false, true]) {
    for (const peers of [2, 4]) {
        test(`무작위 ${SEEDS} 대본 · 참여자 ${peers}${gc ? " · 서버 GC 섞음" : ""} — 모두 같은 문서로 모이고, 편집기 쪽 거울도 늘 같다`, async t => {
            const failures: string[] = [];
            let compacted = 0;
            let gcs = 0;
            let events = 0;
            let normalized = 0;

            for (let seed = 1; seed <= SEEDS; seed += 1) {
                try {
                    const result = await runSeed(seed, peers, {gc});

                    result.same || failures.push(`씨앗 ${seed}\n${result.detail}`);
                    // 거울(편집 연산 + 받는 쪽 이벤트로만 바뀌는 모델)이 CRDT 모델과 달랐거나, 이벤트 검산이 틀렸으면 실패
                    result.mirrorMismatch && failures.push(`씨앗 ${seed} 거울 어긋남 ${result.mirrorMismatch}번\n${result.detail}`);
                    result.fallbacks && failures.push(`씨앗 ${seed} 이벤트 검산 실패 ${result.fallbacks}번`);
                    compacted += result.compacted;
                    gcs += result.gcs;
                    events += result.events;
                    normalized += result.normalized;
                } catch (error) {
                    failures.push(`씨앗 ${seed} 오류: ${(error as Error).message}`);
                }
            }

            gc && t.diagnostic(`GC ${gcs}번 · 압축된 글자 묘비 ${compacted}개`);
            t.diagnostic(`받는 쪽 이벤트 ${events}개 · normalize 가 붙은 내 편집 ${normalized}번`);
            assert.equal(failures.length, 0, `${failures.length} 개 실패\n${failures.slice(0, 3).join("\n\n")}`);

            // GC 를 섞은 판은 실제로 압축이 일어났어야 시험이 의미 있다
            gc && assert.ok(compacted > 0, "GC 가 한 번도 묘비를 압축하지 않았다");
        });
    }
}
