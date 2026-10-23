import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import {readFileSync} from "node:fs";
import {stripTypeScriptTypes} from "node:module";
import {test} from "node:test";
import {fileURLToPath} from "node:url";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const source = readFileSync(new URL("../src/guide/blocks.md", import.meta.url), "utf8");
const setup = /<!-- shared-example-setup -->\s*```ts\n([\s\S]*?)\n```/.exec(source)?.[1];
const examples = [...source.matchAll(/<!-- executable-example: ([a-z0-9-]+) -->\s*```ts\n([\s\S]*?)\n```/g)];

const required = [
    "divider", "text-blocks", "model-operations", "lists", "callout-body", "table-axes",
    "table-merge-split", "inline-image", "links-and-marks",
    "schema-restrictions", "concurrent-enter",
];

test("the block guide contains common setup and every required executable example", () => {
    assert.ok(setup, "one marked shared setup is required");
    assert.equal((source.match(/<!-- shared-example-setup -->/g) ?? []).length, 1);
    assert.deepEqual(examples.map(match => match[1]), required);
    assert.doesNotMatch(setup, /\b(?:commands|GridBlock|FlowBlock|Pos|MAIN)\b/);
    assert.ok(source.indexOf("<!-- executable-example: divider -->") < source.indexOf("::: details Complete example schema and setup"));
});

for (const [, name, code] of examples) {
    test(`documented block example: ${name}`, () => {
        assert.ok(setup, "shared setup must exist before running examples");
        assert.match(code, /\b\w+\.edit\(/, "each action must demonstrate doc.edit()");
        assert.doesNotMatch(code, /\bcommands\.|\.blocks\(|\.textAt\(|\.cellKey\(/);
        const script = stripTypeScriptTypes(`${setup}\n{\n${code}\n}\n`);
        const result = spawnSync(process.execPath, ["--input-type=module", "-"], {
            cwd: root,
            input: script,
            encoding: "utf8",
            timeout: 10000,
        });
        assert.ifError(result.error);
        assert.equal(result.status, 0, `${name}\n${result.stdout}\n${result.stderr}`);
    });
}
