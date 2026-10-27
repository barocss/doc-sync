import assert from "node:assert/strict";
import {test} from "node:test";
import {HttpTransport} from "../src/sync/http-transport.ts";

test("browser transport carries its configured schema version on every request", async () => {
    const originalSource = Object.getOwnPropertyDescriptor(globalThis, "EventSource");
    const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator");
    const originalFetch = globalThis.fetch;
    class Source {
        static instances: Source[] = [];
        onmessage: ((event: {data: string}) => void) | null = null;
        readonly url: string;
        constructor(url: string) { this.url = url; Source.instances.push(this); }
        close() {}
    }
    const requests: Array<{url: string; headers: Headers}> = [];
    const beacons: string[] = [];
    Object.defineProperty(globalThis, "EventSource", {configurable: true, value: Source});
    Object.defineProperty(globalThis, "navigator", {configurable: true, value: {sendBeacon: (url: string) => { beacons.push(url); return true; }}});
    globalThis.fetch = async (url, options) => { requests.push({url: String(url), headers: new Headers(options?.headers)}); return new Response("{}"); };
    try {
        const transport = new HttpTransport("doc", "actor", "http://example.test");
        const stop = transport.subscribe(1, () => {}, "epoch", "schema-v1");
        assert.equal(new URL(Source.instances[0].url).searchParams.get("schemaVersion"), "schema-v1");
        Source.instances[0].onmessage!({data: JSON.stringify({type: "schema", schemaVersion: "schema-v2"})});
        await transport.send({kind: "change", change: {actor: "actor", seq: 1, ops: []}});
        await transport.send({kind: "ack", ack: {actor: "actor", serverSeq: 1, pin: null}});
        transport.sendPresence({actor: "actor", name: "A", color: "blue", anchor: null, focus: null});
        transport.leave();
        assert.equal(requests.length, 3);
        assert.ok(requests.every(request => request.headers.get("x-doc-sync-schema") === "schema-v1"), "a schema event must not silently adopt a new version");
        assert.equal(new URL(beacons[0]).searchParams.get("schemaVersion"), "schema-v1");
        stop();

        const stopLegacy = transport.subscribe(1, () => {}, "epoch");
        await transport.send({kind: "ack", ack: {actor: "actor", serverSeq: 1, pin: null}});
        assert.equal(new URL(Source.instances[1].url).searchParams.has("schemaVersion"), false);
        assert.equal(requests[3].headers.has("x-doc-sync-schema"), false);
        stopLegacy();
    } finally {
        globalThis.fetch = originalFetch;
        if (originalSource) Object.defineProperty(globalThis, "EventSource", originalSource); else Reflect.deleteProperty(globalThis, "EventSource");
        if (originalNavigator) Object.defineProperty(globalThis, "navigator", originalNavigator); else Reflect.deleteProperty(globalThis, "navigator");
    }
});
