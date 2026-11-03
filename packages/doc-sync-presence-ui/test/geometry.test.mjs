import {test} from 'node:test';
import assert from 'node:assert/strict';
import {clipPresenceRect, createPresenceProjector} from '../dist/index.js';

test('viewport rects clip into container-local coordinates', () => {
  const bounds = {x: 100, y: 200, width: 80, height: 60};
  assert.deepEqual(clipPresenceRect({x: 90, y: 210, width: 30, height: 80}, bounds), {x: 0, y: 10, width: 20, height: 50});
  assert.equal(clipPresenceRect({x: 190, y: 210, width: 30, height: 20}, bounds), null);
  assert.equal(clipPresenceRect({x: NaN, y: 210, width: 30, height: 20}, bounds), null);
  assert.equal(clipPresenceRect({x: 100, y: 210, width: -1, height: 20}, bounds), null);
  assert.deepEqual(clipPresenceRect({x: 100, y: 210, width: 0, height: 20}, bounds), {x: 0, y: 10, width: 1, height: 20});
});

test('projection routes stable targets and hides unsupported or deleted targets', () => {
  const context = {actor: 'bot', role: 'cursor', state: {actor: 'bot', updatedAt: 1}};
  let received;
  const projector = createPresenceProjector({spreadsheet(target, ctx) {received = [target, ctx]; return null;}});
  const target = {kind: 'spreadsheet', sheetId: 's', rowId: 'stable-row', columnId: 'stable-column'};
  assert.equal(projector(target, context), null);
  assert.deepEqual(received, [target, context]);
  assert.equal(projector({kind: 'document', anchor: 'deleted'}, context), null);
  assert.equal(projector({kind: 'graphic', objectIds: ['hidden'], pointer: {x: 200, y: 300}}, context), null);
});
