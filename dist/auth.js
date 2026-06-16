const DEFAULT_SHOO_BASE_URL = "https://shoo.dev";
export function shooBaseUrlFromEnv(env = process.env) {
    return String(env.LAKEBED_SHOO_BASE_URL ?? env.SHOO_BASE_URL ?? DEFAULT_SHOO_BASE_URL).replace(/\/+$/g, "");
}
export function toGuestName(name) {
    return (String(name ?? "local")
        .replace(/^guest:/, "")
        .trim()
        .replace(/[^a-zA-Z0-9_.-]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .toLowerCase() || "local");
}
export function toDisplayName(name) {
    return toGuestName(name)
        .split(/[-_\s.]+/)
        .filter(Boolean)
        .map((part) => `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`)
        .join(" ");
}
export function createGuestAuth(name) {
    const guestName = toGuestName(name);
    return {
        displayName: toDisplayName(guestName),
        isAuthenticated: false,
        isGuest: true,
        provider: "guest",
        userId: `guest:${guestName}`
    };
}
export function requestOrigin(req, fallbackUrl) {
    const forwardedHost = String(req.headers["x-forwarded-host"] ?? "")
        .split(",")[0]
        .trim();
    const host = forwardedHost || req.headers.host || (fallbackUrl ? new URL(fallbackUrl).host : "localhost");
    const forwardedProto = String(req.headers["x-forwarded-proto"] ?? "")
        .split(",")[0]
        .trim();
    const protocol = forwardedProto || (fallbackUrl ? new URL(fallbackUrl).protocol.replace(/:$/g, "") : "http");
    return `${protocol}://${host}`;
}
function decodeBase64UrlJson(value) {
    try {
        return JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    }
    catch {
        return null;
    }
}
export function decodeIdentityClaims(idToken) {
    if (!idToken || typeof idToken !== "string") {
        return null;
    }
    const parts = idToken.split(".");
    if (parts.length < 2) {
        return null;
    }
    return decodeBase64UrlJson(parts[1]);
}
function stringClaim(claims, name) {
    return typeof claims?.[name] === "string" ? claims[name] : undefined;
}
function booleanClaim(claims, name) {
    return typeof claims?.[name] === "boolean" ? claims[name] : undefined;
}
function authFromClaims(claims) {
    const pairwiseSub = stringClaim(claims, "pairwise_sub") ?? stringClaim(claims, "sub");
    if (!pairwiseSub) {
        return null;
    }
    const name = stringClaim(claims, "name")?.trim();
    const email = stringClaim(claims, "email");
    return {
        displayName: name || "Google User",
        email,
        emailVerified: booleanClaim(claims, "email_verified"),
        isAuthenticated: true,
        isGuest: false,
        picture: stringClaim(claims, "picture"),
        provider: "google",
        userId: `google:${pairwiseSub}`
    };
}
function isLocallyPlausibleShooToken(claims, origin, shooBaseUrl) {
    if (!claims || typeof claims !== "object") {
        return false;
    }
    if (claims.aud !== `origin:${new URL(origin).origin}`) {
        return false;
    }
    if (typeof claims.iss !== "string" || claims.iss.replace(/\/+$/g, "") !== shooBaseUrl.replace(/\/+$/g, "")) {
        return false;
    }
    return typeof claims.exp !== "number" || claims.exp * 1000 > Date.now();
}
export async function verifyShooAuth({ origin, shooBaseUrl = shooBaseUrlFromEnv(), token }) {
    if (!token) {
        return null;
    }
    const response = await fetch(new URL("/session/check", shooBaseUrl), {
        headers: {
            Authorization: `Bearer ${token}`,
            Origin: new URL(origin).origin
        },
        method: "POST"
    });
    if (!response.ok) {
        return null;
    }
    const claims = decodeIdentityClaims(token);
    if (!isLocallyPlausibleShooToken(claims, origin, shooBaseUrl)) {
        return null;
    }
    return authFromClaims(claims);
}
export async function authFromUrl({ defaultAuth = createGuestAuth("local"), onError, origin, shooBaseUrl, url }) {
    const token = url.searchParams.get("lakebed_token") ?? url.searchParams.get("auth_token") ?? "";
    if (token) {
        try {
            const shooAuth = await verifyShooAuth({ origin, shooBaseUrl, token });
            if (shooAuth) {
                return shooAuth;
            }
        }
        catch (error) {
            await onError?.(error);
        }
    }
    const guestName = url.searchParams.get("lakebed_guest") ?? url.searchParams.get("guest");
    return guestName ? createGuestAuth(guestName) : defaultAuth;
}
//# sourceMappingURL=auth.js.map