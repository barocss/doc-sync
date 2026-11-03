import type {AttrSpec, GraphicSchema, NodeJSON} from "@barocss/doc-sync";

export type CanvasTransform = {x: number; y: number; rotation: number; scale: number};
export type CanvasSize = {width: number; height: number};
export type CanvasKind = "frame" | "object-group" | "rectangle" | "ellipse" | "label";

/** These are local attribute bounds. A nested world transform can exceed them. */
export const CANVAS_LIMITS = {
    position: 1_000_000,
    rotation: 360_000,
    minScale: 0.001,
    maxScale: 1_000,
    minSize: 1,
    maxSize: 100_000,
} as const;

export const CANVAS_DEFAULT_TRANSFORM: Readonly<CanvasTransform> = Object.freeze({x: 0, y: 0, rotation: 0, scale: 1});
export const CANVAS_DEFAULT_SIZE: Readonly<CanvasSize> = Object.freeze({width: 120, height: 80});

const commonAttrs = (): Record<string, AttrSpec> => ({
    name: {default: "", pattern: "^[^\\u0000-\\u001f\\u007f]{0,120}$"},
    transform: {
        default: {...CANVAS_DEFAULT_TRANSFORM},
        fields: {
            x: {default: 0, min: -CANVAS_LIMITS.position, max: CANVAS_LIMITS.position},
            y: {default: 0, min: -CANVAS_LIMITS.position, max: CANVAS_LIMITS.position},
            rotation: {default: 0, min: -CANVAS_LIMITS.rotation, max: CANVAS_LIMITS.rotation},
            scale: {default: 1, min: CANVAS_LIMITS.minScale, max: CANVAS_LIMITS.maxScale},
        },
    },
    size: {
        default: {...CANVAS_DEFAULT_SIZE},
        fields: {
            width: {default: CANVAS_DEFAULT_SIZE.width, min: CANVAS_LIMITS.minSize, max: CANVAS_LIMITS.maxSize},
            height: {default: CANVAS_DEFAULT_SIZE.height, min: CANVAS_LIMITS.minSize, max: CANVAS_LIMITS.maxSize},
        },
    },
    fill: {default: "#96B8FF", pattern: "^#[0-9a-fA-F]{6}$"},
    stroke: {default: "#345281", pattern: "^#[0-9a-fA-F]{6}$"},
    opacity: {default: 1, min: 0, max: 1},
    locked: {default: false, values: [true, false]},
});

const objectTypes: CanvasKind[] = ["frame", "object-group", "rectangle", "ellipse", "label"];

/** Stored containers differ from the document domain's computed group shape. */
export const CANVAS_SCHEMA: GraphicSchema = {
    domain: "graphic",
    root: "canvas",
    marks: [],
    nodes: {
        canvas: {shape: "container", children: objectTypes},
        frame: {shape: "container", children: objectTypes, attrs: {...commonAttrs(), clipContent: {default: true, values: [true, false]}}},
        "object-group": {shape: "container", children: objectTypes, attrs: commonAttrs()},
        rectangle: {shape: "atom", attrs: commonAttrs()},
        ellipse: {shape: "atom", attrs: commonAttrs()},
        label: {shape: "text", attrs: commonAttrs()},
    },
};

const object = (type: CanvasKind, name: string, transform: Partial<CanvasTransform>, size: CanvasSize, fill: string, children?: NodeJSON[], text?: string): NodeJSON => ({
    type,
    attrs: {name, transform: {...CANVAS_DEFAULT_TRANSFORM, ...transform}, size, fill},
    ...(children ? {children} : {}),
    ...(type === "label" ? {runs: text ? [{text, marks: {}}] : []} : {}),
});

/** Root JSON for insertion: insert CANVAS_SAMPLE.children into an empty Doc. */
export const CANVAS_SAMPLE: NodeJSON = {
    type: "canvas",
    children: [
        object("frame", "Design board", {x: 80, y: 70}, {width: 430, height: 330}, "#F1F4FA", [
            object("label", "Board title", {x: 24, y: 22}, {width: 300, height: 30}, "#24334D", undefined, "A shared canvas"),
            object("rectangle", "Blue card", {x: 30, y: 90, rotation: -8}, {width: 145, height: 100}, "#86B4FF"),
            object("object-group", "Rotated group", {x: 225, y: 115, rotation: 18, scale: 0.9}, {width: 160, height: 140}, "#E5EAF4", [
                object("ellipse", "Coral ellipse", {x: 10, y: 10}, {width: 110, height: 75}, "#FFA994"),
                object("label", "Group label", {x: 15, y: 100}, {width: 135, height: 28}, "#24334D", undefined, "Move us together"),
            ]),
        ]),
        object("frame", "Empty frame", {x: 565, y: 80, rotation: 6}, {width: 240, height: 190}, "#F6F0E4", []),
        object("object-group", "Empty group", {x: 600, y: 340, rotation: -12}, {width: 180, height: 100}, "#E5EAF4", []),
        object("ellipse", "Free ellipse", {x: 310, y: 470, rotation: -20}, {width: 160, height: 90}, "#B7DDC8"),
    ],
};

/** Exactly count stored objects; deterministic input for 100/1000/5000 tests. */
export function makeCanvasScene(count: number): NodeJSON {
    if (!Number.isSafeInteger(count) || count < 0 || count > 5_000) throw new RangeError("Canvas count must be an integer from 0 to 5000");
    const columns = 100;
    return {
        type: "canvas",
        children: Array.from({length: count}, (_, index) => object(
            index % 3 === 0 ? "ellipse" : "rectangle",
            `Object ${index + 1}`,
            {x: 20 + index % columns * 34, y: 20 + Math.floor(index / columns) * 30, rotation: index % 7 * 3},
            {width: 24, height: 20},
            ["#86B4FF", "#FFA994", "#B7DDC8"][index % 3],
        )),
    };
}
