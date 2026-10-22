/** ProseMirror 연결 — 스키마 → ProseMirror 스키마, 문서 변환, 편집기 binding. prosemirror-* 가 peer 의존성 */

export {PmBinding} from "./binding.ts";
export {fromPmJSON, pathToPmPos, pmPosToPath, toPmJSON} from "./convert.ts";
export {buildPmSchema, pmName} from "./schema.ts";
export type {BindingStats} from "./binding.ts";
export type {DomHints, PmSchemaInfo} from "./schema.ts";
