import type {Schema, EditOp, NodeJSON} from '@barocss/doc-sync-core';
export const LOCAL_SCHEMA: Schema;
export const SEED_TEXT: string;
export function seedEdits(): EditOp[];
export function textOf(model: NodeJSON): string;
export const SHARED_SCHEMA: Schema;
export function sharedSeedEdits(): EditOp[];
