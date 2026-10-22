import assert from 'node:assert/strict';
import {SyncClient} from '@barocss/doc-sync/sync';
import {DocHub} from '@barocss/doc-sync/server';
import {schema} from './model.mjs';
// The submitted pending edit can already be present in the first reconnect snapshot.
const hub=new DocHub({schema});
const transport={subscribe(_since,receive){receive(hub.hello(0));return()=>{};},async send(){}};
const client=new SyncClient('offline-peer',transport,{schema});
client.commit(client.doc.edit([{op:'insert',at:[0,0],content:'한글'}]).ops);
hub.submit(client.pending[0]);
client.connect();
try{
  assert.deepEqual(client.doc.toJSON(),hub.doc.toJSON());
  assert.equal(client.pending.length,0);
  assert.equal(client.serverSeq,hub.serverSeq);
  console.log(JSON.stringify({status:'regression-passed',server:hub.doc.toJSON(),client:client.doc.toJSON(),pending:client.pending.length,serverSeq:client.serverSeq},null,2));
}finally{client.disconnect();}
