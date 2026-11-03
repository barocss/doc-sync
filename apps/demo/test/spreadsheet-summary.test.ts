import {test} from 'node:test';
import assert from 'node:assert/strict';
import {SheetSession} from '../spreadsheet/session.ts';
test('status summary reads no cell ranges or pending operation copies and matches debug status',()=>{
 const session=new SheetSession('alice','summary');
 session.edit(0,0,{value:42,formula:'=6*7'});session.setHold(true);
 const readRange=session.sheet.getRange,readPending=session.sheet.pendingChanges,readCapture=session.sheet.captureState;
 let ranges=0,pendingCopies=0,captures=0;
 session.sheet.getRange=function(){ranges++;throw Error('Summary must not read the whole sheet');};
 session.sheet.pendingChanges=function(){pendingCopies++;throw Error('Summary must not copy pending operations');};
 session.sheet.captureState=function(){captures++;throw Error('Summary must not capture the whole model');};
 let summary;
 try{summary=session.summary();assert.equal(summary.pending,2);assert.equal(summary.stats.pending,2);assert.equal(summary.hold,true);assert.equal(summary.connected,false);assert.equal(ranges,0);assert.equal(pendingCopies,0);assert.equal(captures,0);}
 finally{session.sheet.getRange=readRange;session.sheet.pendingChanges=readPending;session.sheet.captureState=readCapture;}
 const {cells,...debugStatus}=session.snapshot();
 assert.deepEqual(summary,debugStatus);assert.deepEqual(cells,[{row:0,column:0,cell:{value:42,formula:'=6*7'}}]);
});
