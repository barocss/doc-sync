import {test} from "node:test";
import assert from "node:assert/strict";
import {createServer} from "node:http";
import {once} from "node:events";
import {creatorClient} from "../src/proposal-client.ts";
test("creator client blocks raw and JSON-escaped bearer reflection",async()=>{
 const token="z".repeat(43); let escaped=false;
 const server=createServer((_req,res)=>{res.setHeader("content-type","application/json");res.end(escaped?' {"text":"'+Array.from(token).map(()=>"\\u007a").join('')+'"}':JSON.stringify({text:token}));});
 server.listen(0,"127.0.0.1"); await once(server,"listening");const address=server.address();assert.ok(address&&typeof address!=="string");
 try{const c=creatorClient(`http://127.0.0.1:${address.port}/mcp/t/d/s`,token);await assert.rejects(c.readTarget([0]),/Invalid creator response/);escaped=true;await assert.rejects(c.readTarget([0]),/Invalid creator response/);}finally{server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));}
});
