import assert from "node:assert/strict";
import {test} from "node:test";
import {Doc, MAIN} from "../src/crdt/doc.ts";
import {canonical, runsToUnits, unitsToRuns} from "../src/crdt/model.ts";
import type {NodeJSON, Run} from "../src/crdt/model.ts";
import {DEMO_SCHEMA as schema} from "../../../fixtures/demo-schema.ts";
import "./harness.ts";

// The old character expansion remains an independent, exported model oracle.
test("text normalization matches the character-unit oracle for mixed runs and nested spans", () => {
    let seed=71;
    const random=(n:number) => {seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed%n;};
    const text=["", "a", "😀한", "e\u0301", "\ud83d", "\ude00", "\n", "long".repeat(100)];
    const marks=[{}, {bold:true}, {bold:false,italic:true}, {link:"https://a.test",underline:true}, {link:"https://b.test",strike:true}];
    const run=(depth:number):Run => {
        if(depth && random(4)===0) return {type:"inline-hyperlink",attrs:{url:random(2)?"https://a.test":"https://b.test"},runs:Array.from({length:random(5)},()=>run(depth-1))};
        if(random(5)===0) return {type:"inline-image",attrs:{src:"x",width:random(2)?null:200}};
        return {text:text[random(text.length)],marks:marks[random(marks.length)]};
    };
    for(let i=0;i<500;i++){
        const runs=Array.from({length:random(20)},()=>run(3));
        const expected=unitsToRuns(schema,runsToUnits(schema,runs));
        const doc:NodeJSON={type:"content",children:[{type:"paragraph",runs}]};
        const result=canonical(schema,doc);
        assert.deepEqual(result.children![0].runs,expected,`case ${i}`);
        assert.deepEqual(canonical(schema,result),result);
    }
});

test("chunk normalization retains rejection of a non-string text run", () => {
    assert.throws(() => canonical(schema, {type:"content",children:[{type:"paragraph",runs:[{text:17,marks:{}} as unknown as Run]}]}), TypeError);
});

test("one remote character updates one membership entry and leaves prior public blocks immutable", () => {
    const doc=new Doc("A",schema);
    doc.apply({t:"text",id:{lamport:1,actor:"A"},origin:{lamport:0,actor:"~root"},text:"a".repeat(10_000)});
    const before=doc.toJSON(), block=doc.textAt({b:0,o:0}), oldChars=block.chars;
    const cache=(doc as unknown as {blockCache:Map<string,{of:Map<unknown,unknown>}>}).blockCache.get(MAIN)!;
    const set=cache.of.set.bind(cache.of);let writes=0;
    cache.of.set=(k,v)=>{writes++;return set(k,v);};
    doc.apply({t:"text",id:{lamport:10_001,actor:"B"},origin:{lamport:5000,actor:"A"},text:"x"});
    assert.equal(writes,1,"unchanged character membership must not be rewritten");
    assert.equal(block.chars,oldChars);assert.equal(block.chars.length,10_000);
    assert.equal(block.text,"a".repeat(10_000));
    assert.notEqual(doc.textAt({b:0,o:0}),block);
    assert.deepEqual(doc.toJSON(),Doc.fromSnapshot("cold",doc.snapshot(),schema).toJSON());
    assert.equal(before.children![0].runs![0] && "text" in before.children![0].runs![0] ? before.children![0].runs![0].text.length : 0,10_000);
    // Formatting must invalidate the latest block reached through the shared reference.
    doc.apply({t:"set",at:{lamport:20_000,actor:"C"},ids:[{lamport:5001,actor:"A"}],key:"bold",value:true});
    assert.deepEqual(doc.toJSON(),Doc.fromSnapshot("cold",doc.snapshot(),schema).toJSON());
    doc.apply({t:"del",at:{lamport:20_001,actor:"C"},ids:[{lamport:10_001,actor:"B"}]});
    assert.deepEqual(doc.toJSON(),Doc.fromSnapshot("cold",doc.snapshot(),schema).toJSON());
});

test("equal object-valued spans retain distinct stored values during projection", () => {
    const objectSchema = {root:"content",marks:[],markValues:{ref:{default:null}},nodes:{content:{shape:"flow" as const,children:["paragraph"],default:"paragraph"},paragraph:{shape:"text" as const,children:["reference"]},reference:{shape:"span" as const,mark:"ref",attr:"value"}}};
    const doc=new Doc("A",objectSchema);
    doc.apply({t:"text",id:{lamport:1,actor:"A"},origin:{lamport:0,actor:"~root"},text:"ab",marks:{ref:{key:"same"}}});
    const units=doc.textAt({b:0,o:0}).chars.map(c=>({ch:c.ch,marks:doc.marksOf(c)}));
    const expected=unitsToRuns(objectSchema,runsToUnits(objectSchema,unitsToRuns(objectSchema,units)));
    assert.equal(expected.length,2);
    assert.deepEqual(doc.toJSON().children![0].runs,expected);
});

for (const reversed of [false,true]) test(`multiple span priorities match the unit oracle (${reversed})`, () => {
    const a={shape:"span" as const,mark:"a",attr:"value"}, b={shape:"span" as const,mark:"b",attr:"value"};
    const nodes={content:{shape:"flow" as const,children:["paragraph"],default:"paragraph"},paragraph:{shape:"text" as const,children:["sa","sb"]},...(reversed?{sb:b,sa:a}:{sa:a,sb:b})};
    const s={root:"content",marks:["bold"],markValues:{a:{default:null},b:{default:null}},nodes};
    const runs:Run[]=[{text:"😀a",marks:{a:"one",b:"two",bold:true}},{type:"sb",attrs:{value:"two"},runs:[{text:"b",marks:{a:"one"}},{type:"sa",attrs:{value:"three"},runs:[{text:"c",marks:{}}]}]},{text:"",marks:{a:"one"}}];
    assert.deepEqual(canonical(s,{type:"content",children:[{type:"paragraph",runs}]}).children![0].runs,unitsToRuns(s,runsToUnits(s,runs)));
});
