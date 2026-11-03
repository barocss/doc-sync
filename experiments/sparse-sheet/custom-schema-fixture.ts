import type {SpreadsheetSchema} from "@barocss/doc-sync";

/** Data rules only. Each editor maps these field names to its own columns and renderers. */
export const TASK_SHEET_SCHEMA: SpreadsheetSchema = {domain: "spreadsheet", version: 1, fields: {
    title: {type: "string", default: "Untitled", maxLength: 30},
    progress: {type: "number", default: 0, min: 0, max: 100},
    archived: {type: "boolean", default: false},
}};
export const SENSOR_SHEET_SCHEMA: SpreadsheetSchema = {domain: "spreadsheet", version: 1, fields: {
    reading: {type: "number", default: -1, min: -100, max: 100},
    unit: {type: "string", default: "C", values: ["C", "F"]},
}};
