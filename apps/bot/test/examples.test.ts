import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {test} from 'node:test';

type Node = {type:string; children?:Node[]; runs?:Array<{text?:string}>};
const load=async(name:string):Promise<Node>=>JSON.parse(await readFile(new URL(`../examples/${name}.json`,import.meta.url),'utf8')) as Node;
const text=(node:Node)=>node.runs?.map(run=>run.text??'').join('')??'';
test('recorded bot examples retain their requested document structures',async()=>{
 const word=await load('word');assert.equal(word.type,'word-document');
 const section=word.children!.find(node=>node.type==='section')!;assert.ok(section);
 assert.ok(section.children!.some(node=>node.type==='heading2'&&text(node)==='Project plan'));
 const table=section.children!.filter(node=>node.type==='table').at(-1)!;
 assert.deepEqual(table.children!.map(row=>row.children!.map(cell=>text(cell.children![0].children![0]))),[['Phase','Owner'],['Design','Team']]);
 assert.ok(section.children!.some(node=>node.type==='header'));assert.ok(section.children!.some(node=>node.type==='footer'));
 const notion=await load('notion');assert.equal(notion.type,'notion-page');
 assert.ok(notion.children!.some(node=>node.type==='heading2'&&text(node)==='Launch checklist'));
 assert.ok(notion.children!.some(node=>node.type==='task'&&text(node)==='Review the draft'));
 const presentation=await load('presentation');assert.equal(presentation.type,'presentation');
 const slide=presentation.children!.find(node=>node.type==='slide')!;
 assert.ok(slide.children!.some(node=>node.type==='title'&&text(node)==='Project overview'));
 assert.ok(slide.children!.some(node=>node.type==='text-box'&&node.children?.some(child=>text(child)==='Next steps')));
 assert.ok(slide.children!.some(node=>node.type==='notes'));
});
