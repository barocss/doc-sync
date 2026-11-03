import {test} from 'node:test';
import assert from 'node:assert/strict';
import {changedInspectorFields} from '../spreadsheet/inspector.ts';
import {SparseSheet} from '../../../experiments/sparse-sheet/src/sheet.ts';
test('a stale inspector changes only user-edited fields, preserving peer text and numeric types',()=>{
 const alice=new SparseSheet({actor:'alice',sheetId:'sheet',rows:100,columns:26});
 const bob=new SparseSheet({actor:'bob',sheetId:'sheet',rows:100,columns:26});
 bob.receive(alice.setCell(0,0,{value:42,formula:'=6*7',fill:'#ffffff',bold:false}));
 const baseline={value:'42',formula:'=6*7',fill:'#ffffff',bold:false};
 alice.receive(bob.setCell(0,0,{formula:'peer formula',fill:'#ff0000'}));
 alice.setCell(0,0,changedInspectorFields(baseline,{...baseline,bold:true}));
 assert.deepEqual(alice.getCell(0,0),{value:42,formula:'peer formula',fill:'#ff0000',bold:true});
 assert.deepEqual(changedInspectorFields(baseline,{...baseline}),{});
 assert.deepEqual(changedInspectorFields(baseline,{...baseline,formula:''}),{formula:null});
});
