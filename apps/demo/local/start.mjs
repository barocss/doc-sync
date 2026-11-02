import {startLocalPreview} from './serve.mjs';
const preview = await startLocalPreview({port: Number(process.env.LOCAL_DEMO_PORT ?? 0), write: true});
console.log(`Local static preview: ${preview.address}`);
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { void preview.close(); });
