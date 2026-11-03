import type {NodeJSON} from '@barocss/doc-sync';
import type {EditorHost, ModelRange} from '@barocss/doc-sync/editor';
export interface CustomEditor {
    readModel(): NodeJSON;
    selection(): ModelRange | null;
    setSelection(range: ModelRange): void;
    undo(): void;
    redo(): void;
    dispose(): void;
}
export function mountCustomEditor(textarea: HTMLTextAreaElement, host: EditorHost,
    options?: {onError?: (error: unknown) => void}): CustomEditor;
