/**
 * 핵심 — 문서 CRDT. 의존성 없음.
 *
 *   Doc          토큰 줄 CRDT 문서 (연산 적용·검사·모델 계산·GC)
 *   edit(...)    모델 연산(insert·delete·update·split·merge) → CRDT 연산   (Doc.edit)
 *   commands     편집기 의도(글 넣기, Enter, Backspace, 표 행·열 …)를 모델 연산으로
 *   History      참여자별 되돌리기·다시하기
 *   Schema       바깥에서 주입하는 문서 모양
 */

export * as commands from "./crdt/commands.ts";
export {Doc, MAIN, cellAttrKey, cellSlot, comparePos, isAlive, samePos, slotKey, slotTicket, spanKey} from "./crdt/doc.ts";
export {anchorAt, blockPath, childCount, compileEdits, flowPath, gridPath, pathAt, pathOfPos, posOfPath, resolvePath, visibleBlocks} from "./crdt/edit.ts";
export {History} from "./crdt/history.ts";
export {applyEdit, applyEdits, canonMarks, canonical, diffModels, inheritedMarks, markOrder, runsToUnits, unitsToRuns} from "./crdt/model.ts";
export {acceptsText, attrValueOk, checkSchema, gridParts, groupOf, inlineTypes, storedTypes} from "./crdt/schema.ts";
export {Clock, ROOT, compareTicket, keyOf, shortOf, ticketOf} from "./crdt/ticket.ts";
export type {AtomBlock, Block, FlowBlock, GridBlock, Item, Line, Op, Pos, Snapshot, SpanValue, TextBlock} from "./crdt/doc.ts";
export type {RecordOptions} from "./crdt/history.ts";
export type {EditOp, Marks, ModelPath, NodeJSON, Run, Unit} from "./crdt/model.ts";
export type {AtomSpec, AttrSpec, CellSpec, FlowSpec, GridSpec, GroupSpec, InlineSpec, NodeSpec, RowSpec, Schema, Shape, SpanSpec, TextSpec, UiSpec} from "./crdt/schema.ts";
export type {Ticket} from "./crdt/ticket.ts";
