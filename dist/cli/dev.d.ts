import type { IncomingHttpHeaders, IncomingMessage, ServerResponse } from "node:http";
import type { WebSocket } from "ws";
import { LogBuffer, StateCell } from "../runtime.js";
import type { MemorySourceStore } from "../source-store.js";
export declare function formatDevUpdateAge(updatedAt: Date, now?: Date): string;
export declare function devUpdateRefreshDelay(updatedAt: Date, now?: Date): number;
export declare function createDevStatusWriter({ quiet }?: {
    quiet?: boolean;
}): {
    close(): void;
    finish(): void;
    update(date?: Date): void;
};
export declare function html(title: string, { shooBaseUrl }?: {
    shooBaseUrl?: string;
}): string;
export declare function wantsHtml(req: IncomingMessage): boolean;
export declare function isReservedClientShellPath(pathname: string): boolean;
export declare function isClientShellRequest(req: IncomingMessage, pathname: string): boolean;
export declare function sendJson(ws: WebSocket, message: unknown): void;
export declare function readRequestBody(req: IncomingMessage, maxBytes?: number): Promise<Buffer>;
export declare function headersFromNodeRequest(headers: IncomingHttpHeaders): Record<string, string>;
export declare function createEndpointRequest({ body, headers, method, url }: {
    body: Buffer | Uint8Array;
    headers: IncomingHttpHeaders;
    method?: string;
    url: URL;
}): {
    headers: {
        entries(): MapIterator<[string, string]>;
        get(name: string): string | null;
        has(name: string): boolean;
    };
    method: string;
    path: string;
    query: URLSearchParams;
    url: string;
    bytes(): Promise<Uint8Array<ArrayBuffer>>;
    json(): Promise<any>;
    text(): Promise<string>;
};
export declare function endpointBodyToBuffer(body: unknown): Buffer;
export declare function endpointStatus(status: unknown, fallback?: number): number;
export declare function headersToObject(headers?: unknown): Record<string, string>;
export declare function normalizeEndpointResponse(result: unknown): Promise<{
    body: Buffer<ArrayBufferLike>;
    headers: Record<string, string>;
    status: number;
}>;
export declare function sanitizeEndpointResponseHeaders(headers?: Record<string, unknown>): Record<string, string>;
export declare function sendEndpointResponse(res: ServerResponse, response: {
    body?: Buffer;
    headers: Record<string, unknown>;
    status: number;
}): void;
export declare function endpointDefinitions(app: {
    endpoints?: Record<string, unknown>;
}): {
    handler: unknown;
    method: string;
    name: string;
    path: string;
}[];
export declare function findEndpoint(app: {
    endpoints?: Record<string, unknown>;
}, method: string | undefined, path: string): {
    handler: unknown;
    method: string;
    name: string;
    path: string;
} | null;
export declare function capsuleFileFingerprint(rootDir: string, dir?: string, entries?: string[]): Promise<string>;
export declare function createContext({ stateCell, auth, logs, env }: {
    stateCell: StateCell;
    auth: unknown;
    logs: LogBuffer;
    env: unknown;
}): {
    auth: unknown;
    db: import("../runtime.js").Db;
    env: unknown;
    log: import("../runtime.js").Logger;
};
export declare function runQuery({ app, stateCell, auth, logs, env, name }: {
    app: {
        queries?: Record<string, (ctx: unknown) => unknown>;
    };
    stateCell: StateCell;
    auth: unknown;
    logs: LogBuffer;
    env: unknown;
    name: string;
}): Promise<unknown>;
export declare function runMutation({ app, stateCell, auth, logs, env, name, args }: {
    app: {
        mutations?: Record<string, (ctx: unknown, ...args: unknown[]) => unknown>;
    };
    stateCell: StateCell;
    auth: unknown;
    logs: LogBuffer;
    env: unknown;
    name: string;
    args: unknown[];
}): Promise<{
    result: unknown;
    changedTables: string[];
}>;
export declare function runEndpoint({ stateCell, auth, logs, env, endpoint, request }: {
    stateCell: StateCell;
    auth: unknown;
    logs: LogBuffer;
    env: unknown;
    endpoint: {
        handler: unknown;
        name: string;
    };
    request: unknown;
}): Promise<{
    result: {
        body: Buffer<ArrayBufferLike>;
        headers: Record<string, string>;
        status: number;
    };
    changedTables: string[];
}>;
export declare function startDevServer({ capsuleDir, sourceStore, port, capsuleId, quiet, shooBaseUrl }?: {
    capsuleDir?: string;
    sourceStore?: MemorySourceStore;
    port?: number;
    capsuleId?: string;
    quiet?: boolean;
    shooBaseUrl?: string;
}): Promise<{
    readonly app: any;
    readonly buildDir: string;
    capsuleDir: string;
    logs: LogBuffer;
    port: number;
    stateCell: StateCell;
    url: string;
    close(): Promise<void>;
}>;
export declare function dev(args: string[]): Promise<void>;
//# sourceMappingURL=dev.d.ts.map