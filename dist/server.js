export function capsule(definition) {
    return definition;
}
export function query(handler) {
    return handler;
}
export function mutation(handler) {
    return handler;
}
export function endpoint(route, handler) {
    return {
        handler,
        kind: "endpoint",
        method: String(route?.method ?? "").toUpperCase(),
        path: String(route?.path ?? "")
    };
}
function response(body, { headers = {}, status = 200 } = {}) {
    return {
        body,
        headers,
        kind: "response",
        status
    };
}
export function json(value, options = {}) {
    return response(JSON.stringify(value ?? null), {
        ...options,
        headers: {
            "Content-Type": "application/json; charset=utf-8",
            ...(options.headers ?? {})
        }
    });
}
export function text(value, options = {}) {
    return response(String(value ?? ""), {
        ...options,
        headers: {
            "Content-Type": "text/plain; charset=utf-8",
            ...(options.headers ?? {})
        }
    });
}
export function empty(options = {}) {
    return response("", { status: 204, ...options });
}
export function redirect(url, options = {}) {
    return response("", {
        status: 302,
        ...options,
        headers: {
            Location: String(url),
            ...(options.headers ?? {})
        }
    });
}
function field(kind) {
    return {
        kind,
        defaultValue: undefined,
        default(value) {
            return {
                ...this,
                defaultValue: value
            };
        }
    };
}
export function table(fields) {
    return {
        kind: "table",
        fields
    };
}
export function string() {
    return field("string");
}
export function boolean() {
    return field("boolean");
}
//# sourceMappingURL=server.js.map