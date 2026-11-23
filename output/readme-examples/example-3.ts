import {Editor} from "@tiptap/core";
import type {Schema} from "@barocss/doc-sync";
import {Client} from "@barocss/doc-sync/client";
import {DocSync, createTiptapExtensions} from "@barocss/doc-sync-tiptap";

const schema: Schema = {
    root: "content",
    marks: ["bold", "italic"],
    nodes: {
        content: {shape: "flow", children: ["paragraph"], default: "paragraph"},
        paragraph: {shape: "text"},
    },
};
const client = new Client({schema});
const editor = new Editor({
    element: document.querySelector("#editor")!,
    extensions: [
        ...createTiptapExtensions(schema),
        DocSync.configure({client}),
    ],
});
editor.commands.insertContent("Hello");
editor.commands.docSyncUndo();
editor.commands.docSyncRedo();

// On unmount:
function dispose() {
    editor.destroy();
    client.dispose(); // Only when the caller is finished with this client.
}

dispose();
