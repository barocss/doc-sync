import assert from 'node:assert/strict';
import {test} from 'node:test';
import {checkSchema} from '../../packages/doc-sync/src/crdt/schema.ts';
import {applyEdits, canonical} from '../../packages/doc-sync/src/crdt/model.ts';
import {DEFAULT_SEEDS, generateCase, generateCases, reproduce, exportReproducer, modelHash} from './fixtures.mjs';

function renameWalk(item, map) {
    if (typeof item === 'string') return map[item] ?? item;
    if (Array.isArray(item)) return item.map(child => renameWalk(child, map));
    if (item && typeof item === 'object') return Object.fromEntries(Object.entries(item).map(([key, child]) => [map[key] ?? key, renameWalk(child, map)]));
    return item;
}
function rename(value, names) {
    const map = Object.fromEntries(Object.values(names).map((name, i) => [name, `renamed_${i}`]));
    return renameWalk(value, map);
}

for (const seed of DEFAULT_SEEDS) {
    test(`seed ${seed}: schema, independent model closure and fixed paths`, () => {
        const f = generateCase(seed);
        assert.deepEqual(checkSchema(f.schema), []);
        assert.deepEqual(f.edits.map(e => e.at), [[1], [2], [2, 0, 0, 0, 1]]);
        let model = structuredClone(f.initialModel);
        f.edits.forEach((edit, i) => {
            model = applyEdits(f.schema, model, [edit]);
            assert.deepEqual(model, f.expectedModels[i]);
            assert.deepEqual(canonical(f.schema, model), model);
        });
        assert.equal(model.children[1].type, f.names.group);
        const grid = model.children[2];
        assert.equal(grid.type, f.names.grid);
        assert.equal(grid.children.length, f.dimensions.rows);
        assert.equal(grid.children[0].children.length, f.dimensions.cols);
        const body = grid.children[0].children[0].children[0];
        assert.equal(body.children[1].type, f.names.group);
        assert.match(JSON.stringify(model), /😀/u);
    });
    test(`seed ${seed}: exact serialized reproduction and isolated payloads`, () => {
        assert.deepEqual(reproduce(seed), generateCase(seed));
        const saved = JSON.parse(exportReproducer(seed));
        assert.equal(saved.expectedModelHash, modelHash(saved.expectedModel));
        assert.deepEqual(applyEdits(saved.schema, saved.initialModel, saved.edits), saved.expectedModel);
        assert.equal(exportReproducer(seed), exportReproducer(seed));
        const changed = generateCase(seed);
        changed.edits[0].content[0].children[0].runs[0].text = 'MUTATED';
        changed.schema.nodes[changed.names.cell].attrs[changed.names.meta].default[changed.names.label] = 'MUTATED';
        assert.notEqual(changed.groupModel.children[0].runs[0].text, 'MUTATED');
        assert.notEqual(changed.gridModel.children[0].children[0].attrs[changed.names.meta][changed.names.label], 'MUTATED');
        assert.deepEqual(generateCase(seed), reproduce(seed));
    });
    test(`seed ${seed}: descriptor renaming preserves model semantics`, () => {
        const f = generateCase(seed), schema = rename(f.schema, f.names);
        assert.deepEqual(checkSchema(schema), []);
        const expected = rename(f.expectedModel, f.names);
        assert.deepEqual(applyEdits(schema, rename(f.initialModel, f.names), rename(f.edits, f.names)), expected);
    });
}

test('bounded corpus has six distinct renamed schemas and all four grid dimensions', () => {
    const cases = generateCases();
    assert.equal(new Set(cases.map(f => f.schema.root)).size, 6);
    assert.equal(new Set(cases.map(f => `${f.dimensions.rows}x${f.dimensions.cols}`)).size, 4);
    assert.equal(generateCases(4).length, 4);
    assert.equal(generateCases(8).length, 8);
    for (const value of [-1, 1.5, 0x100000000, NaN]) assert.throws(() => generateCase(value), RangeError);
    for (const value of [0, 3, 9, 4.5]) assert.throws(() => generateCases(value), RangeError);
});
