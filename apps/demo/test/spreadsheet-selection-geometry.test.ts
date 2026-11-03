import {test} from 'node:test';
import assert from 'node:assert/strict';
import {selectionOutline,selectionLanes} from '../spreadsheet/selection-geometry.ts';
const window={row:0,column:0,rows:100,columns:26};
const rect=(col:number,row:number)=>({left:56+(col-1)*100,right:56+col*100,top:30+(row-1)*28,bottom:30+row*28});
test('a rectangle uses only its outer edges and includes VTable header offsets',()=>{
 assert.equal(selectionOutline({row:0,column:0,endRow:1,endColumn:1},window,rect),'M57,31H255 M255,31V85 M255,85H57 M57,85V31');
});
test('adjacent selections have separate full outlines inside their own cells',()=>{
 assert.equal(selectionOutline({row:0,column:0,endRow:0,endColumn:0},window,rect),'M57,31H155 M155,31V57 M155,57H57 M57,57V31');
 assert.equal(selectionOutline({row:0,column:1,endRow:0,endColumn:1},window,rect),'M157,31H255 M255,31V57 M255,57H157 M157,57V31');
});
test('crossing stable endpoints draw the same rectangle',()=>{
 assert.equal(selectionOutline({row:2,column:3,endRow:0,endColumn:1},window,rect),selectionOutline({row:0,column:1,endRow:2,endColumn:3},window,rect));
});
test('a window intersection does not invent edges where the original range continues',()=>{
 assert.equal(selectionOutline({row:0,column:0,endRow:2,endColumn:2},{row:1,column:1,rows:2,columns:2},rect),'M255,31V85 M255,85H57');
 assert.equal(selectionOutline({row:0,column:0,endRow:999999,endColumn:99999},{row:1,column:1,rows:2,columns:2},rect),null);
});
test('huge ranges use two authoritative rectangles, with no logical cell traversal',()=>{
 let calls=0;
 const path=selectionOutline({row:0,column:0,endRow:1048575,endColumn:16383},window,(col,row)=>{calls++;return rect(col,row);});
 assert.equal(calls,2);assert.equal(path,'M57,31H2655 M57,2829V31');
 assert.equal(selectionOutline({row:-1,column:0,endRow:0,endColumn:0},window,rect),null);
 assert.equal(selectionOutline({row:100,column:0,endRow:100,endColumn:0},window,rect),null);
});

test('coincident actors use deterministic distinct paths independent of unrelated peers',()=>{
 const range={row:0,column:0,endRow:0,endColumn:0};
 const entries=[{actor:'bob',range},{actor:'alice',range:{...range,row:range.endRow,endRow:range.row}}];
 const lanes=selectionLanes(entries);
 assert.deepEqual(lanes.map(lane=>lane.inset),[3,1]);
 assert.notEqual(selectionOutline(range,window,rect,lanes[0]!.inset),selectionOutline(range,window,rect,lanes[1]!.inset));
 assert.deepEqual(selectionLanes([...entries,{actor:'aardvark',range:{...range,column:1,endColumn:1}}]).slice(0,2),lanes);
});
test('overflow coincidences share a bounded inner lane with distinct dash phases',()=>{
 const range={row:0,column:0,endRow:0,endColumn:0};
 const lanes=selectionLanes(['d','b','e','a','c'].map(actor=>({actor,range})));
 assert.deepEqual(lanes.map(lane=>lane.inset),[5,3,5,1,5]);
 const inner=lanes.filter(lane=>lane.inset===5);
 assert.deepEqual(inner.map(lane=>lane.dashArray),['2 4','2 4','2 4']);
 assert.equal(new Set(inner.map(lane=>lane.dashOffset)).size,3);
 assert.equal(selectionOutline(range,window,()=>({left:0,top:0,right:8,bottom:8}),5),null);
 assert.equal(selectionOutline(range,window,()=>({left:0,top:0,right:NaN,bottom:28}),1),null);
});
