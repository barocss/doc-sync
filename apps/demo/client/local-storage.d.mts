import type {Client} from '@barocss/doc-sync-core/client';
export const DEFAULT_STORAGE_KEY: string;
type Selection = ReturnType<Client['captureSelection']>;
type Storage = {getItem(key: string): string | null; setItem(key: string, value: string): void; removeItem(key: string): void};
export function saveLocal(storage: Storage, key: string, client: Client, selections?: Record<string, Selection>): string;
export function openLocal(storage: Storage, key: string, restore: (state: unknown) => Client): {client: Client; selections: Record<string, ReturnType<Client['resolveSelection']>>} | null;
export function forgetLocal(storage: Storage, key: string): void;
