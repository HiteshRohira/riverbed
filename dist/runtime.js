import { randomUUID } from "node:crypto";
function now() {
    return new Date().toISOString();
}
function compareValues(left, right) {
    if (left === right) {
        return 0;
    }
    return left > right ? 1 : -1;
}
class QueryBuilder {
    table;
    rows;
    filters;
    sort;
    max;
    constructor(table, rows, filters = [], sort = null, max = null) {
        this.table = table;
        this.rows = rows;
        this.filters = filters;
        this.sort = sort;
        this.max = max;
    }
    where(field, value) {
        return new QueryBuilder(this.table, this.rows, [...this.filters, { field, value }], this.sort, this.max);
    }
    orderBy(field, direction = "asc") {
        return new QueryBuilder(this.table, this.rows, this.filters, { field, direction }, this.max);
    }
    limit(count) {
        return new QueryBuilder(this.table, this.rows, this.filters, this.sort, count);
    }
    all() {
        let results = Array.from(this.rows.values());
        for (const filter of this.filters) {
            results = results.filter((row) => row[filter.field] === filter.value);
        }
        if (this.sort) {
            const sort = this.sort;
            const direction = sort.direction === "desc" ? -1 : 1;
            results = [...results].sort((left, right) => compareValues(left[sort.field], right[sort.field]) * direction);
        }
        if (typeof this.max === "number") {
            results = results.slice(0, this.max);
        }
        return results.map((row) => ({ ...row }));
    }
}
function metadataFields() {
    return new Set(["id", "createdAt", "updatedAt"]);
}
function fieldDefault(field) {
    if (!field || !Object.prototype.hasOwnProperty.call(field, "defaultValue")) {
        return undefined;
    }
    return typeof field.defaultValue === "function" ? field.defaultValue() : field.defaultValue;
}
function assertFieldValue(tableName, fieldName, field, value) {
    if (value === undefined) {
        throw new Error(`Missing value for ${tableName}.${fieldName}`);
    }
    if (field.kind === "string" && typeof value !== "string") {
        throw new Error(`Expected ${tableName}.${fieldName} to be a string.`);
    }
    if (field.kind === "boolean" && typeof value !== "boolean") {
        throw new Error(`Expected ${tableName}.${fieldName} to be a boolean.`);
    }
}
class TableApi extends QueryBuilder {
    stateCell;
    name;
    definition;
    constructor(stateCell, name) {
        const rows = stateCell.tables.get(name);
        super(name, rows);
        this.stateCell = stateCell;
        this.name = name;
        this.definition = stateCell.schema?.[name];
    }
    validateInsert(value) {
        const fields = this.definition?.fields ?? {};
        const metadata = metadataFields();
        for (const key of Object.keys(value)) {
            if (!fields[key] && !metadata.has(key)) {
                throw new Error(`Unknown field for ${this.name}: ${key}`);
            }
            if (metadata.has(key)) {
                throw new Error(`Lakebed manages ${this.name}.${key}; app code cannot set it directly.`);
            }
        }
        const row = {};
        for (const [fieldName, field] of Object.entries(fields)) {
            const valueOrDefault = value[fieldName] ?? fieldDefault(field);
            assertFieldValue(this.name, fieldName, field, valueOrDefault);
            row[fieldName] = valueOrDefault;
        }
        return row;
    }
    validatePatch(patch) {
        const fields = this.definition?.fields ?? {};
        const metadata = metadataFields();
        const cleanPatch = {};
        for (const [key, value] of Object.entries(patch)) {
            if (!fields[key] && !metadata.has(key)) {
                throw new Error(`Unknown field for ${this.name}: ${key}`);
            }
            if (metadata.has(key)) {
                throw new Error(`Lakebed manages ${this.name}.${key}; app code cannot update it directly.`);
            }
            assertFieldValue(this.name, key, fields[key], value);
            cleanPatch[key] = value;
        }
        return cleanPatch;
    }
    get(id) {
        const row = this.rows.get(id);
        return row ? { ...row } : null;
    }
    insert(value) {
        const timestamp = now();
        const fields = this.validateInsert(value);
        const row = {
            ...fields,
            id: randomUUID(),
            createdAt: timestamp,
            updatedAt: timestamp
        };
        this.rows.set(row.id, row);
        this.stateCell.changedTables.add(this.name);
        return { ...row };
    }
    update(id, patch) {
        const row = this.rows.get(id);
        if (!row) {
            return;
        }
        const cleanPatch = this.validatePatch(patch);
        this.rows.set(id, {
            ...row,
            ...cleanPatch,
            id,
            updatedAt: now()
        });
        this.stateCell.changedTables.add(this.name);
    }
    delete(id) {
        if (this.rows.delete(id)) {
            this.stateCell.changedTables.add(this.name);
        }
    }
}
export class StateCell {
    schema;
    tables;
    changedTables;
    queue;
    constructor(schema) {
        this.schema = schema;
        this.tables = new Map();
        this.changedTables = new Set();
        this.queue = Promise.resolve();
        for (const tableName of Object.keys(schema ?? {})) {
            this.tables.set(tableName, new Map());
        }
    }
    updateSchema(schema) {
        this.schema = schema;
        for (const tableName of Object.keys(schema ?? {})) {
            if (!this.tables.has(tableName)) {
                this.tables.set(tableName, new Map());
            }
        }
        for (const tableName of this.tables.keys()) {
            if (!schema?.[tableName]) {
                this.tables.delete(tableName);
            }
        }
    }
    createDb() {
        const db = {};
        for (const tableName of this.tables.keys()) {
            db[tableName] = new TableApi(this, tableName);
        }
        return db;
    }
    listTables() {
        return Array.from(this.tables.keys()).sort();
    }
    dump() {
        const tables = {};
        for (const [tableName, rows] of this.tables) {
            tables[tableName] = Array.from(rows.values()).map((row) => ({ ...row }));
        }
        return { tables };
    }
    async transaction(handler) {
        const run = async () => {
            this.changedTables.clear();
            const result = await handler(this.createDb());
            const changedTables = Array.from(this.changedTables);
            this.changedTables.clear();
            return { result, changedTables };
        };
        const next = this.queue.then(run, run);
        this.queue = next.then(() => undefined, () => undefined);
        return next;
    }
}
export class LogBuffer {
    entries;
    beforeConsoleWrite;
    constructor({ beforeConsoleWrite } = {}) {
        this.entries = [];
        this.beforeConsoleWrite = beforeConsoleWrite;
    }
    append(level, message, data) {
        const entry = {
            level,
            message,
            data,
            at: now()
        };
        this.entries.push(entry);
        this.beforeConsoleWrite?.();
        console[level === "error" ? "error" : level === "warn" ? "warn" : "log"](`[lakebed:${level}] ${message}`, data ?? "");
    }
    createLogger() {
        return {
            info: (message, data) => this.append("info", message, data),
            warn: (message, data) => this.append("warn", message, data),
            error: (message, data) => this.append("error", message, data)
        };
    }
}
//# sourceMappingURL=runtime.js.map