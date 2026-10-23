import {ParagraphNode} from "lexical";
import {HeadingNode, QuoteNode} from "@lexical/rich-text";
import {TableNode, TableRowNode, TableCellNode} from "@lexical/table";
import {checkSchema} from "../crdt/schema.ts";
import {SchemaElementNode, SchemaLeafNode} from "./nodes.ts";
import type {Klass, LexicalNode} from "lexical";
import type {HeadingTagType} from "@lexical/rich-text";
import type {NodeJSON, Run} from "../crdt/model.ts";
import type {Schema} from "../crdt/schema.ts";

export type LexicalCodecContext = {
    schema: Schema;
    create: (model: NodeJSON | Run) => LexicalNode;
    read: (node: LexicalNode) => NodeJSON | Run;
};
export type LexicalCodec = {
    nodes?: Klass<LexicalNode>[];
    toLexical?: (model: NodeJSON | Run, context: LexicalCodecContext) => LexicalNode | null;
    fromLexical?: (node: LexicalNode, context: LexicalCodecContext) => NodeJSON | Run | null;
};
export type LexicalSchemaOptions = {
    paragraph?: string;
    quote?: string;
    headings?: Partial<Record<HeadingTagType, string>>;
    table?: string;
    codecs?: LexicalCodec[];
};
export type LexicalSchemaInfo = {
    schema: Schema;
    nodes: Klass<LexicalNode>[];
    native: LexicalSchemaOptions;
    codecs: LexicalCodec[];
};

/** Register info.nodes when creating the editor. Native names are optional mappings. */
export function buildLexicalSchema(schema: Schema, options: LexicalSchemaOptions = {}): LexicalSchemaInfo {
    const errors = checkSchema(schema);
    if (errors.length) throw new Error(`Invalid schema: ${errors.join("; ")}`);
    const root = schema.nodes[schema.root];
    const paragraph = options.paragraph ?? (root.shape === "flow" ? root.default : undefined);
    const headings = {...options.headings};
    for (let level = 1; level <= 6; level++) {
        const tag = `h${level}` as HeadingTagType;
        const type = `heading${level}`;
        if (!headings[tag] && schema.nodes[type]?.shape === "text") headings[tag] = type;
    }
    const grids = Object.keys(schema.nodes).filter(type => schema.nodes[type].shape === "grid");
    const native = {...options, paragraph, headings, quote: options.quote ?? (schema.nodes.quote?.shape === "text" ? "quote" : undefined), table: options.table ?? (grids.length === 1 ? grids[0] : undefined)};
    for (const type of [native.paragraph, native.quote, ...Object.values(headings)]) {
        if (type && schema.nodes[type]?.shape !== "text") throw new Error(`Native text mapping requires text shape: ${type}`);
    }
    if (native.table && schema.nodes[native.table]?.shape !== "grid") throw new Error(`Native table mapping requires grid shape: ${native.table}`);
    const codecs = options.codecs ?? [];
    return {schema, native, codecs, nodes: [...new Set<Klass<LexicalNode>>([
        ParagraphNode, HeadingNode, QuoteNode, TableNode, TableRowNode, TableCellNode, SchemaElementNode, SchemaLeafNode,
        ...codecs.flatMap(codec => codec.nodes ?? []),
    ])]};
}
