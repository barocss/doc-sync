import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import {Doc, History} from '@barocss/doc-sync';

const schema = {root: 'content', marks: ['bold'], nodes: {
    content: {shape: 'flow', children: ['paragraph'], default: 'paragraph'},
    paragraph: {shape: 'text'},
}};
const value = doc => doc.toJSON().children[0].runs.map(run => run.text).join('');
test('visual guide concurrent insertion and own Undo match the engine', () => {
    const a = new Doc('diagram-A', schema);
    const b = Doc.fromSnapshot('diagram-B', a.snapshot(), schema);
    const history = new History();
    const ao = a.edit([{op: 'insert', at: [0, 0], content: 'A'}]).ops;
    history.record(ao, a, {caretBefore: 'before', caretAfter: 'after'});
    const bo = b.edit([{op: 'insert', at: [0, 0], content: 'B'}]).ops;
    assert.equal(value(a), 'A');
    assert.equal(value(b), 'B');
    bo.forEach(op => a.apply(op));
    ao.forEach(op => b.apply(op));
    assert.deepEqual(a.toJSON(), b.toJSON());
    assert.deepEqual([...value(a)].sort(), ['A', 'B']);
    history.undo(a).ops.forEach(op => b.apply(op));
    assert.equal(value(a), 'B');
    assert.deepEqual(a.toJSON(), b.toJSON());
});
test('engine guide figures have textual alternatives and no active/external content', () => {
    const guide = readFileSync(new URL('../src/guide/engine-visual-guide.md', import.meta.url), 'utf8');
    for (const name of ['schema', 'sync', 'concurrency', 'recovery']) {
        const svg = readFileSync(new URL(`../src/public/engine-diagrams/${name}.svg`, import.meta.url), 'utf8');
        assert.match(svg, /role="img" aria-labelledby="title desc"/);
        assert.match(svg, /<title id="title">[^<]+<\/title>/);
        assert.match(svg, /<desc id="desc">[^<]+<\/desc>/);
        assert.doesNotMatch(svg, /<script|<foreignObject|(?:href|src)=|\/Users\//);
        assert.ok(guide.includes(`/engine-diagrams/${name}.svg`));
    }
    assert.match(guide, /explanatory\nschematics/);
    assert.match(guide, /not automatic durable recovery/);
});
