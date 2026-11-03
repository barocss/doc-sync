import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import {fileURLToPath} from "node:url";
import {test} from "node:test";

for (const scenario of ["stock", "doc-valid", "doc-malformed", "doc-throw", "doc-getter-valid", "doc-getter-malformed", "doc-getter-throw"]) {
    test(`point preload isolated source graph ${scenario}`, () => {
        const result = spawnSync(process.execPath, [fileURLToPath(new URL("./fixtures/data-point-preload.mjs", import.meta.url)), scenario], {encoding: "utf8", timeout: 30_000});
        assert.ifError(result.error);
        assert.equal(result.status, 0, result.stderr + result.stdout);
        assert.deepEqual(JSON.parse(result.stdout.trim()), {scenario, pass: true});
    });
}
