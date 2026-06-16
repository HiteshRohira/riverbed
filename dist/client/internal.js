// Shared module-level singletons and cross-cutting helpers used by both the
// transport and auth concerns. Kept in one module so the live auth state and
// listener set are not duplicated and to avoid import cycles between
// transport.ts and auth.ts.
export const DEFAULT_SHOO_BASE_URL = "https://shoo.dev";
export const AUTH_STORAGE_KEY = "lakebed_identity";
export const LEGACY_SHOO_STORAGE_KEY = "shoo_identity";
export const PKCE_STORAGE_KEY = "lakebed_google_pkce";
export const RETURN_TO_STORAGE_KEY = "lakebed_google_return_to";
export const AUTH_RESUME_STORAGE_KEY = "lakebed_google_resume_attempt";
export const PKCE_MAX_AGE_MS = 10 * 60 * 1000;
export const encoder = new TextEncoder();
let auth = createInitialAuth();
let authResumeStarted = false;
const authListeners = new Set();
export function getAuth() {
    return auth;
}
export function setAuth(value) {
    auth = value;
}
export function getAuthResumeStarted() {
    return authResumeStarted;
}
export function setAuthResumeStarted(value) {
    authResumeStarted = value;
}
export function addAuthListener(listener) {
    authListeners.add(listener);
}
export function removeAuthListener(listener) {
    authListeners.delete(listener);
}
export function emitAuth() {
    for (const listener of authListeners) {
        listener(auth);
    }
}
export function normalizeBasePathValue(value) {
    const clean = String(value ?? "").replace(/\/+$/g, "");
    return clean === "/" ? "" : clean;
}
export function basePath() {
    return normalizeBasePathValue(window.__LAKEBED_BASE_PATH__ ?? "");
}
export function authConfig() {
    return window.__LAKEBED_AUTH__ ?? {};
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
export function withAuthLoading(value, isLoading) {
    return { ...value, isLoading };
}
export function browserStorage() {
    if (typeof window === "undefined") {
        return null;
    }
    try {
        return window.localStorage;
    }
    catch {
        return null;
    }
}
export function browserSessionStorage() {
    if (typeof window === "undefined") {
        return null;
    }
    try {
        return window.sessionStorage;
    }
    catch {
        return null;
    }
}
export function currentGuestName() {
    if (typeof window === "undefined") {
        return "local";
    }
    return new URLSearchParams(window.location.search).get("lakebed_guest") ?? "local";
}
export function parseJson(value) {
    try {
        return JSON.parse(value);
    }
    catch {
        return null;
    }
}
export function decodeBase64Url(value) {
    const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    return atob(padded);
}
export function decodeIdentityClaims(idToken) {
    if (!idToken) {
        return null;
    }
    const parts = idToken.split(".");
    if (parts.length < 2) {
        return null;
    }
    return parseJson(decodeBase64Url(parts[1]));
}
export function isExpiredClaims(claims) {
    return typeof claims?.exp === "number" && claims.exp * 1000 <= Date.now();
}
export function readStoredIdentity({ allowExpired = false } = {}) {
    const storage = browserStorage();
    if (!storage) {
        return { userId: null };
    }
    let raw = null;
    try {
        raw = storage.getItem(AUTH_STORAGE_KEY) ?? storage.getItem(LEGACY_SHOO_STORAGE_KEY);
    }
    catch {
        return { userId: null };
    }
    if (!raw) {
        return { userId: null };
    }
    const parsed = parseJson(raw);
    if (!parsed || typeof parsed !== "object") {
        return { userId: null };
    }
    const token = typeof parsed.token === "string" ? parsed.token : undefined;
    const claims = decodeIdentityClaims(token);
    const expired = isExpiredClaims(claims);
    if (expired && !allowExpired) {
        return { expired, userId: null };
    }
    return {
        expired,
        token,
        userId: typeof parsed.userId === "string"
            ? parsed.userId
            : typeof parsed.pairwiseSub === "string"
                ? parsed.pairwiseSub
                : null
    };
}
export function storedAuthToken() {
    return readStoredIdentity().token ?? "";
}
export function createGoogleAuthFromToken(token) {
    const claims = decodeIdentityClaims(token);
    const pairwiseSub = claims?.pairwise_sub ?? claims?.sub;
    if (!pairwiseSub) {
        return null;
    }
    const displayName = typeof claims.name === "string" && claims.name.trim() ? claims.name.trim() : "Google User";
    return {
        displayName,
        email: typeof claims.email === "string" ? claims.email : undefined,
        emailVerified: typeof claims.email_verified === "boolean" ? claims.email_verified : undefined,
        isAuthenticated: true,
        isGuest: false,
        picture: typeof claims.picture === "string" ? claims.picture : undefined,
        provider: "google",
        userId: `google:${pairwiseSub}`
    };
}
export function createInitialAuth() {
    const token = storedAuthToken();
    const googleAuth = createGoogleAuthFromToken(token);
    if (googleAuth) {
        return withAuthLoading(googleAuth, true);
    }
    return withAuthLoading(createGuestAuth(currentGuestName()), typeof window !== "undefined");
}
//# sourceMappingURL=internal.js.map