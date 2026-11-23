import assert from 'node:assert/strict';
import {Client} from '@barocss/doc-sync/client';
import type {Schema} from '@barocss/doc-sync';

const schema: Schema = {
    root: 'document',
    marks: ['bold'],
    nodes: {
        document: {shape: 'flow', children: ['paragraph'], default: 'paragraph'},
        paragraph: {shape: 'text'},
    },
};
const client = new Client({schema, actor: 'local-example'});
client.edit([{op: 'insert', at: [0, 0], content: 'Hello'}]);
const first = client.model().children?.[0]?.runs?.[0];
assert(first && 'text' in first);
assert.equal(first.text, 'Hello');
client.undo();
client.redo();
const saved = JSON.parse(JSON.stringify(client.captureState()));
const reopened = Client.fromState(saved, {schema});
assert.deepEqual(reopened.model(), client.model());
reopened.dispose();
client.dispose();
