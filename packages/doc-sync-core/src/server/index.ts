/** 서버 — 문서마다 DocHub 하나. 순서 매기기·검사·GC·핀. 전송(HTTP·WebSocket)은 쓰는 쪽이 붙인다 (demo/server.ts 참고) */

export {DocHub, PostPersistUncertainError, RecoveryCompactionDeferredError} from "./hub.ts";
export {prepareDurableMutation} from "./staged.ts";
export type {DurableHubRecord, PreparedHubMutation} from "./staged.ts";
export type {HubOptions} from "./hub.ts";
