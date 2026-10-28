import {schemaVersion} from '@barocss/doc-sync';
import {PROTOCOL_VERSION} from '@barocss/doc-sync/sync';

const [origin, profile, doc] = process.argv.slice(2);
if (!origin || !['word', 'notion', 'presentation'].includes(profile) || !/^[a-z0-9-]{1,40}$/.test(doc ?? '')) {
    console.error('Usage: node apps/demo/products/transition-example.mjs <demo-origin> <word|notion|presentation> <document-id>');
    process.exitCode = 1;
} else {
    try {
        const base = `${origin.replace(/\/$/, '')}/profiles/${profile}/api/docs/${encodeURIComponent(doc)}`;
        const read = async path => {
            const response = await fetch(`${base}/${path}`);
            if (!response.ok) throw new Error(`Cannot read ${path}: HTTP ${response.status}`);
            return response.json();
        };
        const state = await read('state'), current = await read('schema');
        if (!current.schema || !current.schemaVersion || current.schemaVersion !== state.schemaVersion || schemaVersion(current.schema) !== current.schemaVersion) {
            throw new Error('Server schema changed while reading; inspect the document and try again');
        }
        if (current.schema.marks.includes('exampleReview')) {
            console.log(JSON.stringify({status: 'already-present', schemaVersion: current.schemaVersion}));
        } else {
            const next = structuredClone(current.schema);
            next.marks.push('exampleReview');
            const response = await fetch(`${base}/schema`, {
                method: 'POST',
                headers: {'content-type': 'application/json', 'x-doc-sync-protocol': String(PROTOCOL_VERSION), 'x-doc-sync-epoch': state.epoch, 'x-doc-sync-schema': state.schemaVersion},
                body: JSON.stringify({base: {epoch: state.epoch, serverSeq: state.serverSeq, schemaVersion: state.schemaVersion}, schema: next}),
            });
            if (!response.ok) throw new Error(`Transition not confirmed: HTTP ${response.status}. Read the server schema before retrying.`);
            const result = await response.json();
            if (result.schemaVersion !== schemaVersion(next)) throw new Error('Unexpected transition result; inspect the server schema before retrying');
            console.log(JSON.stringify({status: 'accepted', schemaVersion: result.schemaVersion}));
        }
    } catch (error) {
        console.error(error instanceof Error ? error.message : String(error));
        process.exitCode = 1;
    }
}
