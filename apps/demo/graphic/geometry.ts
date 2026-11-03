import {CANVAS_LIMITS} from "../../../fixtures/graphic-canvas-schema.ts";
import type {CanvasSize, CanvasTransform} from "../../../fixtures/graphic-canvas-schema.ts";

export type Point = {x: number; y: number};
export type Bounds = Point & CanvasSize;
export type SceneTransformNode = {id: string; parentId: string | null; transform: CanvasTransform};

export const IDENTITY_TRANSFORM: Readonly<CanvasTransform> = Object.freeze({x: 0, y: 0, rotation: 0, scale: 1});

export const isFiniteTransform = (value: CanvasTransform): boolean =>
    !!value && [value.x, value.y, value.rotation, value.scale].every(Number.isFinite) && value.scale > 0;

export const isCanvasTransform = (value: CanvasTransform): boolean => isFiniteTransform(value) &&
    Math.abs(value.x) <= CANVAS_LIMITS.position && Math.abs(value.y) <= CANVAS_LIMITS.position &&
    Math.abs(value.rotation) <= CANVAS_LIMITS.rotation && value.scale >= CANVAS_LIMITS.minScale && value.scale <= CANVAS_LIMITS.maxScale;

export const isCanvasSize = (value: CanvasSize): boolean => !!value &&
    [value.width, value.height].every(number => Number.isFinite(number) && number >= CANVAS_LIMITS.minSize && number <= CANVAS_LIMITS.maxSize);

/** Screen coordinates: x right, y down, positive degrees rotate clockwise. */
export function normalizeRotation(degrees: number): number {
    const angle = (degrees % 360 + 360) % 360;
    return angle >= 180 ? angle - 360 : angle;
}

const finitePoint = (point: Point): boolean => !!point && Number.isFinite(point.x) && Number.isFinite(point.y);
const trig = (degrees: number): [number, number] => {
    const radians = normalizeRotation(degrees) * Math.PI / 180;
    return [Math.cos(radians), Math.sin(radians)];
};

/** Apply one complete local-to-world transform. Null means no valid result. */
export function localToWorld(point: Point, transform: CanvasTransform): Point | null {
    if (!finitePoint(point) || !isFiniteTransform(transform)) return null;
    const [cos, sin] = trig(transform.rotation);
    const result = {
        x: transform.x + (cos * point.x - sin * point.y) * transform.scale,
        y: transform.y + (sin * point.x + cos * point.y) * transform.scale,
    };
    return finitePoint(result) ? result : null;
}

/** Invert rotation and uniform scale; reject singular or overflowing inputs. */
export function worldToLocal(point: Point, transform: CanvasTransform): Point | null {
    if (!finitePoint(point) || !isFiniteTransform(transform)) return null;
    const [cos, sin] = trig(transform.rotation);
    const x = point.x - transform.x, y = point.y - transform.y;
    const result = {x: (cos * x + sin * y) / transform.scale, y: (-sin * x + cos * y) / transform.scale};
    return finitePoint(result) ? result : null;
}

/** Parent after local. World values need not fit the local attribute bounds. */
export function composeTransforms(parent: CanvasTransform, local: CanvasTransform): CanvasTransform | null {
    if (!isFiniteTransform(parent) || !isFiniteTransform(local)) return null;
    const origin = localToWorld(local, parent);
    if (!origin) return null;
    const result = {...origin, rotation: normalizeRotation(normalizeRotation(parent.rotation) + normalizeRotation(local.rotation)), scale: parent.scale * local.scale};
    return isFiniteTransform(result) ? result : null;
}

/** Resolve a stored hierarchy without recursion. Missing ancestors and cycles fail. */
export function worldTransform(nodes: ReadonlyMap<string, SceneTransformNode>, id: string | null): CanvasTransform | null {
    const ancestors: CanvasTransform[] = [];
    const visited = new Set<string>();
    while (id !== null) {
        if (visited.has(id)) return null;
        visited.add(id);
        const node = nodes.get(id);
        if (!node || node.id !== id || !isCanvasTransform(node.transform)) return null;
        ancestors.push(node.transform);
        id = node.parentId;
    }
    let result: CanvasTransform = {...IDENTITY_TRANSFORM};
    for (let index = ancestors.length - 1; index >= 0; index--) {
        const composed = composeTransforms(result, ancestors[index]);
        if (!composed) return null;
        result = composed;
    }
    return result;
}

/** New local transform that keeps all world points fixed. Never mutates inputs. */
export function reparentTransform(objectWorld: CanvasTransform, newParentWorld: CanvasTransform): CanvasTransform | null {
    if (!isFiniteTransform(objectWorld) || !isFiniteTransform(newParentWorld)) return null;
    const origin = worldToLocal(objectWorld, newParentWorld);
    if (!origin) return null;
    const result = {...origin, rotation: normalizeRotation(normalizeRotation(objectWorld.rotation) - normalizeRotation(newParentWorld.rotation)), scale: objectWorld.scale / newParentWorld.scale};
    return isCanvasTransform(result) ? result : null;
}

/** Axis-aligned world box from the four local box corners. */
export function worldBounds(transform: CanvasTransform, size: CanvasSize): Bounds | null {
    if (!isCanvasSize(size)) return null;
    const points = [{x: 0, y: 0}, {x: size.width, y: 0}, {x: size.width, y: size.height}, {x: 0, y: size.height}]
        .map(point => localToWorld(point, transform));
    if (points.some(point => !point)) return null;
    const valid = points as Point[];
    const minX = Math.min(...valid.map(point => point.x)), maxX = Math.max(...valid.map(point => point.x));
    const minY = Math.min(...valid.map(point => point.y)), maxY = Math.max(...valid.map(point => point.y));
    const bounds = {x: minX, y: minY, width: maxX - minX, height: maxY - minY};
    return Object.values(bounds).every(Number.isFinite) ? bounds : null;
}

export function containsPoint(point: Point, transform: CanvasTransform, size: CanvasSize): boolean {
    if (!isCanvasSize(size)) return false;
    const local = worldToLocal(point, transform);
    return !!local && local.x >= 0 && local.y >= 0 && local.x <= size.width && local.y <= size.height;
}
