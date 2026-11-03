import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {stripTypeScriptTypes} from "node:module";
import {spawnSync} from "node:child_process";
import {fileURLToPath} from "node:url";
import {test} from "node:test";

test("graphic guide executes its public Client example with stored object undo", () => {
    const source = readFileSync(new URL("../src/guide/graphic-schema.md", import.meta.url), "utf8");
    const example = /<!-- graphic-client-example -->\s*```ts\n([\s\S]*?)\n```/.exec(source)?.[1];
    assert.ok(example, "the guide must provide a marked executable example");
    const checks = `
assert.equal(reopened.actor, client.actor);
assert.deepEqual(reopened.model().children[0].children[0], {type: "shape", attrs: {name: "Rectangle"}});
assert.equal(client.model().children[0].children[1].runs[0].text, "Title!");
assert.equal(reopened.model().children[0].children[1].runs[0].text, "Title");
reopened.redo();
assert.deepEqual(reopened.model(), client.model());
`;
    const result = spawnSync(process.execPath, ["--input-type=module", "-"], {
        cwd: fileURLToPath(new URL("../../../", import.meta.url)),
        input: `import assert from "node:assert/strict";\n` + stripTypeScriptTypes(example).replace("client.dispose();", checks + "\nclient.dispose();"),
        encoding: "utf8", timeout: 10000,
    });
    assert.equal(result.status, 0, result.stderr);
});
