/** 클라이언트 동기화 — SyncClient 와 주고받는 꼴(protocol), HTTP+SSE 전송 */

export {SyncClient} from "./client.ts";
export {HttpTransport} from "./http-transport.ts";
export type {ClientOptions, ClientCheckpoint, EventCause} from "./client.ts";
export type {Ack, Change, Envelope, Outbound, Presence, ServerEvent, Transport} from "./protocol.ts";
export {upgradeOpenEditorSchema} from "../editor/schema-transition.ts";
export type {OpenEditorSchemaHost} from "../editor/schema-transition.ts";
export type {ModelRange} from "../editor/index.ts";

export {DOCUMENT_CAPABILITIES, PROTOCOL_VERSION} from "./protocol.ts";
