export const CLIENT_SCHEMA = {
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

export function seedEditsForSize(size = 'sample') {
    if (size === 'sample') return seedEdits();
    if (size !== 10000 && size !== 100000) throw Error('Unsupported document size');
    const paragraph = '0123456789'.repeat(10);
    return [{op: 'insert', at: [0], content: Array.from({length: size / 100}, () => ({type: 'paragraph', runs: [{text: paragraph}]}))},
        {op: 'delete', at: [size / 100], count: 1}];
}
