import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {bundleLocalDemo} from './build.mjs';
export async function startLocalPreview({port = 0, write = false} = {}) {
    const bundle = await bundleLocalDemo({write});
    const [html, css] = await Promise.all([readFile(new URL('./index.html', import.meta.url)), readFile(new URL('./style.css', import.meta.url))]);
    const files = new Map([['/', ['text/html; charset=utf-8', html]], ['/index.html', ['text/html; charset=utf-8', html]],
        ['/style.css', ['text/css; charset=utf-8', css]],
        ['/metafile.json', ['application/json', JSON.stringify(bundle.metafile)]],
        ['/bundle-proof.json', ['application/json', JSON.stringify(bundle.proof)]]]);
    for (const output of bundle.outputFiles) files.set(output.path.endsWith('.map') ? '/bundle.js.map' : '/bundle.js', ['text/javascript; charset=utf-8', output.contents]);
    const server = createServer((req, res) => {
        res.setHeader('Cache-Control', 'no-store');
        res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'none'; img-src 'self' data:; object-src 'none'; base-uri 'none'");
        if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405, {Allow: 'GET, HEAD'}); res.end('Static assets only'); return; }
        const file = files.get(new URL(req.url ?? '/', 'http://localhost').pathname);
        if (!file) { res.writeHead(404); res.end('Not found'); return; }
        res.setHeader('Content-Type', file[0]); res.end(req.method === 'HEAD' ? undefined : file[1]);
    });
    await new Promise((done, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', done); });
    const address = `http://127.0.0.1:${server.address().port}`;
    return {server, address, bundle, close: () => new Promise((done, reject) => { server.close(error => error ? reject(error) : done()); server.closeAllConnections(); })};
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const preview = await startLocalPreview({port: Number(process.env.LOCAL_DEMO_PORT ?? 0), write: true});
    console.log(`Local static preview: ${preview.address}`);
    for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { void preview.close(); });
}
