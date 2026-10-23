import assert from "node:assert/strict";
import {mkdtempSync, readFileSync, readdirSync, rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {after, test} from "node:test";
import {generateDiagrams} from "../scripts/prepare-diagrams.mjs";

const directory = mkdtempSync(join(tmpdir(), "doc-sync-diagrams-"));
generateDiagrams(directory);
after(() => rmSync(directory, {recursive: true, force: true}));
const {cases} = JSON.parse(readFileSync(join(directory, "models.json"), "utf8"));
const p = (text, marks = {}) => ({type: "paragraph", runs: [{text, marks}]});
const model = (...children) => ({type: "content", children});

const expectations = {
    insert: {
        operation: {op: "insert", at: [1], content: [p("New")]},
        before: model(p("Hello"), p("World")),
        after: model(p("Hello"), p("New"), p("World")),
    },
    delete: {
        operation: {op: "delete", at: [1], count: 1},
        before: model(p("Hello"), p("New"), p("World")),
        after: model(p("Hello"), p("World")),
    },
    update: {
        operation: {op: "update", at: [0, 0], length: 5, attrs: {bold: true}},
        before: model(p("Hello")),
        after: model(p("Hello", {bold: true})),
    },
    split: {
        operation: {op: "split", at: [0, 5]},
        before: model(p("HelloWorld")),
        after: model(p("Hello"), p("World")),
    },
    move: {
        operation: {op: "move", from: [1], at: [0]},
        before: model(p("Hello"), p("World"), p("Again")),
        after: model(p("World"), p("Hello"), p("Again")),
    },
    merge: {
        operation: {op: "merge", at: [1]},
        before: model(p("Hello"), p("World")),
        after: model(p("HelloWorld")),
    },
};
for (const [name, expected] of Object.entries(expectations)) {
    test(`${name} diagram trace matches fixed operation and model expectations`, () => {
        assert.deepEqual(cases[name], expected);
    });
}

test("table span retains hidden-cell text and restores the full grid", () => {
    const trace = cases["table-span"];
    const cells = state => state.children[1].children.flatMap(row => row.children);
    const values = state => cells(state).map(cell => cell.children[0].children[0].runs[0].text);
    assert.deepEqual(trace.operations, [
        {op: "update", at: [1, 0, 0], attrs: {rowspan: 2, colspan: 2}},
        {op: "update", at: [1, 0, 0], attrs: {rowspan: 1, colspan: 1}},
    ]);
    for (const state of [trace.before, trace.merged, trace.after]) {
        assert.equal(state.children[1].children.length, 2);
        assert.ok(state.children[1].children.every(row => row.children.length === 2));
        assert.deepEqual(values(state), ["A", "B", "C", "D"]);
    }
    assert.deepEqual(cells(trace.before).map(cell => cell.attrs), [undefined, undefined, undefined, undefined]);
    assert.deepEqual(cells(trace.merged).map(cell => cell.attrs), [
        {colspan: 2, rowspan: 2}, {spanned: true}, {spanned: true}, {spanned: true},
    ]);
    assert.deepEqual(trace.after, trace.before);
});

test("generation writes exactly seven SVGs and one model trace", () => {
    assert.deepEqual(readdirSync(directory).sort(), [
        "delete.svg", "insert.svg", "merge.svg", "models.json", "move.svg", "split.svg", "table-span.svg", "update.svg",
    ]);
});

test("SVGs include accessible labels, escaped operation data, paths, and no external assets", () => {
    for (const name of Object.keys(cases)) {
        const source = readFileSync(join(directory, `${name}.svg`), "utf8");
        assert.match(source, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" width="720"/);
        assert.match(source, /viewBox="0 0 720 \d+"/);
        assert.match(source, /role="img" aria-labelledby="title description"/);
        assert.match(source, /<title id="title">[^<]+<\/title>/);
        assert.match(source, /<desc id="description">[^<]+<\/desc>/);
        assert.match(source, /&quot;op&quot;:&quot;/);
        assert.match(source, /\[1(?:,0,0)?\]|\[0,0\]|\[0,5\]/);
        assert.ok(source.endsWith("</svg>\n"));
        assert.doesNotMatch(source, /<script|<image|<foreignObject|(?:href|src)=|@import|\/Users\/|[가-힣]/i);
    }
    const displayed = {
        insert: {Hello: 2, New: 1, World: 2},
        delete: {Hello: 2, New: 1, World: 2},
        update: {Hello: 2},
        split: {HelloWorld: 1, Hello: 1, World: 1},
        merge: {HelloWorld: 1, Hello: 1, World: 1},
    };
    for (const [name, expected] of Object.entries(displayed)) {
        const source = readFileSync(join(directory, `${name}.svg`), "utf8");
        for (const [value, count] of Object.entries(expected)) {
            assert.equal((source.match(new RegExp(`>${value}</text>`, "g")) ?? []).length, count);
        }
        assert.match(source, />Before · content \[\]<\/text>/);
        assert.match(source, />After · content \[\]<\/text>/);
    }
    for (const name of ["insert", "delete"]) {
        const source = readFileSync(join(directory, `${name}.svg`), "utf8");
        assert.equal((source.match(/>paragraph \[2\]<\/text>/g) ?? []).length, 1);
    }
    assert.match(readFileSync(join(directory, "update.svg"), "utf8"), /class="value" font-weight="700">Hello<\/text>/);
    const merged = readFileSync(join(directory, "table-span.svg"), "utf8");
    assert.equal((merged.match(/>hidden<\/text>/g) ?? []).length, 3);
    assert.equal((merged.match(/>retained<\/text>/g) ?? []).length, 3);
    assert.match(merged, /Content stays in its original cell/);
    assert.match(merged, /rowspan&quot;:2/);
    assert.match(merged, /rowspan&quot;:1/);
    for (const value of ["A", "B", "C", "D"]) {
        assert.equal((merged.match(new RegExp(`>${value}</text>`, "g")) ?? []).length, 3);
    }
});
