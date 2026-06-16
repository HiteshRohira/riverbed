export type FieldDef = {
    kind: string;
    defaultValue?: unknown;
};
export type TableDef = {
    kind: "table";
    fields: Record<string, FieldDef>;
};
export type Schema = Record<string, TableDef>;
export type Row = Record<string, unknown> & {
    id: string;
    createdAt: string;
    updatedAt: string;
};
type Rows = Map<string, Row>;
type SortSpec = {
    field: string;
    direction: "asc" | "desc";
};
type Filter = {
    field: string;
    value: unknown;
};
declare class QueryBuilder {
    table: string;
    rows: Rows;
    filters: Filter[];
    sort: SortSpec | null;
    max: number | null;
    constructor(table: string, rows: Rows, filters?: Filter[], sort?: SortSpec | null, max?: number | null);
    where(field: string, value: unknown): QueryBuilder;
    orderBy(field: string, direction?: "asc" | "desc"): QueryBuilder;
    limit(count: number): QueryBuilder;
    all(): Row[];
}
declare class TableApi extends QueryBuilder {
    stateCell: StateCell;
    name: string;
    definition: TableDef | undefined;
    constructor(stateCell: StateCell, name: string);
    validateInsert(value: Record<string, unknown>): Record<string, unknown>;
    validatePatch(patch: Record<string, unknown>): Record<string, unknown>;
    get(id: string): Row | null;
    insert(value: Record<string, unknown>): Row;
    update(id: string, patch: Record<string, unknown>): void;
    delete(id: string): void;
}
export type Db = Record<string, TableApi>;
export declare class StateCell {
    schema: Schema | undefined;
    tables: Map<string, Rows>;
    changedTables: Set<string>;
    queue: Promise<unknown>;
    constructor(schema: Schema | undefined);
    updateSchema(schema: Schema | undefined): void;
    createDb(): Db;
    listTables(): string[];
    dump(): {
        tables: Record<string, Row[]>;
    };
    transaction<T>(handler: (db: Db) => T | Promise<T>): Promise<{
        result: T;
        changedTables: string[];
    }>;
}
export type LogLevel = "info" | "warn" | "error";
export type LogEntry = {
    level: LogLevel;
    message: string;
    data?: unknown;
    at: string;
};
export type Logger = {
    info: (message: string, data?: unknown) => void;
    warn: (message: string, data?: unknown) => void;
    error: (message: string, data?: unknown) => void;
};
export declare class LogBuffer {
    entries: LogEntry[];
    beforeConsoleWrite?: () => void;
    constructor({ beforeConsoleWrite }?: {
        beforeConsoleWrite?: () => void;
    });
    append(level: LogLevel, message: string, data?: unknown): void;
    createLogger(): Logger;
}
export {};
//# sourceMappingURL=runtime.d.ts.map