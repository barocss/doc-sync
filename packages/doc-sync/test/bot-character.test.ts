import assert from "node:assert/strict";
import {test} from "node:test";
import {botFace} from "@barocss/doc-sync/sync";

test("bot faces are distinct by character and reflect the reported work state", () => {
    assert.equal(botFace("fox", "thinking"), "🦊 🤔");
    assert.equal(botFace("fox", "editing"), "🦊 😐");
    assert.notEqual(botFace("cat", "happy"), botFace("owl", "happy"));
    assert.equal(botFace("<script>", "happy"), null);
    assert.equal(botFace("cat", "unknown"), null);
});

test("round mascots retain four distinct palettes and seven readable expressions", async () => {
    const {createBotAvatar} = await import("@barocss/doc-sync/sync");
    const saved = globalThis.document;
    const elements: Array<{innerHTML: string}> = [];
    const fake = {
        createElement: () => ({className: "", dataset: {}, setAttribute() {}, append() {}}),
        createElementNS: () => {const element = {innerHTML: "", setAttribute() {}}; elements.push(element); return element;},
    };
    globalThis.document = fake as unknown as Document;
    try {
        const characters = ["cat", "fox", "owl", "robot"] as const;
        const expressions = ["thinking", "editing", "happy", "concerned", "curious", "focused", "surprised"] as const;
        for (const character of characters) for (const expression of expressions) createBotAvatar(character, expression);
        assert.equal(elements.length, 28);
        for (const element of elements) {
            assert.match(element.innerHTML, /^<circle cx="20" cy="20" r="17"/);
            assert.match(element.innerHTML, /class="bot-eyes"/);
        }
        assert.equal(new Set(characters.map((_, index) => elements[index * expressions.length].innerHTML.match(/fill="(#[0-9a-f]+)"/)?.[1])).size, 4);
        assert.equal(new Set(elements.slice(0, expressions.length).map(element => element.innerHTML)).size, expressions.length);
    } finally { globalThis.document = saved; }
});
