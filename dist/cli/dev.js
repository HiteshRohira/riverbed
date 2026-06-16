import { createServer } from "node:http";
import { readdir, readFile, stat } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { clearLine, cursorTo } from "node:readline";
import { WebSocketServer } from "ws";
import { authFromUrl as resolveAuthFromUrl, requestOrigin, shooBaseUrlFromEnv } from "../auth.js";
import { LogBuffer, StateCell } from "../runtime.js";
import { positionals, readNumberArg, resolveCapsuleDir } from "./args.js";
import { buildCapsule } from "./build.js";
import { readAuth } from "./auth-store.js";
const endpointBodyMaxBytes = 2 * 1024 * 1024;
export function formatDevUpdateAge(updatedAt, now = new Date()) {
    const elapsedSeconds = Math.max(0, Math.floor((now.getTime() - updatedAt.getTime()) / 1000));
    if (elapsedSeconds < 30) {
        return `${elapsedSeconds} ${elapsedSeconds === 1 ? "second" : "seconds"} ago`;
    }
    if (elapsedSeconds < 60) {
        return "under 1 minute ago";
    }
    const elapsedMinutes = Math.floor(elapsedSeconds / 60);
    return `${elapsedMinutes} ${elapsedMinutes === 1 ? "minute" : "minutes"} ago`;
}
export function devUpdateRefreshDelay(updatedAt, now = new Date()) {
    const elapsedSeconds = Math.max(0, Math.floor((now.getTime() - updatedAt.getTime()) / 1000));
    return elapsedSeconds < 30 ? 1_000 : 30_000;
}
export function createDevStatusWriter({ quiet = false } = {}) {
    let wroteStatusLine = false;
    let lastUpdatedAt = null;
    let refreshTimer = null;
    function clearRefreshTimer() {
        if (refreshTimer) {
            clearTimeout(refreshTimer);
            refreshTimer = null;
        }
    }
    function render() {
        if (quiet || !process.stdout.isTTY || !lastUpdatedAt) {
            return;
        }
        const message = `Live updated with your changes ${formatDevUpdateAge(lastUpdatedAt)}`;
        clearLine(process.stdout, 0);
        cursorTo(process.stdout, 0);
        process.stdout.write(message);
        wroteStatusLine = true;
    }
    function scheduleRefresh() {
        clearRefreshTimer();
        if (quiet || !process.stdout.isTTY || !lastUpdatedAt) {
            return;
        }
        refreshTimer = setTimeout(() => {
            refreshTimer = null;
            render();
            scheduleRefresh();
        }, devUpdateRefreshDelay(lastUpdatedAt));
    }
    return {
        close() {
            clearRefreshTimer();
            this.finish();
        },
        finish() {
            if (wroteStatusLine && process.stdout.isTTY) {
                process.stdout.write("\n");
            }
            wroteStatusLine = false;
        },
        update(date = new Date()) {
            if (quiet || !process.stdout.isTTY) {
                return;
            }
            lastUpdatedAt = date;
            render();
            scheduleRefresh();
        }
    };
}
function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (character) => {
        return {
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;"
        }[character] ?? character;
    });
}
export function html(title, { shooBaseUrl } = {}) {
    return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)}</title>
    <link rel="stylesheet" href="/client.css" />
  </head>
  <body>
    <div id="app"></div>
    <script>window.__LAKEBED_AUTH__ = ${JSON.stringify({ shooBaseUrl })};</script>
    <script type="module" src="/client.js"></script>
  </body>
</html>`;
}
export function wantsHtml(req) {
    const accept = String(req.headers.accept ?? "");
    return !accept || accept.includes("text/html");
}
export function isReservedClientShellPath(pathname) {
    return (pathname === "/client.js" ||
        pathname === "/client.css" ||
        pathname === "/__lakebed" ||
        pathname.startsWith("/__lakebed/") ||
        pathname === "/__span" ||
        pathname.startsWith("/__span/") ||
        (pathname.startsWith("/auth/") && pathname !== "/auth/callback"));
}
export function isClientShellRequest(req, pathname) {
    return req.method === "GET" && wantsHtml(req) && !isReservedClientShellPath(pathname);
}
export function sendJson(ws, message) {
    ws.send(JSON.stringify(message));
}
export async function readRequestBody(req, maxBytes = endpointBodyMaxBytes) {
    const chunks = [];
    let total = 0;
    for await (const chunk of req) {
        total += chunk.byteLength;
        if (total > maxBytes) {
            throw new Error(`Request body exceeds ${maxBytes} bytes.`);
        }
        chunks.push(chunk);
    }
    return Buffer.concat(chunks);
}
export function headersFromNodeRequest(headers) {
    const clean = {};
    for (const [name, value] of Object.entries(headers ?? {})) {
        if (Array.isArray(value)) {
            clean[name.toLowerCase()] = value.join(", ");
        }
        else if (value !== undefined) {
            clean[name.toLowerCase()] = String(value);
        }
    }
    return clean;
}
export function createEndpointRequest({ body, headers, method, url }) {
    const requestUrl = new URL(url.href);
    const headerMap = new Map(Object.entries(headersFromNodeRequest(headers)));
    const requestBody = Buffer.from(body);
    return {
        headers: {
            entries() {
                return headerMap.entries();
            },
            get(name) {
                return headerMap.get(String(name).toLowerCase()) ?? null;
            },
            has(name) {
                return headerMap.has(String(name).toLowerCase());
            }
        },
        method: String(method ?? "GET").toUpperCase(),
        path: requestUrl.pathname,
        query: new URLSearchParams(requestUrl.searchParams),
        url: requestUrl.href,
        async bytes() {
            return new Uint8Array(requestBody);
        },
        async json() {
            return JSON.parse(requestBody.toString("utf8"));
        },
        async text() {
            return requestBody.toString("utf8");
        }
    };
}
export function endpointBodyToBuffer(body) {
    if (body === undefined || body === null) {
        return Buffer.alloc(0);
    }
    if (Buffer.isBuffer(body)) {
        return body;
    }
    if (typeof body === "string") {
        return Buffer.from(body, "utf8");
    }
    if (body instanceof ArrayBuffer) {
        return Buffer.from(body);
    }
    if (ArrayBuffer.isView(body)) {
        return Buffer.from(body.buffer, body.byteOffset, body.byteLength);
    }
    return Buffer.from(JSON.stringify(body ?? null), "utf8");
}
export function endpointStatus(status, fallback = 200) {
    const parsed = Number(status);
    return Number.isInteger(parsed) && parsed >= 100 && parsed <= 599 ? parsed : fallback;
}
export function headersToObject(headers = {}) {
    if (!headers) {
        return {};
    }
    if (typeof headers.entries === "function") {
        return Object.fromEntries(Array.from(headers.entries()).map(([key, value]) => [
            String(key),
            String(value)
        ]));
    }
    if (Array.isArray(headers)) {
        return Object.fromEntries(headers.map(([key, value]) => [String(key), String(value)]));
    }
    if (typeof headers === "object") {
        return Object.fromEntries(Object.entries(headers).map(([key, value]) => [String(key), String(value)]));
    }
    return {};
}
export async function normalizeEndpointResponse(result) {
    if (result === undefined || result === null) {
        return { body: Buffer.alloc(0), headers: {}, status: 204 };
    }
    if (typeof Response !== "undefined" && result instanceof Response) {
        return {
            body: Buffer.from(await result.arrayBuffer()),
            headers: headersToObject(result.headers),
            status: endpointStatus(result.status)
        };
    }
    if (typeof result === "object" && result.kind === "response") {
        const response = result;
        return {
            body: endpointBodyToBuffer(response.body),
            headers: headersToObject(response.headers),
            status: endpointStatus(response.status)
        };
    }
    if (typeof result === "string") {
        return {
            body: endpointBodyToBuffer(result),
            headers: { "Content-Type": "text/plain; charset=utf-8" },
            status: 200
        };
    }
    return {
        body: endpointBodyToBuffer(result),
        headers: { "Content-Type": "application/json; charset=utf-8" },
        status: 200
    };
}
export function sanitizeEndpointResponseHeaders(headers = {}) {
    const blocked = new Set(["connection", "content-length", "date", "keep-alive", "transfer-encoding", "upgrade"]);
    const clean = {};
    for (const [rawName, rawValue] of Object.entries(headers)) {
        const name = String(rawName);
        const lower = name.toLowerCase();
        if (!/^[a-z0-9!#$%&'*+.^_`|~-]+$/i.test(name) || blocked.has(lower)) {
            continue;
        }
        clean[name] = String(rawValue);
    }
    return clean;
}
export function sendEndpointResponse(res, response) {
    const body = response.body ?? Buffer.alloc(0);
    res.writeHead(response.status, {
        ...sanitizeEndpointResponseHeaders(response.headers),
        "Content-Length": String(body.byteLength)
    });
    res.end(body);
}
export function endpointDefinitions(app) {
    return Object.entries(app.endpoints ?? {}).map(([name, endpoint]) => {
        const value = endpoint;
        return {
            handler: value?.handler ?? endpoint,
            method: String(value?.method ?? "").toUpperCase(),
            name,
            path: String(value?.path ?? "")
        };
    });
}
export function findEndpoint(app, method, path) {
    const requestMethod = String(method ?? "GET").toUpperCase();
    return endpointDefinitions(app).find((endpoint) => endpoint.method === requestMethod && endpoint.path === path) ?? null;
}
export async function capsuleFileFingerprint(rootDir, dir = rootDir, entries = []) {
    const dirEntries = await readdir(dir, { withFileTypes: true });
    for (const entry of dirEntries) {
        const isRootBinding = dir === rootDir && entry.name === "lakebed.json";
        if (entry.name === "node_modules" || entry.name === ".lakebed" || entry.name === ".DS_Store" || isRootBinding) {
            continue;
        }
        const absolutePath = join(dir, entry.name);
        if (entry.isDirectory()) {
            await capsuleFileFingerprint(rootDir, absolutePath, entries);
            continue;
        }
        if (!entry.isFile()) {
            continue;
        }
        const info = await stat(absolutePath);
        const path = relative(rootDir, absolutePath).split(sep).join("/");
        entries.push(`${path}:${info.size}:${info.mtimeMs}`);
    }
    return entries.sort().join("\n");
}
export function createContext({ stateCell, auth, logs, env }) {
    return {
        auth,
        db: stateCell.createDb(),
        env,
        log: logs.createLogger()
    };
}
export async function runQuery({ app, stateCell, auth, logs, env, name }) {
    const handler = app.queries?.[name];
    if (!handler) {
        throw new Error(`Unknown query: ${name}`);
    }
    return handler(createContext({ stateCell, auth, logs, env }));
}
export async function runMutation({ app, stateCell, auth, logs, env, name, args }) {
    const handler = app.mutations?.[name];
    if (!handler) {
        throw new Error(`Unknown mutation: ${name}`);
    }
    return stateCell.transaction((db) => handler({
        auth,
        db,
        env,
        log: logs.createLogger()
    }, ...args));
}
export async function runEndpoint({ stateCell, auth, logs, env, endpoint, request }) {
    if (typeof endpoint.handler !== "function") {
        throw new Error(`Unknown endpoint: ${endpoint.name}`);
    }
    return stateCell.transaction(async (db) => {
        const result = await endpoint.handler({
            auth,
            db,
            env,
            log: logs.createLogger()
        }, request);
        return normalizeEndpointResponse(result);
    });
}
export async function startDevServer({ capsuleDir, sourceStore, port = 3000, capsuleId = "dev", quiet = false, shooBaseUrl = shooBaseUrlFromEnv() } = {}) {
    const resolvedCapsuleDir = resolveCapsuleDir(capsuleDir);
    let currentBuild = await buildCapsule({ capsuleDir: resolvedCapsuleDir, sourceStore, capsuleId });
    const defaultAuth = await readAuth();
    const stateCell = new StateCell(currentBuild.app.schema);
    const devStatus = createDevStatusWriter({ quiet });
    const logs = new LogBuffer({ beforeConsoleWrite: () => devStatus.finish() });
    const subscriptions = new Map();
    let fileFingerprint = sourceStore ? "" : await capsuleFileFingerprint(resolvedCapsuleDir);
    let rebuildTimer = null;
    let rebuildPromise = Promise.resolve();
    async function rebuild() {
        try {
            const nextBuild = await buildCapsule({ capsuleDir: resolvedCapsuleDir, sourceStore, capsuleId });
            currentBuild = nextBuild;
            stateCell.updateSchema(nextBuild.app.schema);
            devStatus.update();
            for (const client of wss.clients) {
                sendJson(client, { op: "refresh" });
            }
        }
        catch (error) {
            logs.append("error", "dev server rebuild failed", { error: error instanceof Error ? error.message : String(error) });
        }
    }
    function scheduleRebuild() {
        if (rebuildTimer) {
            clearTimeout(rebuildTimer);
        }
        rebuildTimer = setTimeout(() => {
            rebuildTimer = null;
            rebuildPromise = rebuildPromise.then(rebuild, rebuild);
        }, 100);
    }
    const server = createServer(async (req, res) => {
        try {
            const requestUrl = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
            if (requestUrl.pathname === "/" || requestUrl.pathname === "/index.html" || requestUrl.pathname === "/auth/callback") {
                res.writeHead(200, { "Cache-Control": "no-store", "Content-Type": "text/html; charset=utf-8" });
                res.end(html(currentBuild.app.name ?? "Lakebed Capsule", { shooBaseUrl }));
                return;
            }
            if (requestUrl.pathname === "/client.js") {
                res.writeHead(200, { "Cache-Control": "no-store", "Content-Type": "application/javascript; charset=utf-8" });
                res.end(await readFile(currentBuild.clientOut, "utf8"));
                return;
            }
            if (requestUrl.pathname === "/client.css") {
                res.writeHead(200, { "Cache-Control": "no-store", "Content-Type": "text/css; charset=utf-8" });
                res.end(await readFile(currentBuild.clientCssOut, "utf8"));
                return;
            }
            if (requestUrl.pathname === "/__lakebed/logs") {
                res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
                res.end(JSON.stringify(logs.entries, null, 2));
                return;
            }
            if (requestUrl.pathname === "/__lakebed/db/tables") {
                res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
                res.end(JSON.stringify(stateCell.listTables(), null, 2));
                return;
            }
            if (requestUrl.pathname === "/__lakebed/db") {
                res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
                res.end(JSON.stringify(stateCell.dump(), null, 2));
                return;
            }
            const endpoint = findEndpoint(currentBuild.app, req.method, requestUrl.pathname);
            if (endpoint) {
                const auth = await resolveAuthFromUrl({
                    defaultAuth,
                    onError: (error) => {
                        logs.append("warn", "endpoint auth verification failed", { error: error instanceof Error ? error.message : String(error) });
                    },
                    origin: requestOrigin(req),
                    shooBaseUrl,
                    url: requestUrl
                });
                const body = await readRequestBody(req);
                const endpointRequest = createEndpointRequest({
                    body,
                    headers: req.headers,
                    method: req.method,
                    url: requestUrl
                });
                const { result: response } = await runEndpoint({
                    auth,
                    endpoint,
                    env: currentBuild.env,
                    logs,
                    request: endpointRequest,
                    stateCell
                });
                sendEndpointResponse(res, response);
                await publishAll();
                return;
            }
            if (isClientShellRequest(req, requestUrl.pathname)) {
                res.writeHead(200, { "Cache-Control": "no-store", "Content-Type": "text/html; charset=utf-8" });
                res.end(html(currentBuild.app.name ?? "Lakebed Capsule", { shooBaseUrl }));
                return;
            }
            res.writeHead(404);
            res.end("Not found");
        }
        catch (error) {
            res.writeHead(500);
            res.end(error instanceof Error ? error.stack : String(error));
        }
    });
    const wss = new WebSocketServer({ noServer: true });
    async function publishAll() {
        for (const [ws, subscription] of subscriptions) {
            for (const name of subscription.queries) {
                try {
                    const data = await runQuery({
                        app: currentBuild.app,
                        stateCell,
                        auth: subscription.auth,
                        logs,
                        env: currentBuild.env,
                        name
                    });
                    sendJson(ws, { op: "query.result", name, data });
                }
                catch (error) {
                    sendJson(ws, { op: "query.error", name, error: error instanceof Error ? error.message : String(error) });
                }
            }
        }
    }
    wss.on("connection", (ws, _req, auth) => {
        subscriptions.set(ws, { auth, queries: new Set() });
        sendJson(ws, { op: "auth.result", auth });
        ws.on("message", async (raw) => {
            const subscription = subscriptions.get(ws);
            let message;
            try {
                message = JSON.parse(String(raw));
            }
            catch {
                sendJson(ws, { error: "Invalid JSON message.", op: "error", ok: false });
                return;
            }
            try {
                if (!subscription) {
                    throw new Error("Lakebed connection closed.");
                }
                if (message.op === "auth.get") {
                    sendJson(ws, { id: message.id, op: "auth.result", ok: true, auth: subscription.auth });
                    return;
                }
                if (message.op === "query.subscribe") {
                    subscription.queries.add(message.name);
                    const data = await runQuery({
                        app: currentBuild.app,
                        stateCell,
                        auth: subscription.auth,
                        logs,
                        env: currentBuild.env,
                        name: message.name
                    });
                    sendJson(ws, { id: message.id, op: "query.result", ok: true, name: message.name, data });
                    return;
                }
                if (message.op === "mutation.run") {
                    const { result } = await runMutation({
                        app: currentBuild.app,
                        stateCell,
                        auth: subscription.auth,
                        logs,
                        env: currentBuild.env,
                        name: message.name,
                        args: message.args ?? []
                    });
                    sendJson(ws, { id: message.id, op: "mutation.result", ok: true, result });
                    await publishAll();
                    return;
                }
                throw new Error(`Unknown operation: ${message.op}`);
            }
            catch (error) {
                sendJson(ws, {
                    id: message.id,
                    op: "error",
                    ok: false,
                    error: error instanceof Error ? error.message : String(error)
                });
            }
        });
        ws.on("close", () => {
            subscriptions.delete(ws);
        });
    });
    server.on("upgrade", async (req, socket, head) => {
        try {
            const requestUrl = new URL(req.url ?? "/", "http://lakebed.local");
            if (requestUrl.pathname !== "/__lakebed/ws") {
                socket.destroy();
                return;
            }
            const auth = await resolveAuthFromUrl({
                defaultAuth,
                onError: (error) => {
                    logs.append("warn", "websocket auth verification failed", { error: error instanceof Error ? error.message : String(error) });
                },
                origin: requestOrigin(req),
                shooBaseUrl,
                url: requestUrl
            });
            wss.handleUpgrade(req, socket, head, (ws) => {
                wss.emit("connection", ws, req, auth);
            });
        }
        catch (error) {
            logs.append("warn", "websocket upgrade failed", { error: error instanceof Error ? error.message : String(error) });
            socket.destroy();
        }
    });
    await new Promise((resolveListen, rejectListen) => {
        server.once("error", rejectListen);
        server.listen(port, () => {
            server.off("error", rejectListen);
            resolveListen();
        });
    });
    if (!quiet) {
        console.log(`Lakebed capsule running at http://localhost:${port}`);
        console.log(`Capsule: ${resolvedCapsuleDir}`);
        console.log(`Auth: ${defaultAuth.userId}`);
    }
    const watchInterval = sourceStore
        ? null
        : setInterval(async () => {
            try {
                const nextFingerprint = await capsuleFileFingerprint(resolvedCapsuleDir);
                if (nextFingerprint === fileFingerprint) {
                    return;
                }
                fileFingerprint = nextFingerprint;
                scheduleRebuild();
            }
            catch (error) {
                logs.append("error", "dev server file watch failed", { error: error instanceof Error ? error.message : String(error) });
            }
        }, 300);
    return {
        get app() {
            return currentBuild.app;
        },
        get buildDir() {
            return currentBuild.buildDir;
        },
        capsuleDir: resolvedCapsuleDir,
        logs,
        port,
        stateCell,
        url: `http://localhost:${port}`,
        async close() {
            if (watchInterval) {
                clearInterval(watchInterval);
            }
            if (rebuildTimer) {
                clearTimeout(rebuildTimer);
            }
            await rebuildPromise.catch(() => { });
            devStatus.close();
            for (const client of wss.clients) {
                client.close();
            }
            await new Promise((resolveClose) => {
                wss.close(() => {
                    server.close(() => resolveClose());
                });
            });
        }
    };
}
export async function dev(args) {
    const [capsuleArg] = positionals(args);
    const port = readNumberArg(args, "--port", 3000);
    await startDevServer({
        capsuleDir: resolveCapsuleDir(capsuleArg),
        port,
        capsuleId: `dev-${port}`
    });
}
//# sourceMappingURL=dev.js.map
