import assert from "node:assert/strict";
import {test} from "node:test";
import {spawnSync} from "node:child_process";
import {canonical, type NodeJSON} from "@barocss/doc-sync";
import {PRODUCT_SCHEMAS} from "../../../fixtures/product-schemas.ts";
import {PRODUCT_MODELS} from "../../../fixtures/product-documents.ts";
import {productDocument, TARGETS, type ProductProfile} from "../products/documents.ts";

const nodes = (node: NodeJSON): NodeJSON[] => [node, ...(node.children ?? []).flatMap(nodes)];
for (const profile of Object.keys(PRODUCT_SCHEMAS) as ProductProfile[]) {
    test(`${profile} native demo retains the rich sample and adds exactly 100k generated UTF-16 units`, () => {
        const original = structuredClone(PRODUCT_MODELS[profile]);
        assert.deepEqual(productDocument(profile), original);
        const model = productDocument(profile, 100000);
        const generated = nodes(model).filter(node => node.type === "paragraph" && node.runs?.some(run => "text" in run && /^Block \d+\. /.test(run.text)));
        assert.equal(generated.length, 625);
        assert.equal(generated.reduce((sum, node) => sum + node.runs!.reduce((n, run) => n + ("text" in run ? run.text.length : 0), 0), 0), 100000);
        assert.deepEqual(canonical(PRODUCT_SCHEMAS[profile], model), model);
        const target = TARGETS[profile].path.reduce((node, index) => node.children![index], model);
        assert.equal(target.runs!.map(run => "text" in run ? run.text : "").join(""), TARGETS[profile].text);
        model.children!.length = 0;
        assert.deepEqual(PRODUCT_MODELS[profile], original);
    });
}
test("native demo generation rejects invalid sizes and server rejects unknown schema profiles", () => {
    for (const count of [-1, 0.5, Infinity, 1000001]) assert.throws(() => productDocument("word", count));
    const result = spawnSync(process.execPath, ["apps/demo/server.ts"], {cwd: new URL("../../../", import.meta.url), env: {...process.env, DOC_PROFILE: "unknown", PORT: "0"}, encoding: "utf8"});
    assert.equal(result.status, 1); assert.match(result.stderr, /Unknown document profile/);
});
