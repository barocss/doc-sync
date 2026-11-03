await import('./build.mjs');
const {createGraphicServer} = await import('./server.mjs');
const {server} = createGraphicServer();
const port = Number(process.env.GRAPHIC_PORT ?? 5420);
server.listen(port, '127.0.0.1', () => console.log(`Graphic demo (memory only): http://127.0.0.1:${server.address().port}`));
