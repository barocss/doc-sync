/** 클라이언트 동기화 — SyncClient 와 주고받는 꼴(protocol), HTTP+SSE 전송 */

export {SyncClient} from "./client.ts";
export {HttpTransport} from "./http-transport.ts";
export type {ClientOptions, ClientCheckpoint, ClientStateCheckpoint, EventCause} from "./client.ts";
export type {Ack, Change, Envelope, Outbound, Presence, ServerEvent, Transport} from "./protocol.ts";
export {upgradeOpenEditorSchema} from "../editor/schema-transition.ts";
export type {OpenEditorSchemaHost} from "../editor/schema-transition.ts";
export type {ModelRange} from "../editor/index.ts";

export {DOCUMENT_CAPABILITIES, PROTOCOL_VERSION} from "./protocol.ts";

export {botFace, createBotAvatar} from "./character.ts";
export type {BotCharacter, BotExpression, BotActivity} from "./character.ts";
export {LiveRecovery} from './live-recovery.ts';
export type {LiveRecoveryTransport, LiveRecoveryProof, LiveRecoveryRelease, LiveRecoveryOptions} from './live-recovery.ts';
export {BrowserRecovery} from './browser-recovery.ts';
export type {BrowserRecoveryIdentity, BrowserRecoveryRecord, BrowserRecoveryLocks} from './browser-recovery.ts';

export {typescriptClientEngineFactory} from "../engine/typescript-client.ts";
export type {ClientEngine, ClientEngineFactory, EngineReceiveResult, EngineEditingView, EngineInputSession} from "../engine/client-contract.ts";
