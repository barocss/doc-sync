import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createEngineLab, modelText, LAB_STEPS} from '../src/components/engine-lab.mjs';

test('live lab uses real schema rejection, convergence, own Undo and reconnect', async () => {
    const lab = await createEngineLab();
    try {
        const states = [lab.snapshot()];
        for (let i = 1; i < LAB_STEPS.length; i++) states.push(await lab.next());
        assert.deepEqual(states.map(s => [...s.replicas.map(r => modelText(r.model)), modelText(s.hub.model)]), [
            ['', '', ''], ['', '', ''], ['A', '', ''], ['A', 'B', ''],
            ['BA', 'BA', 'BA'], ['B', 'BA', 'BA'], ['B', 'B', 'B'],
            ['B!', 'B?', 'B?'], ['B?!', 'B?!', 'B?!'],
        ]);
        assert.match(states[1].rejection, /table/);
        assert.deepEqual(states[1].replicas, states[0].replicas);
        assert.deepEqual(states[1].hub, states[0].hub);
        assert.deepEqual(states.map(s => s.replicas.map(r => r.pending.length)), [
            [0,0],[0,0],[1,0],[1,1],[0,0],[1,0],[0,0],[1,0],[0,0],
        ]);
        assert.deepEqual(states.map(s => s.hub.serverSeq), [0,0,0,0,2,2,3,4,5]);
        const boldA = states[4].replicas[1].model.children[0].runs.find(r => r.text === 'A');
        assert.equal(boldA.marks.bold, true);
        assert.equal(states[7].replicas[0].online, false);
        assert.equal(states[8].replicas[0].online, true);
        assert.deepEqual(states[8].replicas[0].model, states[8].hub.model);
        assert.deepEqual(await lab.next(), states[8], 'repeated Next at the end does not edit');
        // Earlier snapshots remain independent of later mutations.
        assert.equal(modelText(states[2].replicas[0].model), 'A');
        states[8].hub.model.children.length = 0;
        assert.equal(modelText(lab.snapshot().hub.model), 'B?!');
    } finally { lab.close(); }
});

test('closing a lab at any step and starting another keeps sessions isolated', async () => {
    for (let stop = 0; stop < LAB_STEPS.length; stop++) {
        const lab = await createEngineLab();
        for (let i = 0; i < stop; i++) await lab.next();
        lab.close(); lab.close();
        const afterClose = lab.snapshot();
        assert.deepEqual(await lab.next(), afterClose);
        const fresh = await createEngineLab();
        try {
            assert.equal(fresh.snapshot().index, 0);
            assert.deepEqual(fresh.snapshot().replicas.map(r => [modelText(r.model), r.pending.length]), [['',0],['',0]]);
        } finally { fresh.close(); }
    }
});
