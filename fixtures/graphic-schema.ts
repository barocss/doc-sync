import type {GraphicSchema, NodeJSON} from "../packages/doc-sync/src/index.ts";

/** A stored object hierarchy. Containers do not create text children. */
export const GRAPHIC_SCHEMA: GraphicSchema = {
    domain: "graphic", root: "canvas", marks: ["bold"], nodes: {
        canvas: {shape: "container", children: ["frame", "object-group", "shape", "label", "text-box"]},
        frame: {shape: "container", children: ["frame", "object-group", "shape", "label", "text-box"], attrs: {name: {default: ""}}},
        "object-group": {shape: "container", children: ["frame", "object-group", "shape", "label", "text-box"]},
        shape: {shape: "atom", attrs: {name: {default: ""}, position: {default: {x: 0, y: 0}, fields: {x: {default: 0}, y: {default: 0}}}}},
        label: {shape: "text"},
        "text-box": {shape: "flow", children: ["paragraph"], default: "paragraph"},
        paragraph: {shape: "text"},
    },
};

export const emptyCanvas = (): NodeJSON => ({type: "canvas", children: []});
export const graphicShape = (name: string): NodeJSON => ({type: "shape", attrs: {name, position: {x: 0, y: 0}}});
export const graphicLabel = (text: string): NodeJSON => ({type: "label", runs: text ? [{text, marks: {}}] : []});
export const graphicFrame = (children: NodeJSON[] = [], name = ""): NodeJSON => ({type: "frame", attrs: {name}, children});
export const graphicGroup = (children: NodeJSON[] = []): NodeJSON => ({type: "object-group", children});
