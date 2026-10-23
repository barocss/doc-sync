import {mkdirSync, writeFileSync} from "node:fs";
import {resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {Doc} from "@barocss/doc-sync";

const schema = {
    root: "content",
    marks: ["bold"],
    nodes: {
        content: {shape: "flow", children: ["paragraph", "table"], default: "paragraph"},
        paragraph: {shape: "text"},
        table: {shape: "grid", children: ["row"]},
        row: {shape: "row", children: ["cell"]},
        cell: {
            shape: "cell", children: ["body"],
            attrs: {
                rowspan: {default: 1, min: 1, computed: true},
                colspan: {default: 1, min: 1, computed: true},
                spanned: {default: false, computed: true},
            },
        },
        body: {shape: "flow", children: ["paragraph"], default: "paragraph"},
    },
};
const paragraph = text => ({type: "paragraph", runs: [{text, marks: {}}]});
const cell = text => ({type: "cell", children: [{type: "body", children: [paragraph(text)]}]});
const xml = value => String(value).replace(/[&<>"']/g, char => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;"})[char]);
const text = (x, y, value, attributes = "") => `<text x="${x}" y="${y}" ${attributes}>${xml(value)}</text>`;
const rect = (x, y, width, height, attributes = "") => `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="8" ${attributes}/>`;
const wrap = (value, length = 86) => {
    const lines = [];
    for (let offset = 0; offset < value.length; offset += length) lines.push(value.slice(offset, offset + length));
    return lines;
};
const operationText = operation => JSON.stringify(operation);

function svg(title, description, height, body) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="720" height="${height}" viewBox="0 0 720 ${height}" role="img" aria-labelledby="title description">
<title id="title">${xml(title)}</title>
<desc id="description">${xml(description)}</desc>
<style>text{font-family:system-ui,sans-serif;fill:#17243a;font-size:14px}.muted{fill:#526178}.mono{font-family:ui-monospace,monospace;font-size:11px}.heading{font-size:22px;font-weight:700}.label{font-size:12px;font-weight:600}.value{font-size:20px}.hidden{fill:#6b7280}</style>
<rect width="720" height="${height}" rx="12" fill="#f7f9fc"/>
<defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#2563eb"/></marker></defs>
${text(20, 34, title, 'class="heading"')}
${text(20, 58, "Computed with Doc.edit(); paths address the current model.", 'class="muted"')}
${body}
</svg>\n`;
}

function modelPanel(model, x, label, height) {
    let body = rect(x, 82, 282, height, 'fill="white" stroke="#cbd5e1"');
    body += text(x + 14, 108, `${label} · content []`, 'class="label"');
    model.children.forEach((node, index) => {
        const y = 122 + index * 70;
        const value = (node.runs ?? []).map(run => run.text ?? "").join("");
        const marks = [...new Set((node.runs ?? []).flatMap(run => Object.entries(run.marks ?? {}).filter(([, enabled]) => enabled).map(([key, value]) => `${key}: ${value}`)))];
        body += rect(x + 12, y, 258, 62, 'fill="#eff6ff" stroke="#dbeafe"');
        body += text(x + 22, y + 17, `${node.type} [${index}]`, 'class="mono"');
        body += text(x + 22, y + 41, value || "(empty)", `class="value"${marks.includes("bold: true") ? ' font-weight="700"' : ""}`);
        body += text(x + 248, y + 55, marks.join(", ") || "plain text", 'class="mono muted" text-anchor="end"');
    });
    return body;
}

function operationDiagram(name, trace) {
    const panelHeight = 54 + Math.max(trace.before.children.length, trace.after.children.length) * 70;
    const operationLines = wrap(operationText(trace.operation));
    const footer = 82 + panelHeight + 28;
    const height = footer + 32 + operationLines.length * 17;
    const middle = 82 + panelHeight / 2;
    const body = modelPanel(trace.before, 16, "Before", panelHeight) + modelPanel(trace.after, 422, "After", panelHeight)
        + text(360, middle - 16, name, 'class="label" text-anchor="middle"')
        + `<path d="M 310 ${middle} H 408" fill="none" stroke="#2563eb" stroke-width="2" marker-end="url(#arrow)"/>`
        + text(20, footer, "Applied operation", 'class="label"')
        + operationLines.map((line, index) => text(20, footer + 20 + index * 17, line, 'class="mono"')).join("");
    return svg(`${name}: before and after`, `Apply ${operationText(trace.operation)}. Read the before and after paragraph paths from the actual document models.`, height, body);
}

function tablePanel(model, x, label) {
    let body = rect(x, 82, 208, 254, 'fill="white" stroke="#cbd5e1"');
    body += text(x + 12, 108, label, 'class="label"');
    body += text(x + 12, 129, "table [1] · full model grid", 'class="mono muted"');
    const rows = model.children[1].children;
    rows.forEach((row, r) => row.children.forEach((item, c) => {
        const hidden = item.attrs?.spanned === true;
        const left = x + 12 + c * 92;
        const top = 143 + r * 83;
        const value = item.children[0].children.map(node => node.runs.map(run => run.text).join("")).join("");
        body += rect(left, top, 88, 79, hidden ? 'fill="#f1f5f9" stroke="#94a3b8" stroke-dasharray="4 3"' : 'fill="#eff6ff" stroke="#93c5fd"');
        body += text(left + 7, top + 17, `[1,${r},${c}]`, 'class="mono"');
        body += text(left + 7, top + 41, value, `class="value${hidden ? " hidden" : ""}"`);
        const span = item.attrs?.rowspan || item.attrs?.colspan;
        body += text(left + 7, top + 60, hidden ? "hidden" : span ? `span ${item.attrs.rowspan}×${item.attrs.colspan}` : "visible", 'class="mono muted"');
        if (hidden) body += text(left + 7, top + 73, "retained", 'class="mono muted"');
    }));
    return body;
}

function tableDiagram(trace) {
    const body = tablePanel(trace.before, 16, "Before: all four visible")
        + tablePanel(trace.merged, 256, "Merged: A spans 2×2")
        + tablePanel(trace.after, 496, "Restored: all four visible")
        + [229, 469].map(x => `<path d="M ${x} 205 H ${x + 21}" fill="none" stroke="#2563eb" stroke-width="2" marker-end="url(#arrow)"/>`).join("")
        + text(20, 364, "Merge: " + operationText(trace.operations[0]), 'class="mono"')
        + text(20, 388, "Restore: " + operationText(trace.operations[1]), 'class="mono"')
        + text(20, 418, "Content stays in its original cell. A span hides cells; it does not move their text.", 'class="label"');
    return svg("Table spans: hide and restore cells", "Actual models before a 2×2 span, after merging at [1,0,0], and after restoring 1×1. A remains in its cell. B, C, and D stay in their original cells, hidden but retained while merged.", 442, body);
}

function applyCase(name, initial, operation) {
    const doc = new Doc(`diagram-${name}`, schema);
    doc.edit([{op: "insert", at: [0, 0], content: initial[0]}]);
    if (initial.length > 1) doc.edit([{op: "insert", at: [1], content: initial.slice(1).map(paragraph)}]);
    const before = doc.toJSON();
    doc.edit([operation]);
    return {operation, before, after: doc.toJSON()};
}

export function generateDiagrams(targetDirectory = fileURLToPath(new URL("../src/public/diagrams/", import.meta.url))) {
    const traces = {
        insert: applyCase("insert", ["Hello", "World"], {op: "insert", at: [1], content: [paragraph("New")]}),
        delete: applyCase("delete", ["Hello", "New", "World"], {op: "delete", at: [1], count: 1}),
        update: applyCase("update", ["Hello"], {op: "update", at: [0, 0], length: 5, attrs: {bold: true}}),
        split: applyCase("split", ["HelloWorld"], {op: "split", at: [0, 5]}),
        merge: applyCase("merge", ["Hello", "World"], {op: "merge", at: [1]}),
    };
    const doc = new Doc("diagram-table-span", schema);
    const table = {type: "table", children: [
        {type: "row", children: [cell("A"), cell("B")]},
        {type: "row", children: [cell("C"), cell("D")]},
    ]};
    doc.edit([{op: "insert", at: [0], content: [paragraph("Hello"), table]}]);
    const before = doc.toJSON();
    const operations = [
        {op: "update", at: [1, 0, 0], attrs: {rowspan: 2, colspan: 2}},
        {op: "update", at: [1, 0, 0], attrs: {rowspan: 1, colspan: 1}},
    ];
    doc.edit([operations[0]]);
    const merged = doc.toJSON();
    doc.edit([operations[1]]);
    traces["table-span"] = {operations, before, merged, after: doc.toJSON()};

    mkdirSync(targetDirectory, {recursive: true});
    for (const [name, trace] of Object.entries(traces)) {
        writeFileSync(resolve(targetDirectory, `${name}.svg`), name === "table-span" ? tableDiagram(trace) : operationDiagram(name, trace));
    }
    writeFileSync(resolve(targetDirectory, "models.json"), JSON.stringify({schema, cases: traces}, null, 2) + "\n");
    return traces;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    generateDiagrams();
    console.log("Prepared 6 operation diagrams and their actual model trace.");
}
