import type {NodeJSON} from "../crdt/model.ts";

/** Local-to-parent affine matrix: x' = a*x + c*y + e; y' = b*x + d*y + f.
 * Nonuniform scale, reflection and shear are supported. Singular matrices are valid data.
 */
export type GraphicTransform = {a: number; b: number; c: number; d: number; e: number; f: number};
export type GraphicPoint = {x: number; y: number};
export type GraphicId = string;
export type GraphicReference = {targetId: GraphicId};
export type GraphicLayout = {mode: "none" | "horizontal" | "vertical"; gap: number; padding: number};
export type GraphicObjectAttrs = {
    name: string; transform: GraphicTransform; size: {width: number; height: number};
    opacity: number; visible: boolean; locked: boolean;
};
export type GraphicPaintAttrs = {
    kind: "solid" | "linear-gradient" | "radial-gradient" | "image";
    color: string; opacity: number; visible: boolean; imageRef: string;
    start: GraphicPoint; end: GraphicPoint; imageTransform: GraphicTransform;
};
/** Each record addresses one property on one stable object. No whole-instance JSON map. */
export type GraphicOverrideProperty = "name" | "visible" | "locked" | "opacity" | "transform.a" | "transform.b" | "transform.c" | "transform.d" | "transform.e" | "transform.f" | "size.width" | "size.height";
export type GraphicOverrideValue<P extends GraphicOverrideProperty> = P extends "name" ? string : P extends "visible" | "locked" ? boolean : number;
/** One complete assignment is one atomic LWW register. Its property and value
 * cannot merge independently. Each override object still has its own stable ID.
 */
export type GraphicOverrideAssignment = {[P in GraphicOverrideProperty]: {property: P; value: GraphicOverrideValue<P>}}[GraphicOverrideProperty];
export type GraphicOverrideAttrs = GraphicReference & {assignment: GraphicOverrideAssignment};
export type GraphicAttrsByKind = {
    frame: GraphicObjectAttrs & {clipContent: boolean; layout: GraphicLayout};
    "object-group": GraphicObjectAttrs;
    rectangle: GraphicObjectAttrs & {cornerRadius: number};
    ellipse: GraphicObjectAttrs;
    label: GraphicObjectAttrs & {fontSize: number; fontFamily: string};
    path: GraphicObjectAttrs & {closed: boolean; fillRule: "nonzero" | "evenodd"};
    component: GraphicObjectAttrs;
    instance: GraphicObjectAttrs & {componentId: GraphicId};
    boolean: GraphicObjectAttrs & {operation: "union" | "subtract" | "intersect" | "exclude"};
    vertex: GraphicPoint & {handleIn: GraphicPoint; handleOut: GraphicPoint};
    segment: {from: GraphicId; to: GraphicId; kind: "line" | "cubic"};
    paint: GraphicPaintAttrs;
    "gradient-stop": {offset: number; color: string; opacity: number};
    stroke: GraphicPaintAttrs & {width: number; align: "center" | "inside" | "outside"; cap: "butt" | "round" | "square"; join: "miter" | "round" | "bevel"; miterLimit: number};
    "source-ref": GraphicReference;
    "instance-override": GraphicOverrideAttrs;
};
export type GraphicKind = keyof GraphicAttrsByKind;
/** assignment is atomic and must be replaced in full; other declared branches accept leaf patches. */
export type GraphicPatch<T> = {[K in keyof T]?: K extends "assignment" ? T[K] | null : T[K] extends object ? GraphicPatch<T[K]> | null : T[K] | null};
export type GraphicNode<K extends GraphicKind = GraphicKind> = NodeJSON & {type: K};
export type GraphicObject = {id: GraphicId; path: number[]; node: NodeJSON};
