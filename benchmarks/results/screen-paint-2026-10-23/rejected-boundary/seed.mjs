import {writeFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
const [root, data] = process.argv.slice(2);
const {Doc} = await import(pathToFileURL(`${root}/packages/doc-sync/src/index.ts`).href);
const {DEMO_SCHEMA} = await import(pathToFileURL(`${root}/fixtures/demo-schema.ts`).href);
const p = text => ({type: 'paragraph', runs: [{text, marks: {}}]});
const cell = (text, backgroundColor = '') => ({type: 'table-cell', attrs: {backgroundColor}, children: [{type: 'table-cell-body', children: [p(text)]}]});
const svg = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="120" height="60"><rect width="120" height="60" fill="#93c5fd"/></svg>');
const content = [p('FIRST paragraph before the long name boundary.'), p('SECOND paragraph: forward reverse overlap selection abcdefghijklmnopqrstuvwxyz '.repeat(3)),
    {type: 'heading1', runs: [{text: 'Heading hit test abcdefghijklmnopqrstuvwxyz', marks: {}}]},
    {type: 'quote', runs: [{text: 'Quote wrapped line abcdefghijklmnopqrstuvwxyz '.repeat(8), marks: {}}]},
    {type: 'list', attrs: {listType: 'bullet'}, children: [{type: 'list-item', attrs: {level: 0}, runs: [{text: 'List item abcdefghijklmnopqrstuvwxyz', marks: {}}]}]},
    {type: 'table', children: [{type: 'table-row', children: [cell('cell-left abcdefghijklmnopqrstuvwxyz '.repeat(5)), cell('COLORED-NEIGHBOR visible text abcdefghijklmnopqrstuvwxyz '.repeat(5), '#fef3c7')]}, {type: 'table-row', children: [cell('cell-bottom-left'), cell('cell-bottom-right')]}]},
    {type: 'callout', attrs: {tone: 'info'}, children: [p('Callout first abcdefghijklmnopqrstuvwxyz'), p('Callout second')]},
    {type: 'image-component', children: [{type: 'image', runs: [{type: 'inline-image', attrs: {src: svg, width: 120, height: 60}}]}]},
    p('Wrapped paragraph abcdefghijklmnopqrstuvwxyz '.repeat(20)),
    ...Array.from({length: 80}, (_, i) => p(`offscreen-${i}-` + 'abcdefghijklmnopqrstuvwx'.repeat(5))), p('END final paragraph')];
const doc = new Doc('boundary-seed', DEMO_SCHEMA);
const {ops} = doc.edit([{op: 'delete', at: [0], count: 1}, {op: 'insert', at: [0], content}]);
writeFileSync(`${data}/boundary.jsonl`, JSON.stringify({change: {actor: 'boundary-seed', seq: 1, ops}}) + '\n', {flag: 'wx'});
