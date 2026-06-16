import { createHash, randomBytes, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { LAKEBED_VERSION } from "./version.js";
export const ANONYMOUS_ARTIFACT_FORMAT = "lakebed.capsule.artifact.v1";
export const ANONYMOUS_ARTIFACT_MEDIA_TYPE = "application/vnd.lakebed.artifact+json";
export { LAKEBED_VERSION };
export const LAKEBED_CONFIG_FILE = "lakebed.json";
export const SERVER_ENV_FILE = ".env.lakebed.server";
export const SERVER_ENV_LIMITS = {
    maxKeyBytes: 128,
    maxKeys: 64,
    maxTotalBytes: 64 * 1024,
    maxValueBytes: 16 * 1024
};
export const DEFAULT_ANONYMOUS_LIMITS = {
    artifactBytes: 1024 * 1024,
    stateBytes: 1024 * 1024,
    stateRows: 16384,
    requestsPerDay: 10000,
    mutationsPerDay: 1000,
    rowsReturned: 1000,
    instructionBudget: 50000,
    maxValueBytes: 65536,
    logEntries: 1000,
    logBytes: 256 * 1024,
    logEntryBytes: 16 * 1024
};
const expressionOps = new Set(["arg", "auth", "call", "row"]);
const authFields = new Set(["displayName", "email", "emailVerified", "isAuthenticated", "isGuest", "picture", "provider", "userId"]);
const endpointMethodPattern = /^[A-Z0-9!#$%&'*+.^_`|~-]+$/;
export class AnonymousCompilerError extends Error {
    diagnostics;
    constructor(diagnostics) {
        super(diagnostics.map((diagnostic) => diagnostic.message).join("\n"));
        this.name = "AnonymousCompilerError";
        this.diagnostics = diagnostics;
    }
}
export function sha256(value) {
    return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}
export function stableStringify(value) {
    if (value === undefined) {
        return undefined;
    }
    if (value === null || typeof value !== "object") {
        return JSON.stringify(value);
    }
    if (Array.isArray(value)) {
        return `[${value.map((item) => stableStringify(item) ?? "null").join(",")}]`;
    }
    const entries = Object.entries(value)
        .filter(([, entryValue]) => entryValue !== undefined)
        .sort(([left], [right]) => left.localeCompare(right));
    return `{${entries
        .map(([key, entryValue]) => `${JSON.stringify(key)}:${stableStringify(entryValue) ?? "null"}`)
        .join(",")}}`;
}
export function byteLength(value) {
    return Buffer.byteLength(typeof value === "string" ? value : (stableStringify(value) ?? ""), "utf8");
}
export function stateRowsLimitForLimits(limits = DEFAULT_ANONYMOUS_LIMITS) {
    const explicit = limits.stateRows ?? DEFAULT_ANONYMOUS_LIMITS.stateRows;
    if (Number.isSafeInteger(explicit) && explicit > 0) {
        return explicit;
    }
    const stateBytes = limits.stateBytes ?? DEFAULT_ANONYMOUS_LIMITS.stateBytes;
    return Math.max(1, Math.floor(stateBytes / 64));
}
export function mutationTransactionOptions(limits = DEFAULT_ANONYMOUS_LIMITS) {
    return {
        stateBytesLimit: limits.stateBytes ?? DEFAULT_ANONYMOUS_LIMITS.stateBytes,
        stateRowsLimit: stateRowsLimitForLimits(limits)
    };
}
function cloneJson(value) {
    return JSON.parse(JSON.stringify(value));
}
function isPlainObject(value) {
    return Boolean(value) && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype;
}
export function validateServerEnvValues(values, path = "serverEnv.values") {
    if (!isPlainObject(values)) {
        throw new Error(`${path} must be a JSON object.`);
    }
    const entries = Object.entries(values).sort(([left], [right]) => left.localeCompare(right));
    if (entries.length > SERVER_ENV_LIMITS.maxKeys) {
        throw new Error(`${path} may include at most ${SERVER_ENV_LIMITS.maxKeys} keys.`);
    }
    const env = {};
    let totalBytes = 0;
    for (const [key, value] of entries) {
        if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
            throw new Error(`${path}.${key} is not a valid server env key.`);
        }
        if (key.startsWith("LAKEBED_")) {
            throw new Error(`${path}.${key} uses the reserved LAKEBED_ prefix.`);
        }
        if (typeof value !== "string") {
            throw new Error(`${path}.${key} must be a string.`);
        }
        const keyBytes = byteLength(key);
        const valueBytes = byteLength(value);
        if (keyBytes > SERVER_ENV_LIMITS.maxKeyBytes) {
            throw new Error(`${path}.${key} exceeds ${SERVER_ENV_LIMITS.maxKeyBytes} bytes.`);
        }
        if (valueBytes > SERVER_ENV_LIMITS.maxValueBytes) {
            throw new Error(`${path}.${key} exceeds ${SERVER_ENV_LIMITS.maxValueBytes} bytes.`);
        }
        totalBytes += keyBytes + valueBytes;
        env[key] = value;
    }
    if (totalBytes > SERVER_ENV_LIMITS.maxTotalBytes) {
        throw new Error(`${path} exceeds ${SERVER_ENV_LIMITS.maxTotalBytes} bytes.`);
    }
    return env;
}
export function validateServerEnvPayload(payload) {
    if (payload === undefined) {
        return undefined;
    }
    if (!isPlainObject(payload)) {
        throw new Error("serverEnv must be a JSON object.");
    }
    if (payload.mode !== "replace") {
        throw new Error("serverEnv.mode must be replace.");
    }
    return validateServerEnvValues(payload.values);
}
function isExpression(value) {
    return Array.isArray(value) && expressionOps.has(value[0]);
}
function serializeValue(value) {
    if (value instanceof SymbolicValue) {
        return value.expr;
    }
    if (Array.isArray(value)) {
        return value.map((item) => serializeValue(item));
    }
    if (isPlainObject(value)) {
        const object = {};
        for (const [key, entryValue] of Object.entries(value)) {
            object[key] = serializeValue(entryValue);
        }
        return object;
    }
    return value;
}
class SymbolicValue {
    expr;
    sample;
    constructor(expr, sample) {
        this.expr = expr;
        this.sample = sample;
    }
    trim() {
        return new SymbolicValue(["call", "trim", this.expr], String(this.sample).trim());
    }
    slice(start, end) {
        return new SymbolicValue(["call", "slice", this.expr, start, end], String(this.sample).slice(start, end));
    }
    toLowerCase() {
        return new SymbolicValue(["call", "toLowerCase", this.expr], String(this.sample).toLowerCase());
    }
    toUpperCase() {
        return new SymbolicValue(["call", "toUpperCase", this.expr], String(this.sample).toUpperCase());
    }
    includes(value) {
        return String(this.sample).includes(String(value instanceof SymbolicValue ? value.sample : value));
    }
    get length() {
        return String(this.sample).length;
    }
    valueOf() {
        return this.sample;
    }
    toString() {
        return String(this.sample);
    }
}
function createSymbolicArg(index) {
    return new SymbolicValue(["arg", index], index === 0 ? "sample-value" : `sample-value-${index}`);
}
function createSymbolicAuth() {
    return {
        displayName: new SymbolicValue(["auth", "displayName"], "Trace Guest"),
        email: new SymbolicValue(["auth", "email"], "trace@example.test"),
        emailVerified: new SymbolicValue(["auth", "emailVerified"], true),
        isAuthenticated: new SymbolicValue(["auth", "isAuthenticated"], true),
        isGuest: new SymbolicValue(["auth", "isGuest"], false),
        picture: new SymbolicValue(["auth", "picture"], "https://example.test/avatar.png"),
        provider: new SymbolicValue(["auth", "provider"], "google"),
        userId: new SymbolicValue(["auth", "userId"], "guest:trace")
    };
}
function createSymbolicRow({ auth, idExpr, scanId, schema, tableName }) {
    const fields = (schema?.[tableName]?.fields ?? {});
    const row = {
        id: idExpr ?? new SymbolicValue(["row", scanId, "id"], "row-trace"),
        createdAt: new SymbolicValue(["row", scanId, "createdAt"], "2026-01-01T00:00:00.000Z"),
        updatedAt: new SymbolicValue(["row", scanId, "updatedAt"], "2026-01-01T00:00:00.000Z")
    };
    for (const [fieldName, field] of Object.entries(fields)) {
        if (fieldName === "ownerId" || fieldName === "authorId") {
            row[fieldName] = auth.userId;
        }
        else if (fieldName === "authorName") {
            row[fieldName] = auth.displayName;
        }
        else if (fieldName === "authorPicture") {
            row[fieldName] = auth.picture;
        }
        else if (field.kind === "boolean") {
            row[fieldName] = true;
        }
        else {
            row[fieldName] = new SymbolicValue(["row", scanId, fieldName], `${fieldName}-trace`);
        }
    }
    return row;
}
class QueryTrace {
    filters;
    limitValue;
    orderByValue;
    recorder;
    tableName;
    constructor({ filters = [], limit = null, orderBy = null, recorder, tableName }) {
        this.filters = filters;
        this.limitValue = limit;
        this.orderByValue = orderBy;
        this.recorder = recorder;
        this.tableName = tableName;
    }
    where(field, value) {
        return new QueryTrace({
            filters: [...this.filters, { field, value: serializeValue(value) }],
            limit: this.limitValue,
            orderBy: this.orderByValue,
            recorder: this.recorder,
            tableName: this.tableName
        });
    }
    orderBy(field, direction = "asc") {
        return new QueryTrace({
            filters: this.filters,
            limit: this.limitValue,
            orderBy: { field, direction: direction === "desc" ? "desc" : "asc" },
            recorder: this.recorder,
            tableName: this.tableName
        });
    }
    limit(count) {
        return new QueryTrace({
            filters: this.filters,
            limit: Number(count),
            orderBy: this.orderByValue,
            recorder: this.recorder,
            tableName: this.tableName
        });
    }
    toSpec() {
        return {
            op: "table.all",
            table: this.tableName,
            filters: this.filters,
            orderBy: this.orderByValue,
            limit: this.limitValue
        };
    }
    all() {
        const spec = this.toSpec();
        if (this.recorder.mode === "query") {
            this.recorder.query = spec;
            return [];
        }
        const scanId = `scan_${this.recorder.nextScanId}`;
        this.recorder.nextScanId += 1;
        this.recorder.scans.set(scanId, spec);
        this.recorder.operations.push({ op: "scan", scanId, query: spec });
        return [createSymbolicRow({ auth: this.recorder.auth, scanId, schema: this.recorder.schema, tableName: this.tableName })];
    }
}
class TableTrace extends QueryTrace {
    constructor({ recorder, tableName }) {
        super({ recorder, tableName });
    }
    get(id) {
        const idExpr = serializeValue(id);
        this.recorder.operations.push({ id: idExpr, op: "get", table: this.tableName });
        return createSymbolicRow({
            auth: this.recorder.auth,
            idExpr: id instanceof SymbolicValue ? id : new SymbolicValue(idExpr, "row-trace"),
            scanId: `get_${this.recorder.operations.length}`,
            schema: this.recorder.schema,
            tableName: this.tableName
        });
    }
    insert(value) {
        const values = serializeValue(value);
        this.recorder.operations.push({ op: "insert", table: this.tableName, values });
        return createSymbolicRow({
            auth: this.recorder.auth,
            scanId: `insert_${this.recorder.operations.length}`,
            schema: this.recorder.schema,
            tableName: this.tableName
        });
    }
    update(id, patch) {
        this.recorder.operations.push({
            id: serializeValue(id),
            op: "update",
            patch: serializeValue(patch),
            table: this.tableName
        });
    }
    delete(id) {
        this.recorder.operations.push({
            id: serializeValue(id),
            op: "delete",
            table: this.tableName
        });
    }
}
function createTraceContext({ mode, schema }) {
    const recorder = {
        auth: createSymbolicAuth(),
        mode,
        nextScanId: 1,
        operations: [],
        query: null,
        scans: new Map(),
        schema
    };
    const db = {};
    for (const tableName of Object.keys(schema ?? {})) {
        db[tableName] = new TableTrace({ recorder, tableName });
    }
    return {
        ctx: {
            auth: recorder.auth,
            db,
            env: {},
            log: {
                error() { },
                info() { },
                warn() { }
            }
        },
        recorder
    };
}
function diagnostic(file, message) {
    return { file, message };
}
async function readSourceFiles(sourceStore) {
    const paths = (await sourceStore.listFiles()).filter((path) => !path.startsWith("__lakebed/") && path !== LAKEBED_CONFIG_FILE && path !== SERVER_ENV_FILE);
    const files = [];
    for (const path of paths) {
        const contents = await sourceStore.readFile(path);
        files.push({
            bytes: byteLength(contents),
            contents,
            hash: sha256(contents),
            path
        });
    }
    return files.sort((left, right) => left.path.localeCompare(right.path));
}
function forbiddenSourceDiagnostics(files, { allowAsync = false } = {}) {
    const checks = [
        [/\beval\s*\(/, "eval is not available in anonymous server code."],
        [/\bFunction\s*\(/, "Function constructors are not available in anonymous server code."],
        [/\bimport\s*\(/, "Dynamic import is not available in anonymous server code."],
        [/\bfetch\b/, "Outbound fetch is disabled for anonymous deploys."],
        ...(allowAsync
            ? []
            : [[/\basync\b/, "Async server handlers are not part of the anonymous IR yet. Use synchronous Lakebed database operations."]]),
        [/\bwhile\s*\(/, "while loops are not available in anonymous server code."],
        [/\bfor\s*\(\s*;/, "Unbounded for loops are not available in anonymous server code."],
        [/\bprocess\b/, "process is not available in anonymous server code."],
        [/\bglobalThis\b/, "globalThis is not available in anonymous server code."],
        [/\bsetTimeout\s*\(/, "Timers are not available in anonymous server code."],
        [/\bsetInterval\s*\(/, "Timers are not available in anonymous server code."],
        [/from\s+["']node:/, "Node built-ins are not available in anonymous server code."]
    ];
    const diagnostics = [];
    for (const file of files.filter((candidate) => candidate.path.startsWith("server/") || candidate.path.startsWith("shared/"))) {
        for (const [pattern, message] of checks) {
            if (pattern.test(file.contents)) {
                diagnostics.push(diagnostic(file.path, message));
            }
        }
    }
    return diagnostics;
}
function serializeSchema(schema) {
    const cleanSchema = {};
    const diagnostics = [];
    for (const [tableName, table] of Object.entries(schema ?? {})) {
        if (table?.kind !== "table" || !isPlainObject(table.fields ?? {})) {
            diagnostics.push(diagnostic("server/index.ts", `Anonymous deploys only support Lakebed table() schema entries. Check schema.${tableName}.`));
            continue;
        }
        const fields = {};
        for (const [fieldName, field] of Object.entries(table.fields)) {
            if (!field || (field.kind !== "string" && field.kind !== "boolean")) {
                diagnostics.push(diagnostic("server/index.ts", `Anonymous deploys only support string() and boolean() fields. Check ${tableName}.${fieldName}.`));
                continue;
            }
            if (typeof field.defaultValue === "function") {
                diagnostics.push(diagnostic("server/index.ts", `Anonymous deploys do not support function defaults yet. Check ${tableName}.${fieldName}.`));
                continue;
            }
            fields[fieldName] = {
                defaultValue: field.defaultValue,
                kind: field.kind
            };
        }
        cleanSchema[tableName] = { kind: "table", fields };
    }
    return { diagnostics, schema: cleanSchema };
}
function isReservedEndpointPath(path) {
    return (path === "/" ||
        path === "/index.html" ||
        path === "/client.js" ||
        path === "/auth/callback" ||
        path.startsWith("/auth/") ||
        path === "/__lakebed" ||
        path.startsWith("/__lakebed/") ||
        path === "/__span" ||
        path.startsWith("/__span/"));
}
function validateEndpointRoute({ method, path }, diagnosticPath, diagnostics) {
    if (typeof method !== "string" || !endpointMethodPattern.test(method)) {
        diagnostics.push(diagnostic(diagnosticPath, "Endpoint method must be a valid uppercase HTTP method."));
    }
    if (typeof path !== "string" || !path.startsWith("/") || path.startsWith("//") || path.includes("\\") || path.includes("?") || path.includes("#")) {
        diagnostics.push(diagnostic(diagnosticPath, "Endpoint path must be an absolute app path like /webhooks/stripe."));
        return;
    }
    if (isReservedEndpointPath(path)) {
        diagnostics.push(diagnostic(diagnosticPath, `Endpoint path ${path} is reserved by Lakebed.`));
    }
}
function serializeEndpoints(endpoints) {
    const diagnostics = [];
    const cleanEndpoints = {};
    const seenRoutes = new Map();
    for (const [name, endpoint] of Object.entries(endpoints ?? {})) {
        const diagnosticPath = `server.index.endpoints.${name}`;
        if (!endpoint || endpoint.kind !== "endpoint" || typeof endpoint.handler !== "function") {
            diagnostics.push(diagnostic("server/index.ts", `Endpoint ${name} must be defined with endpoint({ method, path }, handler).`));
            continue;
        }
        const method = String(endpoint.method ?? "").toUpperCase();
        const path = String(endpoint.path ?? "");
        validateEndpointRoute({ method, path }, diagnosticPath, diagnostics);
        const routeKey = `${method} ${path}`;
        const existing = seenRoutes.get(routeKey);
        if (existing) {
            diagnostics.push(diagnostic("server/index.ts", `Endpoint ${name} duplicates ${existing} at ${routeKey}.`));
            continue;
        }
        seenRoutes.set(routeKey, name);
        cleanEndpoints[name] = {
            method,
            op: "source",
            path
        };
    }
    return { diagnostics, endpoints: cleanEndpoints };
}
function compileQueryHandler({ handler, name, schema }) {
    const { ctx, recorder } = createTraceContext({ mode: "query", schema });
    try {
        handler(ctx);
    }
    catch (error) {
        throw new Error(`Unable to compile query "${name}" to anonymous IR: ${error instanceof Error ? error.message : String(error)}`);
    }
    if (!recorder.query) {
        throw new Error(`Unable to compile query "${name}": query handlers must end with a ctx.db.<table>...all() call.`);
    }
    return recorder.query;
}
function isArgExpression(expr) {
    return Array.isArray(expr) && expr[0] === "arg" && Number.isInteger(expr[1]);
}
function expressionContainsOp(expr, targetOp) {
    if (!isExpression(expr)) {
        if (Array.isArray(expr)) {
            return expr.some((item) => expressionContainsOp(item, targetOp));
        }
        if (isPlainObject(expr)) {
            return Object.values(expr).some((value) => expressionContainsOp(value, targetOp));
        }
        return false;
    }
    if (expr[0] === targetOp) {
        return true;
    }
    return expr.slice(1).some((item) => expressionContainsOp(item, targetOp));
}
function expressionContainsArg(expr) {
    return isArgExpression(expr) || expressionContainsOp(expr, "arg");
}
function expressionContainsRow(expr) {
    return expressionContainsOp(expr, "row");
}
function directWriteGuardDiagnostic(name, operation) {
    return `Unable to compile mutation "${name}" to anonymous IR: Direct ${operation.op}(id) from an argument-derived value cannot be proven safe by the IR compiler. Use the anonymous source runtime, claim the deploy, or rewrite this mutation to an owner-filtered query shape.`;
}
function compileMutationHandler({ handler, name, schema }) {
    const { ctx, recorder } = createTraceContext({ mode: "mutation", schema });
    const args = Array.from({ length: Math.max(0, handler.length - 1) }, (_, index) => createSymbolicArg(index));
    try {
        handler(ctx, ...args);
    }
    catch (error) {
        throw new Error(`Unable to compile mutation "${name}" to anonymous IR: ${error instanceof Error ? error.message : String(error)}`);
    }
    const operations = [];
    for (const operation of recorder.operations) {
        if (operation.op === "scan" || operation.op === "get") {
            continue;
        }
        if (operation.op === "delete" && Array.isArray(operation.id) && operation.id[0] === "row") {
            const query = recorder.scans.get(operation.id[1]);
            if (!query) {
                throw new Error(`Unable to compile mutation "${name}": delete uses an unknown scanned row.`);
            }
            operations.push({ op: "deleteWhere", query, table: operation.table });
            continue;
        }
        if (operation.op === "update" || operation.op === "delete") {
            if (expressionContainsArg(operation.id)) {
                throw new Error(directWriteGuardDiagnostic(name, operation));
            }
            if (expressionContainsRow(operation.id)) {
                throw new Error(`Unable to compile mutation "${name}" to anonymous IR: ${operation.op} uses an unsupported symbolic row id.`);
            }
            operations.push(operation);
            continue;
        }
        operations.push(operation);
    }
    if (operations.length === 0) {
        throw new Error(`Unable to compile mutation "${name}": no supported database operation was recorded.`);
    }
    return {
        op: "mutation",
        params: args.map((_, index) => ({ name: `arg${index}`, type: "unknown" })),
        body: operations
    };
}
function compileServerToIr(app, schema) {
    const queries = {};
    const mutations = {};
    const diagnostics = [];
    for (const [name, handler] of Object.entries(app.queries ?? {})) {
        try {
            queries[name] = compileQueryHandler({ handler: handler, name, schema });
        }
        catch (error) {
            diagnostics.push(diagnostic("server/index.ts", error instanceof Error ? error.message : String(error)));
        }
    }
    for (const [name, handler] of Object.entries(app.mutations ?? {})) {
        try {
            mutations[name] = compileMutationHandler({ handler: handler, name, schema });
        }
        catch (error) {
            diagnostics.push(diagnostic("server/index.ts", error instanceof Error ? error.message : String(error)));
        }
    }
    return { diagnostics, mutations, queries };
}
export async function createAnonymousArtifact({ app, clientCssOut, clientOut, serverOut, sourceStore, version = LAKEBED_VERSION }) {
    const sourceFiles = await readSourceFiles(sourceStore);
    const diagnostics = forbiddenSourceDiagnostics(sourceFiles, { allowAsync: Boolean(serverOut) });
    const { diagnostics: schemaDiagnostics, schema } = serializeSchema(app.schema);
    const { diagnostics: endpointDiagnostics, endpoints } = serializeEndpoints(app.endpoints);
    diagnostics.push(...schemaDiagnostics);
    diagnostics.push(...endpointDiagnostics);
    if (!serverOut && Object.keys(endpoints).length > 0) {
        diagnostics.push(diagnostic("server/index.ts", "Endpoints require the source runtime. Build with a bundled server module."));
    }
    if (diagnostics.length > 0) {
        throw new AnonymousCompilerError(diagnostics);
    }
    const clientBundle = await readFile(clientOut);
    const clientBundleBase64 = clientBundle.toString("base64");
    const clientBundleHash = sha256(clientBundle);
    const clientCssBundle = clientCssOut ? await readFile(clientCssOut) : null;
    const clientCssBundleBase64 = clientCssBundle?.toString("base64");
    const clientCssBundleHash = clientCssBundle ? sha256(clientCssBundle) : null;
    const serverBundle = serverOut ? await readFile(serverOut) : null;
    const serverBundleBase64 = serverBundle?.toString("base64");
    const serverBundleHash = serverBundle ? sha256(serverBundle) : null;
    const sourceManifest = sourceFiles.map(({ bytes, hash, path }) => ({ bytes, hash, path }));
    const sourceSnapshotHash = sha256(stableStringify(sourceManifest) ?? "");
    const server = serverBundle
        ? {
            endpoints,
            helpers: {},
            imports: ["lakebed/server"],
            mutations: Object.fromEntries(Object.keys(app.mutations ?? {}).map((name) => [name, { op: "source" }])),
            queries: Object.fromEntries(Object.keys(app.queries ?? {}).map((name) => [name, { op: "source" }])),
            schema,
            source: {
                bytes: serverBundle.byteLength,
                bundle: serverBundleBase64,
                bundleHash: serverBundleHash,
                entry: "/server.mjs"
            }
        }
        : null;
    let compiled = null;
    if (!server) {
        compiled = compileServerToIr(app, schema);
        diagnostics.push(...compiled.diagnostics);
        if (diagnostics.length > 0) {
            throw new AnonymousCompilerError(diagnostics);
        }
    }
    const artifact = {
        name: app.name ?? "Lakebed Capsule",
        client: {
            bundleHash: clientBundleHash,
            bytes: clientBundle.byteLength,
            entry: "/client.js",
            style: clientCssBundle
                ? {
                    bundleHash: clientCssBundleHash,
                    bytes: clientCssBundle.byteLength,
                    entry: "/client.css"
                }
                : undefined
        },
        createdWith: {
            compiler: "0.1.0",
            lakebed: version
        },
        deployTarget: server ? "anonymous-source" : "anonymous-interpreter",
        format: ANONYMOUS_ARTIFACT_FORMAT,
        limits: {
            instructionBudget: DEFAULT_ANONYMOUS_LIMITS.instructionBudget,
            maxRowsReturned: DEFAULT_ANONYMOUS_LIMITS.rowsReturned,
            maxValueBytes: DEFAULT_ANONYMOUS_LIMITS.maxValueBytes
        },
        server: server ?? {
            endpoints: {},
            helpers: {},
            imports: ["lakebed/server"],
            mutations: compiled.mutations,
            queries: compiled.queries,
            schema
        },
        source: {
            files: sourceManifest,
            snapshotHash: sourceSnapshotHash
        }
    };
    const artifactHash = sha256(stableStringify(artifact) ?? "");
    return {
        artifact,
        artifactHash,
        clientBundle: clientBundleBase64,
        clientCssBundle: clientCssBundleBase64,
        clientCssBundleHash,
        clientBundleHash
    };
}
export async function createClaimedArtifact({ app, clientCssOut, clientOut, serverOut, sourceStore, version = LAKEBED_VERSION }) {
    if (!serverOut) {
        throw new AnonymousCompilerError([diagnostic("server/index.ts", "Claimed deploys require a bundled server module.")]);
    }
    const sourceFiles = await readSourceFiles(sourceStore);
    const diagnostics = forbiddenSourceDiagnostics(sourceFiles).filter((entry) => entry.message !== "Outbound fetch is disabled for anonymous deploys." &&
        entry.message !== "Async server handlers are not part of the anonymous IR yet. Use synchronous Lakebed database operations.");
    const { diagnostics: schemaDiagnostics, schema } = serializeSchema(app.schema);
    const { diagnostics: endpointDiagnostics, endpoints } = serializeEndpoints(app.endpoints);
    diagnostics.push(...schemaDiagnostics);
    diagnostics.push(...endpointDiagnostics);
    if (diagnostics.length > 0) {
        throw new AnonymousCompilerError(diagnostics);
    }
    const clientBundle = await readFile(clientOut);
    const clientCssBundle = clientCssOut ? await readFile(clientCssOut) : null;
    const serverBundle = await readFile(serverOut);
    const clientBundleBase64 = clientBundle.toString("base64");
    const clientBundleHash = sha256(clientBundle);
    const clientCssBundleBase64 = clientCssBundle?.toString("base64");
    const clientCssBundleHash = clientCssBundle ? sha256(clientCssBundle) : null;
    const serverBundleBase64 = serverBundle.toString("base64");
    const serverBundleHash = sha256(serverBundle);
    const sourceManifest = sourceFiles.map(({ bytes, hash, path }) => ({ bytes, hash, path }));
    const sourceSnapshotHash = sha256(stableStringify(sourceManifest) ?? "");
    const artifact = {
        name: app.name ?? "Lakebed Capsule",
        client: {
            bundleHash: clientBundleHash,
            bytes: clientBundle.byteLength,
            entry: "/client.js",
            style: clientCssBundle
                ? {
                    bundleHash: clientCssBundleHash,
                    bytes: clientCssBundle.byteLength,
                    entry: "/client.css"
                }
                : undefined
        },
        createdWith: {
            compiler: "0.1.0",
            lakebed: version
        },
        deployTarget: "claimed-source",
        format: ANONYMOUS_ARTIFACT_FORMAT,
        limits: {
            instructionBudget: DEFAULT_ANONYMOUS_LIMITS.instructionBudget,
            maxRowsReturned: DEFAULT_ANONYMOUS_LIMITS.rowsReturned,
            maxValueBytes: DEFAULT_ANONYMOUS_LIMITS.maxValueBytes
        },
        server: {
            endpoints,
            helpers: {},
            imports: ["lakebed/server"],
            mutations: Object.fromEntries(Object.keys(app.mutations ?? {}).map((name) => [name, { op: "source" }])),
            queries: Object.fromEntries(Object.keys(app.queries ?? {}).map((name) => [name, { op: "source" }])),
            schema,
            source: {
                bytes: serverBundle.byteLength,
                bundle: serverBundleBase64,
                bundleHash: serverBundleHash,
                entry: "/server.mjs"
            }
        },
        source: {
            files: sourceManifest,
            snapshotHash: sourceSnapshotHash
        }
    };
    const artifactHash = sha256(stableStringify(artifact) ?? "");
    return {
        artifact,
        artifactHash,
        clientBundle: clientBundleBase64,
        clientCssBundle: clientCssBundleBase64,
        clientCssBundleHash,
        clientBundleHash
    };
}
function validateExpression(expr, path, diagnostics) {
    if (!isExpression(expr)) {
        diagnostics.push(diagnostic(path, "Expected an anonymous IR expression."));
        return;
    }
    const [op] = expr;
    if (op === "arg") {
        if (!Number.isInteger(expr[1]) || expr.length !== 2) {
            diagnostics.push(diagnostic(path, "Invalid arg expression."));
        }
        return;
    }
    if (op === "auth") {
        if (!authFields.has(expr[1]) || expr.length !== 2) {
            diagnostics.push(diagnostic(path, "Invalid auth expression."));
        }
        return;
    }
    if (op === "row") {
        if (typeof expr[1] !== "string" || typeof expr[2] !== "string" || expr.length !== 3) {
            diagnostics.push(diagnostic(path, "Invalid row expression."));
        }
        return;
    }
    if (op === "call") {
        const method = expr[1];
        if (!["trim", "slice", "toLowerCase", "toUpperCase"].includes(method)) {
            diagnostics.push(diagnostic(path, `Unsupported call expression: ${method}`));
            return;
        }
        validateExpression(expr[2], path, diagnostics);
    }
}
function validateValue(value, path, diagnostics) {
    if (isExpression(value)) {
        validateExpression(value, path, diagnostics);
        return;
    }
    if (Array.isArray(value)) {
        for (const item of value) {
            validateValue(item, path, diagnostics);
        }
        return;
    }
    if (isPlainObject(value)) {
        for (const [key, entryValue] of Object.entries(value)) {
            validateValue(entryValue, `${path}.${key}`, diagnostics);
        }
    }
}
function validateQuery(query, path, schema, diagnostics) {
    if (query?.op === "source") {
        return;
    }
    if (!isPlainObject(query) || query.op !== "table.all" || !schema[query.table]) {
        diagnostics.push(diagnostic(path, "Invalid anonymous query IR."));
        return;
    }
    for (const filter of query.filters ?? []) {
        if (!filter || typeof filter.field !== "string") {
            diagnostics.push(diagnostic(path, "Invalid query filter."));
            continue;
        }
        validateValue(filter.value, path, diagnostics);
    }
    if (query.orderBy && (typeof query.orderBy.field !== "string" || !["asc", "desc"].includes(query.orderBy.direction))) {
        diagnostics.push(diagnostic(path, "Invalid query orderBy."));
    }
    if (query.limit !== null && query.limit !== undefined && (!Number.isInteger(query.limit) || query.limit <= 0)) {
        diagnostics.push(diagnostic(path, "Invalid query limit."));
    }
}
function validateGuards(guards, path, schema, tableName, diagnostics) {
    if (guards === undefined) {
        return;
    }
    if (!Array.isArray(guards)) {
        diagnostics.push(diagnostic(path, "Mutation guards must be an array."));
        return;
    }
    for (const [index, guard] of guards.entries()) {
        const guardPath = `${path}.guards.${index}`;
        if (!isPlainObject(guard) || guard.op !== "rowFieldEqualsAuth") {
            diagnostics.push(diagnostic(guardPath, "Unsupported mutation guard."));
            continue;
        }
        if (typeof guard.field !== "string" || !schema?.[tableName]?.fields?.[guard.field]) {
            diagnostics.push(diagnostic(guardPath, "Mutation guard field must exist in the table schema."));
        }
        if (guard.equalsAuth !== "userId") {
            diagnostics.push(diagnostic(guardPath, "Mutation guard auth field must be userId."));
        }
    }
}
export function validateAnonymousArtifact(artifact, { allowClaimedSource = false } = {}) {
    const diagnostics = [];
    if (!isPlainObject(artifact)) {
        return [diagnostic("artifact", "Artifact must be a JSON object.")];
    }
    if (artifact.format !== ANONYMOUS_ARTIFACT_FORMAT) {
        diagnostics.push(diagnostic("artifact.format", `Expected ${ANONYMOUS_ARTIFACT_FORMAT}.`));
    }
    const sourceDeployTargets = new Set(["anonymous-source", "claimed-source"]);
    if (artifact.deployTarget !== "anonymous-interpreter" &&
        artifact.deployTarget !== "anonymous-source" &&
        !(allowClaimedSource && artifact.deployTarget === "claimed-source")) {
        diagnostics.push(diagnostic("artifact.deployTarget", "Anonymous deploys require deployTarget anonymous-interpreter or anonymous-source."));
    }
    const schema = artifact.server?.schema;
    if (!isPlainObject(schema)) {
        diagnostics.push(diagnostic("artifact.server.schema", "Artifact must include a server schema."));
    }
    else {
        for (const [tableName, table] of Object.entries(schema)) {
            if (table?.kind !== "table" || !isPlainObject(table.fields)) {
                diagnostics.push(diagnostic(`artifact.server.schema.${tableName}`, "Invalid table schema."));
            }
            for (const [fieldName, field] of Object.entries(table.fields ?? {})) {
                if (field?.kind !== "string" && field?.kind !== "boolean") {
                    diagnostics.push(diagnostic(`artifact.server.schema.${tableName}.${fieldName}`, "Unsupported field kind."));
                }
            }
        }
    }
    for (const [name, query] of Object.entries(artifact.server?.queries ?? {})) {
        validateQuery(query, `artifact.server.queries.${name}`, schema ?? {}, diagnostics);
        if (query?.op === "source" && artifact.server?.source === undefined) {
            diagnostics.push(diagnostic(`artifact.server.queries.${name}`, "Source query requires artifact.server.source."));
        }
        if (query?.op === "source" && !sourceDeployTargets.has(artifact.deployTarget)) {
            diagnostics.push(diagnostic(`artifact.server.queries.${name}`, "Source query requires deployTarget anonymous-source or claimed-source."));
        }
    }
    const seenEndpointRoutes = new Map();
    for (const [name, endpoint] of Object.entries(artifact.server?.endpoints ?? {})) {
        const path = `artifact.server.endpoints.${name}`;
        if (!isPlainObject(endpoint) || endpoint.op !== "source") {
            diagnostics.push(diagnostic(path, "Endpoint must be source-backed."));
            continue;
        }
        validateEndpointRoute({ method: endpoint.method, path: endpoint.path }, path, diagnostics);
        const routeKey = `${endpoint.method} ${endpoint.path}`;
        const existing = seenEndpointRoutes.get(routeKey);
        if (existing) {
            diagnostics.push(diagnostic(path, `Endpoint route duplicates ${existing}.`));
        }
        seenEndpointRoutes.set(routeKey, name);
        if (artifact.server?.source === undefined) {
            diagnostics.push(diagnostic(path, "Source endpoint requires artifact.server.source."));
        }
        if (!sourceDeployTargets.has(artifact.deployTarget)) {
            diagnostics.push(diagnostic(path, "Source endpoint requires deployTarget anonymous-source or claimed-source."));
        }
    }
    if (artifact.server?.source !== undefined) {
        if (!sourceDeployTargets.has(artifact.deployTarget)) {
            diagnostics.push(diagnostic("artifact.server.source", "Server source bundles require deployTarget anonymous-source or claimed-source."));
        }
        const source = artifact.server.source;
        if (!isPlainObject(source) ||
            typeof source.bundle !== "string" ||
            typeof source.bundleHash !== "string" ||
            !Number.isInteger(source.bytes) ||
            source.bytes <= 0) {
            diagnostics.push(diagnostic("artifact.server.source", "Invalid anonymous server source bundle."));
        }
        else {
            const bundle = Buffer.from(source.bundle, "base64");
            if (bundle.byteLength !== source.bytes) {
                diagnostics.push(diagnostic("artifact.server.source.bytes", "Server bundle byte count does not match artifact.server.source.bytes."));
            }
            if (sha256(bundle) !== source.bundleHash) {
                diagnostics.push(diagnostic("artifact.server.source.bundleHash", "Server bundle hash does not match artifact.server.source.bundleHash."));
            }
        }
    }
    for (const [name, mutation] of Object.entries(artifact.server?.mutations ?? {})) {
        if (mutation?.op === "source") {
            if (artifact.server?.source === undefined) {
                diagnostics.push(diagnostic(`artifact.server.mutations.${name}`, "Source mutation requires artifact.server.source."));
            }
            if (!sourceDeployTargets.has(artifact.deployTarget)) {
                diagnostics.push(diagnostic(`artifact.server.mutations.${name}`, "Source mutation requires deployTarget anonymous-source or claimed-source."));
            }
            continue;
        }
        if (mutation?.op !== "mutation" || !Array.isArray(mutation.body)) {
            diagnostics.push(diagnostic(`artifact.server.mutations.${name}`, "Invalid mutation IR."));
            continue;
        }
        for (const [index, operation] of mutation.body.entries()) {
            const path = `artifact.server.mutations.${name}.body.${index}`;
            if (!["insert", "update", "delete", "deleteWhere"].includes(operation.op) || !schema?.[operation.table]) {
                diagnostics.push(diagnostic(path, `Unsupported mutation operation: ${operation.op}`));
                continue;
            }
            if (operation.op === "insert") {
                validateValue(operation.values, path, diagnostics);
            }
            else if (operation.op === "update") {
                validateValue(operation.id, path, diagnostics);
                validateValue(operation.patch, path, diagnostics);
                validateGuards(operation.guards, path, schema, operation.table, diagnostics);
            }
            else if (operation.op === "delete") {
                validateValue(operation.id, path, diagnostics);
                validateGuards(operation.guards, path, schema, operation.table, diagnostics);
            }
            else if (operation.op === "deleteWhere") {
                validateQuery(operation.query, path, schema, diagnostics);
            }
        }
    }
    if (byteLength(artifact) > DEFAULT_ANONYMOUS_LIMITS.artifactBytes) {
        diagnostics.push(diagnostic("artifact", `Artifact exceeds ${DEFAULT_ANONYMOUS_LIMITS.artifactBytes} bytes.`));
    }
    return diagnostics;
}
export function validateAnonymousDeployPayload(payload, options = {}) {
    if (!isPlainObject(payload)) {
        throw new Error("Deploy payload must be a JSON object.");
    }
    const diagnostics = validateAnonymousArtifact(payload.artifact, options);
    if (diagnostics.length > 0) {
        throw new AnonymousCompilerError(diagnostics);
    }
    const clientBundle = Buffer.from(String(payload.clientBundle ?? ""), "base64");
    const clientBundleHash = sha256(clientBundle);
    if (clientBundleHash !== payload.artifact.client?.bundleHash) {
        throw new Error("Client bundle hash does not match artifact.client.bundleHash.");
    }
    if (clientBundle.byteLength !== payload.artifact.client?.bytes) {
        throw new Error("Client bundle byte count does not match artifact.client.bytes.");
    }
    const artifactHash = sha256(stableStringify(payload.artifact) ?? "");
    const serverEnv = validateServerEnvPayload(payload.serverEnv);
    return {
        artifact: cloneJson(payload.artifact),
        artifactHash,
        clientBundle,
        clientBundleBase64: clientBundle.toString("base64"),
        clientBundleHash,
        serverEnv
    };
}
export function parseTtlSeconds(value, fallback = 7 * 24 * 60 * 60) {
    if (value === undefined || value === null || value === "") {
        return fallback;
    }
    if (typeof value === "number") {
        return Math.max(60, Math.min(fallback, Math.floor(value)));
    }
    const match = String(value).trim().match(/^(\d+)([smhd])?$/);
    if (!match) {
        throw new Error(`Invalid TTL: ${value}. Use a value like 1h, 3d, or 604800.`);
    }
    const amount = Number(match[1]);
    const unit = match[2] ?? "s";
    const multipliers = { d: 86400, h: 3600, m: 60, s: 1 };
    return Math.max(60, Math.min(fallback, amount * multipliers[unit]));
}
export function createDeployId() {
    return `dep_${randomBytes(12).toString("base64url")}`;
}
export function createClaimToken() {
    return `tok_${randomBytes(24).toString("base64url")}`;
}
export function createSlug() {
    const adjectives = ["frosted", "quiet", "bright", "lucky", "silver", "rapid", "clear", "open"];
    const nouns = ["river", "field", "ridge", "harbor", "garden", "signal", "meadow", "orbit"];
    const words = randomBytes(2);
    const suffix = randomBytes(5).toString("hex");
    return `${adjectives[words[0] % adjectives.length]}-${nouns[words[1] % nouns.length]}-${suffix}`;
}
export function hashClaimToken(token) {
    return sha256(token);
}
function metadataFields() {
    return new Set(["id", "createdAt", "updatedAt"]);
}
function assertFieldValue(tableName, fieldName, field, value, limits = DEFAULT_ANONYMOUS_LIMITS) {
    if (value === undefined) {
        throw new Error(`Missing value for ${tableName}.${fieldName}`);
    }
    if (field.kind === "string" && typeof value !== "string") {
        throw new Error(`Expected ${tableName}.${fieldName} to be a string.`);
    }
    if (field.kind === "boolean" && typeof value !== "boolean") {
        throw new Error(`Expected ${tableName}.${fieldName} to be a boolean.`);
    }
    const maxValueBytes = limits.maxValueBytes ?? DEFAULT_ANONYMOUS_LIMITS.maxValueBytes;
    if (byteLength(value) > maxValueBytes) {
        throw new Error(`Value for ${tableName}.${fieldName} exceeds ${maxValueBytes} bytes.`);
    }
}
function prepareInsert(schema, tableName, value, limits = DEFAULT_ANONYMOUS_LIMITS) {
    const table = schema[tableName];
    if (!table) {
        throw new Error(`Unknown table: ${tableName}`);
    }
    const fields = (table.fields ?? {});
    const metadata = metadataFields();
    for (const key of Object.keys(value)) {
        if (!fields[key] && !metadata.has(key)) {
            throw new Error(`Unknown field for ${tableName}: ${key}`);
        }
        if (metadata.has(key)) {
            throw new Error(`Lakebed manages ${tableName}.${key}; app code cannot set it directly.`);
        }
    }
    const timestamp = new Date().toISOString();
    const row = {
        id: randomUUID(),
        createdAt: timestamp,
        updatedAt: timestamp
    };
    for (const [fieldName, field] of Object.entries(fields)) {
        const valueOrDefault = Object.prototype.hasOwnProperty.call(value, fieldName) ? value[fieldName] : field.defaultValue;
        assertFieldValue(tableName, fieldName, field, valueOrDefault, limits);
        row[fieldName] = valueOrDefault;
    }
    return row;
}
function preparePatch(schema, tableName, patch, limits = DEFAULT_ANONYMOUS_LIMITS) {
    const table = schema[tableName];
    if (!table) {
        throw new Error(`Unknown table: ${tableName}`);
    }
    const cleanPatch = {};
    const fields = table.fields ?? {};
    const metadata = metadataFields();
    for (const [key, value] of Object.entries(patch)) {
        if (!fields[key] && !metadata.has(key)) {
            throw new Error(`Unknown field for ${tableName}: ${key}`);
        }
        if (metadata.has(key)) {
            throw new Error(`Lakebed manages ${tableName}.${key}; app code cannot update it directly.`);
        }
        assertFieldValue(tableName, key, fields[key], value, limits);
        cleanPatch[key] = value;
    }
    cleanPatch.updatedAt = new Date().toISOString();
    return cleanPatch;
}
export function prepareAnonymousInsert(schema, tableName, value, limits = DEFAULT_ANONYMOUS_LIMITS) {
    return prepareInsert(schema, tableName, value, limits);
}
export function prepareAnonymousPatch(schema, tableName, patch, limits = DEFAULT_ANONYMOUS_LIMITS) {
    return preparePatch(schema, tableName, patch, limits);
}
//# sourceMappingURL=anonymous.js.map
