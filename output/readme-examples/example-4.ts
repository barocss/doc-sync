import {createEditor} from "slate";
import type {Schema} from "@barocss/doc-sync";
import {Client} from "@barocss/doc-sync/client";
import {SlateBinding} from "@barocss/doc-sync-slate";

const schema: Schema = {
    root: "content",
    marks: ["bold", "italic"],
    nodes: {
        content: {shape: "flow", children: ["paragraph"], default: "paragraph"},
        paragraph: {shape: "text"},
    },
};
const client = new Client({schema});
const editor = createEditor();
const binding = new SlateBinding(client, editor, {
    onError: error => console.error(error),
});

// Inspect the initialized document without mounting a browser UI.
console.log(client.model(), editor.children);
binding.dispose();
client.dispose();
