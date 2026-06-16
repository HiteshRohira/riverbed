export type Field<T> = {
    kind: string;
    defaultValue?: T;
    default(value: T): Field<T>;
};
export type TableDefinition = {
    kind: "table";
    fields: Record<string, Field<any>>;
};
export type AuthContext = {
    userId: string;
    displayName: string;
    provider: "guest" | "google";
    isGuest: boolean;
    isAuthenticated: boolean;
    email?: string;
    emailVerified?: boolean;
    picture?: string;
};
export type LogContext = {
    info(message: string, data?: unknown): void;
    warn(message: string, data?: unknown): void;
    error(message: string, data?: unknown): void;
};
export type QueryBuilder<T> = {
    where(field: keyof T & string, value: unknown): QueryBuilder<T>;
    orderBy(field: keyof T & string, direction?: "asc" | "desc"): QueryBuilder<T>;
    limit(count: number): QueryBuilder<T>;
    all(): Array<T & {
        id: string;
        createdAt: string;
        updatedAt: string;
    }>;
};
export type TableApi<T> = QueryBuilder<T> & {
    get(id: string): (T & {
        id: string;
        createdAt: string;
        updatedAt: string;
    }) | null;
    insert(value: T): T & {
        id: string;
        createdAt: string;
        updatedAt: string;
    };
    update(id: string, patch: Partial<T>): void;
    delete(id: string): void;
};
export type DbContext = Record<string, TableApi<Record<string, unknown>>>;
export type ServerContext = {
    auth: AuthContext;
    db: DbContext;
    env: Record<string, string | undefined>;
    log: LogContext;
};
export type EndpointRoute = {
    method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "OPTIONS" | "HEAD" | (string & {});
    path: `/${string}`;
};
export type EndpointHeaders = {
    get(name: string): string | null;
    has(name: string): boolean;
    entries(): IterableIterator<[string, string]>;
};
export type EndpointRequest = {
    method: string;
    path: string;
    url: string;
    headers: EndpointHeaders;
    query: URLSearchParams;
    text(): Promise<string>;
    json<T = unknown>(): Promise<T>;
    bytes(): Promise<Uint8Array>;
};
export type EndpointResponse = {
    body: string;
    headers: Record<string, string>;
    kind: "response";
    status: number;
};
export type EndpointResponseOptions = {
    status?: number;
    headers?: Record<string, string>;
};
export type EndpointDefinition<TResult = unknown> = {
    kind: "endpoint";
    method: string;
    path: string;
    handler: (ctx: ServerContext, req: EndpointRequest) => TResult | Promise<TResult>;
};
export declare function capsule<T>(definition: T): T;
export declare function query<TResult>(handler: (ctx: ServerContext) => TResult): (ctx: ServerContext) => TResult;
export declare function mutation<TArgs extends unknown[], TResult>(handler: (ctx: ServerContext, ...args: TArgs) => TResult): (ctx: ServerContext, ...args: TArgs) => TResult;
export declare function endpoint<TResult>(route: EndpointRoute, handler: (ctx: ServerContext, req: EndpointRequest) => TResult | Promise<TResult>): EndpointDefinition<TResult>;
export declare function json(value: unknown, options?: EndpointResponseOptions): EndpointResponse;
export declare function text(value: unknown, options?: EndpointResponseOptions): EndpointResponse;
export declare function empty(options?: EndpointResponseOptions): EndpointResponse;
export declare function redirect(url: string, options?: EndpointResponseOptions): EndpointResponse;
export declare function table(fields: Record<string, Field<any>>): TableDefinition;
export declare function string(): Field<string>;
export declare function boolean(): Field<boolean>;
//# sourceMappingURL=server.d.ts.map