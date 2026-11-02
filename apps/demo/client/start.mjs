import {startClientPreview} from './serve.mjs';
const preview = await startClientPreview({port: Number(process.env.CLIENT_DEMO_PORT ?? 0), write: true});
console.log(`Client static preview: ${preview.address}`);
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { void preview.close(); });
