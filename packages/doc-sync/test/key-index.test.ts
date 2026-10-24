import assert from "node:assert/strict";
import {test} from "node:test";
import {KeyIndex} from "../src/crdt/key-index.ts";

test("ID index matches Map for gaps, shuffled writes, replacement and unusual keys", () => {
    const index = new KeyIndex<object>();
    const reference = new Map<string, object>();
    const values = Array.from({length: 8}, () => ({}));
    const keys = ["x", "01@A", "-1@A", "NaN@A", "9007199254740992@A", "0@", "1@actor@slot", "9007199254740991@A"];
    for (const actor of ["A", "B", "~root", "A/path@slot"]) for (let i = 0; i < 1100; i++) keys.push(`${i}@${actor}`);
    let seed = 41;
    const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed; };
    for (let i = keys.length - 1; i > 0; i--) { const j = random() % (i + 1); [keys[i], keys[j]] = [keys[j], keys[i]]; }
    for (let pass = 0; pass < 3; pass++) for (const key of keys) {
        const value = values[random() % values.length];
        index.set(key, value); reference.set(key, value);
        assert.equal(index.get(key), value);
        assert.equal(index.size, reference.size);
    }
    for (const [key, value] of reference) assert.equal(index.get(key), value, key);
    for (const key of ["1101@A", "0@absent", "", "1@", "Infinity@A"]) assert.equal(index.has(key), reference.has(key), key);
    index.clear();
    assert.equal(index.size, 0);
    assert.equal(index.rangeCount, 0);
    for (const key of keys) assert.equal(index.get(key), undefined);
});

test("ID index bounds dense ranges and compresses constant tombstone aliases", () => {
    const index = new KeyIndex<object>();
    const values = Array.from({length: 100_000}, () => ({}));
    values.forEach((value, i) => index.set(`${i}@A`, value));
    assert.equal(index.size, values.length);
    assert.equal(index.rangeCount, Math.ceil(values.length / 256));
    values.forEach((value, i) => assert.equal(index.get(`${i}@A`), value));
    const alias = {};
    values.forEach((_, i) => index.set(`${i}@A`, alias));
    index.compact();
    assert.equal(index.denseCount, 0);
    for (let i = 0; i < values.length; i++) assert.equal(index.get(`${i}@A`), alias);
    const constant = new KeyIndex<object>();
    for (let i = 100_000; i >= 0; i--) constant.set(`${i}@A`, alias);
    assert.equal(constant.rangeCount, Math.ceil(100_001 / 256));
    assert.equal(constant.denseCount, 0);
    constant.set("512@A", values[0]);
    assert.equal(constant.get("512@A"), values[0]);
    assert.equal(constant.get("511@A"), alias);
    assert.equal(constant.get("513@A"), alias);
});

test("fragmented IDs use a numeric sparse index without range proliferation", () => {
    const index = new KeyIndex<object>(), value = {};
    for (let i = 0; i < 10_000; i++) index.set(`${i * 2}@A`, value);
    assert.equal(index.size, 10_000);
    assert.equal(index.rangeCount, 0);
    assert.equal(index.sparseCount, 10_000);
    for (let i = 0; i < 20_000; i++) assert.equal(index.get(`${i}@A`), i % 2 ? undefined : value);
});

test("range bridges preserve values on both sides and constant range expansion", () => {
    const index = new KeyIndex<object>();
    const values = Array.from({length: 63}, () => ({}));
    for (let i = 0; i < values.length; i += 2) index.set(`${i}@A`, values[i]);
    for (let i = 1; i < values.length; i += 2) index.set(`${i}@A`, values[i]);
    assert.equal(index.rangeCount, 1);
    values.forEach((value, i) => assert.equal(index.get(`${i}@A`), value));
    const same = {}, replacement = {};
    for (let i = 100; i < 150; i++) index.set(`${i}@B`, same);
    index.set("125@B", replacement);
    assert.equal(index.get("124@B"), same);
    assert.equal(index.get("125@B"), replacement);
    assert.equal(index.get("126@B"), same);
    index.set("125@B", same);
    index.compact();
    assert.equal(index.denseCount, 1); // A stays dense, B becomes constant again.
});
