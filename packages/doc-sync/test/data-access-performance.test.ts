import assert from "node:assert/strict";
import {test} from "node:test";
import {DocHub} from "../src/server/hub.ts";
import {Client} from "../src/client/index.ts";
import {createDataSchema} from "../src/data/index.ts";

function fixture() {
    const client = new Client({schema: createDataSchema()});
    const list = client.data.createList(), map = client.data.createMap();
    const values = [null, false, 3, "text", map, list] as const;
    const ids = values.map(value => list.push(value));
    for (const [i, key] of ["", "__proto__", "한글", "constructor"].entries()) map.set(key, values[i]);
    return {client, list, map, values, ids};
}

test("list at preserves native Array.at coercion and returns independent entry wrappers", () => {
    const {client, list, values, ids} = fixture();
    try {
        for (const input of [0, -0, 1.9, -1.9, NaN, Infinity, -Infinity, 6, -7, undefined, null, "2", {valueOf: () => -1}]) {
            const expected = ids.map((id, i) => ({id, value: values[i]})).at(input as number);
            const actual = list.at(input as number);
            assert.deepEqual(actual, expected);
            if (actual) assert.equal(actual.value, expected!.value);
        }
        assert.throws(() => list.at(1n as never), TypeError);
        assert.throws(() => list.at(Symbol() as never), TypeError);
        const first = list.at(0)!; first.value = "mutated";
        assert.deepEqual(list.at(0), {id: ids[0], value: null});
        assert.ok(Object.isFrozen(list)); assert.ok(Object.isFrozen(list.owner.children(list.id, "list")));
        assert.ok(Object.isFrozen(list.owner.children(list.id, "list")[0].node));
    } finally {client.dispose();}
});

test("cached reads decode only a selected list value and no map values", () => {
    const {client, list, map, values} = fixture();
    const owner = list.owner, decode = owner.decode;
    let reads = 0;
    try {
        // Instrument the actual decoder; do not duplicate its implementation.
        owner.decode = function(item) {reads++; return decode.call(this, item);};
        for (let i=0; i<values.length; i++) {
            reads=0; assert.equal(list.at(i)?.value, values[i]); assert.equal(reads, 1);
        }
        reads=0; assert.equal(list.at(99), undefined); assert.equal(reads, 0);
        assert.equal(map.size, 4); assert.equal(reads, 0);
        map.delete(""); assert.equal(map.size, 3); client.undo(); assert.equal(map.size, 4);
        list.delete(list.at(0)!.id); assert.equal(list.at(0)!.value, false);
        client.undo(); assert.equal(list.at(0)!.value, null);
    } finally {owner.decode=decode; client.dispose();}
});

test("map size counts unique keys and stale collections still reject optimized reads", () => {
    const {client, list, map} = fixture();
    try {
        const parent = map.owner.collection(map.id, "map");
        client.edit([{op:"insert",at:[...parent.path, 0],content:[{type:"entry",attrs:{
            id:`data:${crypto.randomUUID()}`,key:"",value:{scalar:99},
        }}]}]);
        assert.equal(map.size,4); assert.equal(map.size,map.entries().length);
        const listPath = list.owner.collection(list.id,"list").path;
        client.edit([{op:"delete",at:listPath,count:1}]);
        assert.throws(()=>list.at(0),/not visible/);
        const mapPath = map.owner.collection(map.id,"map").path;
        client.edit([{op:"delete",at:mapPath,count:1}]);
        assert.throws(()=>map.size,/not visible/);
    } finally {client.dispose();}
});

test("optimized reads reject a changed schema even with a cached projection", async () => {
    const schema=createDataSchema(), hub=new DocHub({schema});
    const client = new Client({actor:"data-test",schema,transport:{
        subscribe(since, receive, epoch) {receive(hub.hello(since,epoch)); return hub.listen(receive);},
        async send(message) {if (message.kind === "change") hub.submit(message.change); else hub.ack(message.ack);},
        sendPresence() {},
    }});
    client.connect();
    try {
        const map=client.data.createMap(), list=client.data.createList();
        map.set("key",1); list.push(2);
        assert.equal(map.size,1); assert.equal(list.at(0)?.value,2);
        client.clearHistory();
        for (let n=0; n<20; n++) await Promise.resolve();
        const next=createDataSchema(); next.nodes.unused={shape:"atom"};
        client.sync!.upgradeSchema(next);
        assert.throws(()=>map.size,/createDataSchema|schema/);
        assert.throws(()=>list.at(0),/createDataSchema|schema/);
    } finally {client.clearHistory(); client.dispose();}
});

test("size and indexed reads retain hidden graph references without making them visible", () => {
    const {client, list, map} = fixture();
    try {
        client.edit([{op:"delete",at:map.owner.collection(map.id,"map").path,count:1}]);
        assert.equal(list.at(4)?.value,map);
        assert.equal(list.at(5)?.value,list);
        assert.throws(()=>map.size,/not visible/);
        assert.equal(client.data.getMap(map.id),undefined);
        client.undo(); assert.equal(map.size,4);
        assert.equal(list.at(4)?.value,map);
    } finally {client.dispose();}
});
