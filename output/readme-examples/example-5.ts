import {createEditor} from "lexical";
import type {Schema} from "@barocss/doc-sync";
import {Client} from "@barocss/doc-sync/client";
import {buildLexicalSchema, LexicalBinding} from "@barocss/doc-sync-lexical";

const schema: Schema = {
    root: "content",
    marks: ["bold", "italic"],
    nodes: {
        content: {shape: "flow", children: ["paragraph"], default: "paragraph"},
        paragraph: {shape: "text"},
    },
};
const info = buildLexicalSchema(schema);
const editor = createEditor({
    namespace: "doc-sync-example",
    nodes: info.nodes,
    onError: error => { throw error; },
});
const client = new Client({schema});
const binding = new LexicalBinding(client, editor, {info});
console.log(client.model());
binding.dispose();
client.dispose();
