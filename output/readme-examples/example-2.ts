import type {Schema} from "@barocss/doc-sync";
import {Client} from "@barocss/doc-sync/client";
import {EditorView} from "prosemirror-view";
import {buildPmSchema, PmBinding} from "@barocss/doc-sync-prosemirror";

const schema: Schema = {
    root: "content",
    marks: ["bold", "italic"],
    nodes: {
        content: {shape: "flow", children: ["paragraph"], default: "paragraph"},
        paragraph: {shape: "text"},
    },
};
const client = new Client({schema});
const info = buildPmSchema(schema);
const binding = new PmBinding(client, info);
const view = new EditorView(document.querySelector("#editor"), {
    state: binding.state,
    dispatchTransaction: binding.dispatch,
});
binding.view = view;
binding.onChange = () => view.updateState(binding.state);

// On unmount, not immediately after mounting:
function dispose() {
    binding.dispose();
    view.destroy();
    client.dispose(); // Only if this application no longer uses the client.
}

dispose();
