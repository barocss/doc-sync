import type {AttrSpec, GraphicSchema} from "../crdt/schema.ts";

export const GRAPHIC_LIMITS = Object.freeze({coordinate: 1_000_000, dimension: 1_000_000, coefficient: 1_000_000, idLength: 512, depth: 64, nodes: 100_000});
export const GRAPHIC_ID_PATTERN = "^(?:|[1-9][0-9]{0,15}@[^\\u0000-\\u001f\\u007f]{1,494})$";
export const GRAPHIC_OVERRIDE_PROPERTIES = ["name", "visible", "locked", "opacity", "transform.a", "transform.b", "transform.c", "transform.d", "transform.e", "transform.f", "size.width", "size.height"] as const;
const number = (value: number = 0, min: number = -GRAPHIC_LIMITS.coordinate, max: number = GRAPHIC_LIMITS.coordinate): AttrSpec => ({default: value, min, max});
const flag = (value: boolean): AttrSpec => ({default: value, values: [true, false]});
const text = (max: number): AttrSpec => ({default: "", pattern: `^[^\\u0000-\\u001f\\u007f]{0,${max}}$`});
const enumeration = (values: readonly string[]): AttrSpec => ({default: values[0], values});
const fields = (children: Record<string, AttrSpec>): AttrSpec => ({default: Object.fromEntries(Object.entries(children).map(([key, spec]) => [key, spec.default])), fields: children});
const point = (): AttrSpec => fields({x: number(), y: number()});
const transform = (): AttrSpec => fields({a: number(1), b: number(), c: number(), d: number(1), e: number(), f: number()});
const reference = (): AttrSpec => ({default: "", pattern: GRAPHIC_ID_PATTERN});
const color = (): AttrSpec => ({default: "#000000", pattern: "^#[0-9a-fA-F]{6}(?:[0-9a-fA-F]{2})?$"});
const opacity = (): AttrSpec => number(1, 0, 1);
const common = (): Record<string, AttrSpec> => ({name: text(256), transform: transform(), size: fields({width: number(100, 0, GRAPHIC_LIMITS.dimension), height: number(100, 0, GRAPHIC_LIMITS.dimension)}), opacity: opacity(), visible: flag(true), locked: flag(false)});
const paint = (): Record<string, AttrSpec> => ({kind: enumeration(["solid", "linear-gradient", "radial-gradient", "image"]), color: color(), opacity: opacity(), visible: flag(true), imageRef: text(2048), start: point(), end: fields({x: number(1), y: number()}), imageTransform: transform()});
const objects = ["frame", "object-group", "rectangle", "ellipse", "label", "path", "component", "instance", "boolean"];
const appearance = ["paint", "stroke"];

/** Standard graphic data on the existing container/atom/text storage shapes.
 * Layout is intent data. Boolean operations are source-reference data. This schema
 * supplies neither a renderer, a layout engine nor a Boolean geometry solver.
 */
export const createGraphicSchema = (): GraphicSchema => ({
    domain: "graphic", root: "canvas", marks: ["bold", "italic"], nodes: {
        canvas: {shape: "container", children: [...objects]},
        frame: {shape: "container", children: [...objects, ...appearance], attrs: {...common(), clipContent: flag(false), layout: fields({mode: enumeration(["none", "horizontal", "vertical"]), gap: number(0, 0), padding: number(0, 0)})}},
        "object-group": {shape: "container", children: [...objects, ...appearance], attrs: common()},
        rectangle: {shape: "container", children: [...appearance], attrs: {...common(), cornerRadius: number(0, 0)}},
        ellipse: {shape: "container", children: [...appearance], attrs: common()},
        label: {shape: "text", attrs: {...common(), fontSize: number(16, 1, 10_000), fontFamily: {...text(256), default: "sans-serif"}}},
        path: {shape: "container", children: ["vertex", "segment", ...appearance], attrs: {...common(), closed: flag(false), fillRule: enumeration(["nonzero", "evenodd"])}},
        component: {shape: "container", children: [...objects, ...appearance], attrs: common()},
        instance: {shape: "container", children: ["instance-override", ...appearance], attrs: {...common(), componentId: reference()}},
        boolean: {shape: "container", children: ["source-ref", ...appearance], attrs: {...common(), operation: enumeration(["union", "subtract", "intersect", "exclude"])}},
        vertex: {shape: "atom", attrs: {x: number(), y: number(), handleIn: point(), handleOut: point()}},
        segment: {shape: "atom", attrs: {from: reference(), to: reference(), kind: enumeration(["line", "cubic"])}},
        paint: {shape: "container", children: ["gradient-stop"], attrs: paint()},
        "gradient-stop": {shape: "atom", attrs: {offset: number(0, 0, 1), color: color(), opacity: opacity()}},
        stroke: {shape: "container", children: ["gradient-stop"], attrs: {...paint(), width: number(1, 0), align: enumeration(["center", "inside", "outside"]), cap: enumeration(["butt", "round", "square"]), join: enumeration(["miter", "round", "bevel"]), miterLimit: number(4, 1, 1_000)}},
        "source-ref": {shape: "atom", attrs: {targetId: reference()}},
        // Existing atomic object storage, not a fields branch. Graphic helpers
        // validate the exact assignment payload; AttrSpec alone checks object type.
        "instance-override": {shape: "atom", attrs: {targetId: reference(), assignment: {default: {property: "name", value: ""}}}},
    },
});

const freeze = <T>(value: T): T => {
    if (value && typeof value === "object") { Object.values(value).forEach(freeze); Object.freeze(value); }
    return value;
};
/** Immutable shared standard; use the factory when a mutable schema object is needed. */
export const BUILTIN_GRAPHIC_SCHEMA: GraphicSchema = freeze(createGraphicSchema());
