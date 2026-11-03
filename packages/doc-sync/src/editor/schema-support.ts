import {checkSchema} from "../crdt/schema.ts";
import type {SpreadsheetSchema, SpreadsheetFieldSpec} from "../spreadsheet/schema.ts";
import {assertSpreadsheetSchema, spreadsheetSchemaVersion} from "../spreadsheet/schema.ts";
import type {Schema, SchemaDomain, Shape} from "../crdt/schema.ts";
import {schemaVersion} from "../crdt/schema-version.ts";

const TEXT_SHAPE_FIELDS = Object.freeze(["children", "text", "next"]);
const FLOW_SHAPE_FIELDS = Object.freeze(["children", "default", "childRules"]);
const CHILDREN_SHAPE_FIELDS = Object.freeze(["children"]);
const GROUP_SHAPE_FIELDS = Object.freeze(["children", "by"]);
const SPAN_SHAPE_FIELDS = Object.freeze(["mark", "attr"]);
const SHAPE_PROPERTY_FIELDS: Readonly<Record<Shape, readonly string[]>> = Object.freeze({
    text: TEXT_SHAPE_FIELDS, inline: Object.freeze([]),
    flow: FLOW_SHAPE_FIELDS, container: CHILDREN_SHAPE_FIELDS,
    group: GROUP_SHAPE_FIELDS, grid: CHILDREN_SHAPE_FIELDS, row: CHILDREN_SHAPE_FIELDS, cell: CHILDREN_SHAPE_FIELDS,
    atom: Object.freeze([]), span: SPAN_SHAPE_FIELDS,
});


const ATTRIBUTE_SUPPORT_KINDS = Object.freeze(["semantic", "opaque"]);
const SCALAR_ATTRIBUTE_TYPES = Object.freeze(["string", "number", "boolean", "scalar"]);


export type EditorAttributeHandling = "semantic" | "preserve";
export type EditorNodeCapability = {
    /** Semantic rendering is application-defined. Opaque nodes retain data only. */
    mode: "semantic" | "opaque";
    nativeName?: string;
    attrs?: Readonly<Record<string, EditorAttributeHandling>>;
};
/** View declarations are separate from the replicated schema and its identity. */
export type EditorSchemaCapabilities = {
    domains: readonly SchemaDomain[];
    shapes: readonly Shape[];
    nodes: Readonly<Record<string, EditorNodeCapability>>;
    marks?: Readonly<Record<string, EditorAttributeHandling>>;
    markValues?: Readonly<Record<string, EditorAttributeHandling>>;
};
export type EditorSchemaDiagnostic = {
    severity: "error" | "warning";
    path: string;
    feature: "schema" | "domain" | "shape" | "node" | "attribute" | "mark" | "markValue" | "nativeName" | "field" | "fieldType";
    message: string;
};
export type EditorSchemaInspection = {
    supported: boolean;
    /** True only if all declared model features have semantic view handling. */
    semantic: boolean;
    schemaVersion: string | null;
    diagnostics: EditorSchemaDiagnostic[];
};

/** Pure preflight. Declarations describe a view contract, not installed renderers.
 * Call this before building or mounting an editor. Opaque/preserve support produces
 * warnings so an application can require semantic rendering when needed.
 */
export function inspectEditorSchema(schema: Schema, capabilities: EditorSchemaCapabilities): EditorSchemaInspection {
    const diagnostics: EditorSchemaDiagnostic[] = [];
    const add = (severity: "error" | "warning", path: string, feature: EditorSchemaDiagnostic["feature"], message: string) => diagnostics.push({severity, path, feature, message});
    let version: string;
    try {
        version = schemaVersion(schema);
        const problems = checkSchema(schema);
        if (problems.length) throw new Error(`Invalid schema: ${problems.join("; ")}`);
        // This preflight has a stricter descriptor boundary than the legacy core.
        // Keep every public NodeSpec property, including UI hints and span mappings.
        for (const [type, spec] of Object.entries(schema.nodes)) {
            if (!Object.hasOwn(SHAPE_PROPERTY_FIELDS, spec.shape)) throw new Error(`Invalid schema: nodes.${type}.shape is unsupported`);
            const allowed = ["shape", "attrs", "ui", ...SHAPE_PROPERTY_FIELDS[spec.shape]];
            for (const key of Object.keys(spec)) {
                if (!allowed.includes(key)) throw new Error(`Invalid schema: nodes.${type}.${key} is not supported on ${spec.shape}`);
            }
        }
    }
    catch (error) {
        add("error", "$", "schema", error instanceof Error ? error.message : String(error));
        return {supported: false, semantic: false, schemaVersion: null, diagnostics};
    }
    const domain = schema.domain ?? "document";
    if (!capabilities.domains.includes(domain)) add("error", "domain", "domain", `Unsupported domain: ${domain}`);
    const nativeNames = new Map<string, string>();
    for (const [type, spec] of Object.entries(schema.nodes)) {
        const path = `nodes.${type}`, mapping = Object.hasOwn(capabilities.nodes, type) ? capabilities.nodes[type] : undefined;
        if (!capabilities.shapes.includes(spec.shape)) add("error", `${path}.shape`, "shape", `Unsupported shape: ${spec.shape}`);
        if (!mapping || !ATTRIBUTE_SUPPORT_KINDS.includes(mapping.mode)) add("error", path, "node", "Explicit node handling is required");
        else if (mapping.mode === "opaque") add("warning", path, "node", "Node data is preserved without semantic rendering");
        if (mapping?.nativeName !== undefined) {
            if (!mapping.nativeName) add("error", path, "nativeName", "Native name must not be empty");
            const prior = nativeNames.get(mapping.nativeName);
            if (prior !== undefined) add("error", path, "nativeName", `Native name is also used by ${prior}`);
            nativeNames.set(mapping.nativeName, type);
        }
        for (const attr of Object.keys(spec.attrs ?? {})) {
            const handling = mapping?.attrs && Object.hasOwn(mapping.attrs, attr) ? mapping.attrs[attr] : undefined;
            if (handling !== "semantic" && handling !== "preserve") add("error", `${path}.attrs.${attr}`, "attribute", "Explicit attribute handling is required");
            else if (handling === "preserve") add("warning", `${path}.attrs.${attr}`, "attribute", "Attribute data is preserved without semantic rendering");
        }
    }
    const inspectMarks = (names: readonly string[], handling: Readonly<Record<string, EditorAttributeHandling>> | undefined, feature: "mark" | "markValue", path: string) => {
        for (const name of names) {
            const mode = handling && Object.hasOwn(handling, name) ? handling[name] : undefined;
            if (mode !== "semantic" && mode !== "preserve") add("error", `${path}.${name}`, feature, "Explicit mark handling is required");
            else if (mode === "preserve") add("warning", `${path}.${name}`, feature, "Mark data is preserved without semantic rendering");
        }
    };
    inspectMarks(schema.marks, capabilities.marks, "mark", "marks");
    inspectMarks(Object.keys(schema.markValues ?? {}), capabilities.markValues, "markValue", "markValues");
    return {supported: !diagnostics.some(d => d.severity === "error"), semantic: diagnostics.length === 0, schemaVersion: version, diagnostics};
}


export type SpreadsheetEditorFieldCapability = {
    mode: "semantic" | "opaque";
    /** Required for semantic editing. A scalar editor can handle every field type. */
    editorType?: SpreadsheetFieldSpec["type"];
};
export type SpreadsheetEditorCapabilities = {
    fields: Readonly<Record<string, SpreadsheetEditorFieldCapability>>;
};

/** Validate a spreadsheet view profile without adding view rules to replicated data.
 * Opaque fields preserve data and produce a warning. This function does not install
 * cell editors, codecs or renderers; the application supplies those implementations.
 */
export function inspectSpreadsheetSchema(schema: SpreadsheetSchema, capabilities: SpreadsheetEditorCapabilities): EditorSchemaInspection {
    const diagnostics: EditorSchemaDiagnostic[] = [];
    const add = (severity: "error" | "warning", path: string, feature: EditorSchemaDiagnostic["feature"], message: string) => diagnostics.push({severity, path, feature, message});
    let version: string;
    try {
        assertSpreadsheetSchema(schema);
        version = spreadsheetSchemaVersion(schema);
    } catch (error) {
        add("error", "$", "schema", error instanceof Error ? error.message : String(error));
        return {supported: false, semantic: false, schemaVersion: null, diagnostics};
    }
    for (const [field, spec] of Object.entries(schema.fields)) {
        const path = `fields.${field}`;
        const mapping = Object.hasOwn(capabilities.fields, field) ? capabilities.fields[field] : undefined;
        if (!mapping || !ATTRIBUTE_SUPPORT_KINDS.includes(mapping.mode)) {
            add("error", path, "field", "Explicit field handling is required");
            continue;
        }
        if (mapping.mode === "opaque") add("warning", path, "field", "Field data is preserved without semantic editing");
        if (mapping.mode === "semantic" && mapping.editorType === undefined) add("error", `${path}.editorType`, "fieldType", "Semantic editing requires an editor type");
        if (mapping.editorType !== undefined && (mapping.editorType !== "scalar" && mapping.editorType !== spec.type || !SCALAR_ATTRIBUTE_TYPES.includes(mapping.editorType))) {
            add("error", `${path}.editorType`, "fieldType", `Editor type does not support ${spec.type}`);
        }
    }
    for (const field of Object.keys(capabilities.fields)) {
        if (!Object.hasOwn(schema.fields, field)) add("error", `fields.${field}`, "field", "View profile names an unknown field");
    }
    return {supported: !diagnostics.some(d => d.severity === "error"), semantic: diagnostics.length === 0, schemaVersion: version, diagnostics};
}
