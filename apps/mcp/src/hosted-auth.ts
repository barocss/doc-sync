import {createHash, timingSafeEqual} from "node:crypto";
import type {IncomingMessage} from "node:http";
import type {HostedGrant} from "./hosted-config.ts";
const digest = (s: string) => createHash("sha256").update(s).digest();
export function authenticate(req: IncomingMessage, grants: HostedGrant[]): HostedGrant | null {
    const values = req.rawHeaders.filter((_, i) => i % 2 === 0 && req.rawHeaders[i]!.toLowerCase() === "authorization");
    const auth = req.headers.authorization;
    if (values.length !== 1 || !auth || auth.length > 300 || !/^Bearer [A-Za-z0-9_-]{43,256}$/.test(auth)) return null;
    const supplied = digest(auth.slice(7));
    let found: HostedGrant | null = null;
    for (const grant of grants) if (timingSafeEqual(supplied, digest(grant.token))) found = grant;
    return found;
}
const permissions: Record<string, "read" | "write" | "schema"> = {
    get_schema: "read", get_server_schema: "read", read_document: "read", read_document_slice: "read", recovery_status: "read",
    edit_document: "write", retry_edit: "write", undo: "write", redo: "write", discard_history: "write", set_presence: "write",
    upgrade_schema: "schema", transition_schema: "schema",
};
export function authorizeTool(grant: HostedGrant, name: string): void {
    const permission = permissions[name];
    if (!permission || !grant.permissions.includes(permission)) throw new Error("Tool permission denied");
}
export function binding(grant: HostedGrant, path: string, actor: string): string {
    return JSON.stringify([grant.id, grant.principal, path, actor, [...grant.permissions].sort()]);
}
