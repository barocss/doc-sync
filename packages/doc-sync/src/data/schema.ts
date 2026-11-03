import type {Schema} from "../crdt/schema.ts";

/** Fixed storage encoding for the existing document engine, not application schema. */
export function createDataSchema(): Schema {
    const id = {default: ""}, entry = {id, key: {default: ""}, value: {default: {scalar: null}}};
    return {domain: "graphic", root: "data", marks: [], nodes: {
        data: {shape: "container", children: ["entry", "map", "list"]},
        map: {shape: "container", children: ["entry"], attrs: {id}},
        list: {shape: "container", children: ["entry"], attrs: {id}},
        entry: {shape: "atom", attrs: entry},
    }};
}
