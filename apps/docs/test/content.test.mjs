import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {stripTypeScriptTypes} from "node:module";
import {spawnSync} from "node:child_process";
import {fileURLToPath} from "node:url";
import {test} from "node:test";

const root = fileURLToPath(new URL("../../../", import.meta.url));

test("the documented quick-start example runs against the actual public API", () => {
    const source = readFileSync(new URL("../src/guide/getting-started.md", import.meta.url), "utf8");
    const code = /<!-- executable-example -->\s*```ts\n([\s\S]*?)\n```/.exec(source)?.[1];
    assert.ok(code, "a marked executable example is required");
    const result = spawnSync(process.execPath, ["--input-type=module", "-"], {
        cwd: root,
        input: stripTypeScriptTypes(code),
        encoding: "utf8",
        timeout: 10000,
    });
    assert.equal(result.status, 0, result.stderr);
});

test("reference preparation uses the authoritative documents without internal handoff links", () => {
    const result = spawnSync(process.execPath, ["apps/docs/scripts/prepare-content.mjs"], {cwd: root, encoding: "utf8"});
    assert.equal(result.status, 0, result.stderr);
    for (const name of ["spec.md", "collaboration-intent.md", "edit-api.md", "recovery-plan.md"]) {
        const generated = readFileSync(new URL(`../src/reference/${name}`, import.meta.url), "utf8");
        assert.match(generated, new RegExp(`Generated from docs/${name.replace(".", "\\.")}; SHA-256 [a-f0-9]{64}`));
        assert.doesNotMatch(generated, /\]\([^)]*HANDOFF\.md/);
        assert.doesNotMatch(generated, /\/Users\/user\//);
        assert.doesNotMatch(generated, /\.\.\/apps\/docs\/src\/roadmap\.md/);
    }
});
