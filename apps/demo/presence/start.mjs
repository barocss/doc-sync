import {startPresencePreview} from './serve.mjs';
const preview=await startPresencePreview({port:Number(process.env.PRESENCE_PORT??0),write:true});
console.log(`Presence components demo (memory transport): ${preview.address}`);
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>void preview.close());
