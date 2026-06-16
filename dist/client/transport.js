// WebSocket lifecycle and message protocol: connect/reconnect, send,
// request/response correlation, subscription dispatch, and the query value
// cache + listeners.
import { basePath, emitAuth, getAuthResumeStarted, setAuth, storedAuthToken, withAuthLoading } from "./internal.js";
import { ensureAuthInitialized } from "./auth.js";
let socket = null;
let nextRequestId = 1;
let refreshRequested = false;
const queryValues = new Map();
const queryListeners = new Map();
const pending = new Map();
const activeSubscriptions = new Set();
export function getQueryValue(name) {
    return queryValues.get(name);
}
export function addQueryListener(name, listener) {
    activeSubscriptions.add(name);
    if (!queryListeners.has(name)) {
        queryListeners.set(name, new Set());
    }
    queryListeners.get(name).add(listener);
}
export function removeQueryListener(name, listener) {
    queryListeners.get(name)?.delete(listener);
}
function emitQuery(name, value) {
    queryValues.set(name, value);
    const listeners = queryListeners.get(name);
    if (!listeners) {
        return;
    }
    for (const listener of listeners) {
        listener(value);
    }
}
function refreshPage() {
    if (refreshRequested) {
        return;
    }
    refreshRequested = true;
    window.location.reload();
}
export function send(message) {
    const ws = connect();
    const payload = JSON.stringify(message);
    if (ws.readyState === WebSocket.OPEN) {
        ws.send(payload);
        return;
    }
    ws.addEventListener("open", () => {
        ws.send(payload);
    }, { once: true });
}
export function request(op, payload) {
    const id = nextRequestId++;
    send({ id, op, ...payload });
    return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
    });
}
export function connect() {
    if (socket && socket.readyState !== WebSocket.CLOSED && socket.readyState !== WebSocket.CLOSING) {
        return socket;
    }
    void ensureAuthInitialized();
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const url = new URL(`${protocol}//${window.location.host}${basePath()}/__lakebed/ws`);
    const guestName = new URLSearchParams(window.location.search).get("lakebed_guest");
    if (guestName) {
        url.searchParams.set("lakebed_guest", guestName);
    }
    const token = storedAuthToken();
    if (token) {
        url.searchParams.set("lakebed_token", token);
    }
    socket = new WebSocket(url);
    const currentSocket = socket;
    currentSocket.addEventListener("open", () => {
        send({ op: "auth.get" });
        for (const name of activeSubscriptions) {
            send({ op: "query.subscribe", name });
        }
    });
    currentSocket.addEventListener("message", (event) => {
        const message = JSON.parse(String(event.data));
        if (message.op === "auth.result") {
            if (getAuthResumeStarted()) {
                return;
            }
            setAuth(withAuthLoading(message.auth, false));
            emitAuth();
            return;
        }
        if (message.op === "query.result") {
            emitQuery(message.name, message.data);
            return;
        }
        if (message.op === "refresh") {
            refreshPage();
            return;
        }
        if (message.id && pending.has(message.id)) {
            const handlers = pending.get(message.id);
            pending.delete(message.id);
            if (message.ok) {
                handlers.resolve(message.result);
            }
            else {
                handlers.reject(new Error(message.error ?? "Lakebed request failed"));
            }
        }
    });
    currentSocket.addEventListener("close", () => {
        if (socket !== currentSocket) {
            return;
        }
        window.setTimeout(() => {
            if (socket !== currentSocket) {
                return;
            }
            socket = null;
            connect();
        }, 500);
    });
    return socket;
}
export function reconnect() {
    if (socket && socket.readyState !== WebSocket.CLOSED && socket.readyState !== WebSocket.CLOSING) {
        socket.close();
    }
    socket = null;
    connect();
}
//# sourceMappingURL=transport.js.map