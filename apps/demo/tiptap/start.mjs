import {build} from 'esbuild';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
const bundled = await build({entryPoints: [new URL('./main.ts', import.meta.url).pathname], bundle: true, write: false, format: 'esm', platform: 'browser', define: {'process.env.NODE_ENV': '"development"'}});
const html = await readFile(new URL('./index.html', import.meta.url));
const server = createServer((req, res) => {
    const pathname = new URL(req.url ?? '/', 'http://localhost').pathname;
    if (pathname === '/bundle.js') { res.setHeader('Content-Type', 'text/javascript'); res.end(bundled.outputFiles[0].contents); }
    else if (pathname === '/' || pathname === '/index.html') { res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end(html); }
    else { res.statusCode = 404; res.end('Not found'); }
});
server.listen(Number(process.env.TIPTAP_PORT ?? 0), '127.0.0.1', () => console.log(`Tiptap demo: http://127.0.0.1:${server.address().port}`));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close());
