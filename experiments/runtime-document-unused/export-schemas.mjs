import assert from 'node:assert/strict';
import {readFileSync, writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {WORD_SCHEMA, PRESENTATION_SCHEMA} from '../../fixtures/product-schemas.ts';
import {schemaVersion} from '../../packages/doc-sync/dist/crdt/schema-version.js';
const dir=fileURLToPath(new URL('.',import.meta.url));
const source=fileURLToPath(new URL('../../fixtures/product-schemas.ts',import.meta.url));
const schemas={word:WORD_SCHEMA,presentation:PRESENTATION_SCHEMA};
const encoded=JSON.stringify(schemas,null,2)+'\n';
const sha=x=>createHash('sha256').update(x).digest('hex');
const manifest={format:'doc-sync-original-product-schemas-v1',source:'fixtures/product-schemas.ts',sourceSha256:sha(readFileSync(source)),snapshotSha256:sha(encoded),schemas:Object.fromEntries(Object.entries(schemas).map(([name,schema])=>[name,{identity:schemaVersion(schema),sha256:sha(JSON.stringify(schema)),nodes:Object.keys(schema.nodes).length}]))};
if(process.argv.includes('--write')){writeFileSync(dir+'product-schemas.json',encoded);writeFileSync(dir+'product-schemas.manifest.json',JSON.stringify(manifest,null,2)+'\n');}
assert.equal(readFileSync(dir+'product-schemas.json','utf8'),encoded,'snapshots must equal original descriptors byte-for-byte JSON export');
assert.deepEqual(JSON.parse(readFileSync(dir+'product-schemas.manifest.json','utf8')),manifest,'manifest must describe exact source and snapshot');
console.log(JSON.stringify({status:'PASS',...manifest}));
