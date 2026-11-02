export const LOCAL_SCHEMA = {
    root: 'content', marks: ['bold', 'italic', 'underline'],
    nodes: {
        content: {shape: 'flow', children: ['paragraph', 'heading'], default: 'paragraph'},
        paragraph: {shape: 'text'}, heading: {shape: 'text', next: 'paragraph'},
    },
};
export const SEED_TEXT = 'Edit this document.';
export function seedEdits() {
    return [{op: 'insert', at: [0, 0], content: SEED_TEXT},
        {op: 'split', at: [0, SEED_TEXT.length]},
        {op: 'insert', at: [1, 0], content: 'Keep your notes here.'},
        {op: 'update', at: [1, 0], length: 4, attrs: {bold: true}}];
}
export function textOf(model) {
    return (model.children ?? []).map(node => (node.runs ?? []).map(run => 'text' in run ? run.text : '').join('')).join('\n');
}

// The textarea shares only this explicit plain-text schema. Rich samples stay separate.
export const SHARED_SCHEMA = {
    root: 'content', marks: [],
    nodes: {
        content: {shape: 'flow', children: ['paragraph'], default: 'paragraph'},
        paragraph: {shape: 'text'},
    },
};
export function sharedSeedEdits() {
    return [{op: 'insert', at: [0, 0], content: SEED_TEXT},
        {op: 'split', at: [0, SEED_TEXT.length]},
        {op: 'insert', at: [1, 0], content: 'Keep your notes here.'}];
}
