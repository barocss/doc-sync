import type {Schema, EditOp, NodeJSON} from '@barocss/doc-sync';
export const CLIENT_SCHEMA: Schema;
export const SEED_TEXT: string;
export function seedEdits(): EditOp[];
export function textOf(model: NodeJSON): string;
export function seedEditsForSize(size?: 'sample' | 10000 | 100000): EditOp[];
