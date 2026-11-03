import {createServer} from "node:http";

const write = process.stdout.write.bind(process.stdout);
let held = false;
process.stdout.write = function (chunk, encoding, callback) {
    const message = Buffer.isBuffer(chunk) ? chunk.toString("utf8") : String(chunk);
    const match = /http:\/\/localhost:(\d+)(?=\r?\n)/.exec(message);
    if (held || !match) return write(chunk, encoding, callback);
    held = true;
    const actualPort = Number(match[1]);
    const digits = match[1];
    const prefixPort = Number(digits.slice(0, -1));
    let decoyRequests = 0, decoyCollision = false, decoyAvailable = false, ownedCollision = false;
    const html = (_req, res) => {
        decoyRequests++;
        res.writeHead(200, {"content-type": "text/html"});
        res.end("<!DOCTYPE html><title>Owned incomplete-port decoy</title>");
    };
    const decoy = createServer(html);
    let released = false;
    const control = createServer((req, res) => {
        if (req.method === "POST" && req.url === "/release" && !released) {
            released = true;
            const suffix = digits.slice(-1) + message.slice(match.index + match[0].length);
            write(suffix);
        }
        res.writeHead(200, {"content-type": "application/json"});
        res.end(JSON.stringify({actualPort, prefixPort, decoyRequests, decoyAvailable, decoyCollision, ownedCollision, released}));
    });
    const fail = error => { process.stderr.write(`BANNER_GATE_ERROR ${error.stack}\n`, () => process.exit(1)); };
    const announce = () => control.listen(0, "127.0.0.1", () => {
        const controlPort = control.address().port;
        const prefix = message.slice(0, match.index) + `http://localhost:${prefixPort}`;
        write(prefix, () => {
            process.stderr.write(`BANNER_GATE ${JSON.stringify({actualPort, prefixPort, controlPort, decoyAvailable, decoyCollision, ownedCollision})}\n`);
        });
    });
    control.once("error", fail);
    decoy.once("error", error => {
        if (error.code !== "EADDRINUSE") { fail(error); return; }
        // An occupied prefix belongs to its listener. The held-banner proof does
        // not need to contact that origin, so the decoy can remain unavailable.
        decoyCollision = true;
        announce();
    });
    const bindDecoy = () => decoy.listen(prefixPort, "127.0.0.1", () => { decoyAvailable = true; announce(); });
    if (globalThis[Symbol.for("doc-sync.test.occupy-banner-prefix")]) {
        const occupied = createServer(html);
        occupied.once("error", error => { if (error.code === "EADDRINUSE") bindDecoy(); else fail(error); });
        occupied.listen(prefixPort, "127.0.0.1", () => { ownedCollision = true; bindDecoy(); });
    } else bindDecoy();
    const done = typeof encoding === "function" ? encoding : callback;
    done?.();
    return true;
};
