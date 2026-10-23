import assert from "node:assert/strict";
import {test} from "node:test";
import {Clock} from "../src/crdt/ticket.ts";

test("clock exhaustion fails before repeating or rounding an identity", () => {
    const clock = new Clock("A");
    clock.lamport = Number.MAX_SAFE_INTEGER - 1;
    assert.deepEqual(clock.next(), {lamport: Number.MAX_SAFE_INTEGER, actor: "A"});
    assert.throws(() => clock.next(), /safe integer range/);
    assert.equal(clock.lamport, Number.MAX_SAFE_INTEGER);
    assert.throws(() => clock.next(), /safe integer range/);
});

test("a corrupted clock never emits a fractional, nonfinite or negative identity", () => {
    for (const value of [Infinity, NaN, -1, 0.5, Number.MAX_SAFE_INTEGER + 1]) {
        const clock = new Clock("A"); clock.lamport = value;
        assert.throws(() => clock.next(), /safe integer range/);
        assert.ok(Object.is(clock.lamport, value));
    }
});
