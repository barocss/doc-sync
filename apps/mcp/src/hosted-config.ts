import {z} from "zod";
import {resolve} from "node:path";
const id = z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/);
const route = z.object({tenant: id, document: id, slot: id, actor: id, upstreamDocument: z.string().regex(/^[a-z0-9-]{1,40}$/),
    upstream: z.string().url(), headers: z.record(z.string()).default({})}).strict();
const grant = z.object({id, principal: id, token: z.string().regex(/^[A-Za-z0-9_-]{43,256}$/),
    routes: z.array(z.string()).min(1), permissions: z.array(z.enum(["read", "write", "schema", "proposal_create", "proposal_read", "proposal_decide", "proposal_accept"])).min(1)}).strict();
const positive = (value: number, maximum = 1048576) => z.number().int().positive().max(maximum).default(value);
const config = z.object({dataDir: z.string().min(1), hosts: z.array(z.string().min(1)).min(1), origins: z.array(z.string().url()).default([]),
    proposals: z.object({enabled: z.boolean().default(false), acceptanceEnabled: z.boolean().default(false)}).strict().default({}),
    routes: z.array(route).min(1).max(256), grants: z.array(grant).min(1).max(256),
    limits: z.object({bodyBytes: positive(1048576, 8388608), sessions: positive(64, 512), perPrincipal: positive(4, 64), calls: positive(8, 64), bodyReaders: positive(64, 512), perPrincipalBodyReaders: positive(4, 64),
        idleMs: positive(900000, 86400000), requestMs: positive(30000, 120000)}).strict().default({})}).strict();
export type HostedConfig = z.infer<typeof config>;
export type HostedRoute = HostedConfig["routes"][number];
export type HostedGrant = HostedConfig["grants"][number];
export const routePath = (r: HostedRoute) => `/mcp/${r.tenant}/${r.document}/${r.slot}`;
export function parseHostedConfig(value: unknown): HostedConfig {
    const c = config.parse(value); c.dataDir = resolve(c.dataDir);
    const unique = (values: string[]) => { if (new Set(values).size !== values.length) throw new Error("Duplicate configuration identity"); };
    unique(c.hosts); unique(c.origins); unique(c.routes.map(routePath));
    unique(c.grants.map(g => g.id)); unique(c.grants.map(g => g.token));
    for (const r of c.routes) {
        const u = new URL(r.upstream);
        if (!["http:", "https:"].includes(u.protocol) || u.username || u.password || u.search || u.hash || u.pathname !== "/") throw new Error("Upstream must be a configured HTTP origin");
        r.upstream = u.origin;
        for (const [name, value] of Object.entries(r.headers)) {
            if (!/^[a-z0-9-]+$/i.test(name) || /[\r\n]/.test(value) || /^(host|content-length|connection|transfer-encoding|x-doc-sync-)/i.test(name)) throw new Error("Invalid upstream header");
        }
    }
    unique(c.routes.map(r => JSON.stringify([r.upstream, r.upstreamDocument, r.actor])));
    for (const g of c.grants) {
        if (!g.permissions.includes("read") || (g.permissions.includes("schema") && !g.permissions.includes("write"))) throw new Error("Invalid permission combination");
        if (g.permissions.includes("proposal_create") && g.permissions.some(p => ["write", "schema", "proposal_read", "proposal_decide", "proposal_accept"].includes(p))) throw new Error("A proposal creator grant cannot hold write or owner proposal permissions");
        unique(g.routes); unique(g.permissions);
        if (g.routes.some(p => !c.routes.some(r => routePath(r) === p))) throw new Error("Unknown grant route");
        if (Buffer.from(g.token, "base64url").length < 32) throw new Error("Bearer token must contain at least 32 bytes");
    }
    for (const r of c.routes) {
        const owners = c.grants.filter(g => g.routes.includes(routePath(r))).map(g => g.principal);
        if (new Set(owners).size > 1) throw new Error("A slot must have one principal owner");
    }
    return c;
}
