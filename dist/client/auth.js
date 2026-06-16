// Identity / auth state machine: Google OAuth (PKCE create/exchange/callback),
// guest mode, session resume, storage persistence, the public auth API, the
// SignInWithGoogle component and the useAuth hook.
import { h } from "preact";
import { useEffect, useState } from "preact/hooks";
import { AUTH_RESUME_STORAGE_KEY, AUTH_STORAGE_KEY, DEFAULT_SHOO_BASE_URL, LEGACY_SHOO_STORAGE_KEY, PKCE_MAX_AGE_MS, PKCE_STORAGE_KEY, RETURN_TO_STORAGE_KEY, addAuthListener, authConfig, basePath, browserSessionStorage, browserStorage, createGoogleAuthFromToken, createGuestAuth, currentGuestName, decodeIdentityClaims, emitAuth, encoder, getAuth, parseJson, readStoredIdentity, removeAuthListener, setAuth, setAuthResumeStarted, getAuthResumeStarted, withAuthLoading } from "./internal.js";
import { connect, reconnect } from "./transport.js";
let authInitPromise = null;
let authInitialized = false;
function callbackPath() {
    return `${basePath()}/auth/callback`.replace(/\/{2,}/g, "/");
}
function currentRoute() {
    return `${window.location.pathname}${window.location.search}${window.location.hash}`;
}
function normalizeReturnTo(value) {
    if (!value) {
        return null;
    }
    try {
        const parsed = new URL(value, window.location.origin);
        if (parsed.origin !== window.location.origin) {
            return null;
        }
        const route = `${parsed.pathname}${parsed.search}${parsed.hash}`;
        if (!route.startsWith("/") || route.startsWith("//")) {
            return null;
        }
        return route;
    }
    catch {
        return null;
    }
}
function fallbackRoute() {
    return basePath() || "/";
}
function deriveRedirectUri(path) {
    return new URL(path, window.location.origin).toString();
}
function deriveClientIdFromRedirectUri(redirectUri) {
    return `origin:${new URL(redirectUri).origin}`;
}
function resolveGoogleAuthOptions(options = {}) {
    const resolvedCallbackPath = normalizeReturnTo(options.callbackPath) ?? callbackPath();
    const redirectUri = options.redirectUri ?? deriveRedirectUri(resolvedCallbackPath);
    return {
        callbackPath: resolvedCallbackPath,
        clientId: options.clientId ?? deriveClientIdFromRedirectUri(redirectUri),
        redirectUri,
        returnTo: normalizeReturnTo(options.returnTo) ?? currentRoute(),
        shooBaseUrl: String(options.shooBaseUrl ?? authConfig().shooBaseUrl ?? DEFAULT_SHOO_BASE_URL).replace(/\/+$/g, "")
    };
}
function randomString(length = 64) {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";
    const random = crypto.getRandomValues(new Uint8Array(length));
    let value = "";
    for (let index = 0; index < random.length; index += 1) {
        value += chars[random[index] % chars.length];
    }
    return value;
}
function bytesToBase64Url(bytes) {
    let binary = "";
    for (const byte of bytes) {
        binary += String.fromCharCode(byte);
    }
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
async function createPkceBundle() {
    const verifier = randomString(64);
    const state = randomString(32);
    const digest = await crypto.subtle.digest("SHA-256", encoder.encode(verifier));
    return {
        challenge: bytesToBase64Url(new Uint8Array(digest)),
        state,
        verifier
    };
}
function createSignInUrl(options, bundle) {
    const url = new URL("/authorize", options.shooBaseUrl);
    url.searchParams.set("client_id", options.clientId);
    url.searchParams.set("redirect_uri", options.redirectUri);
    url.searchParams.set("state", bundle.state);
    url.searchParams.set("code_challenge", bundle.challenge);
    url.searchParams.set("code_challenge_method", "S256");
    url.searchParams.set("pii", "true");
    return url.toString();
}
function persistIdentity(userId, token, expiresIn) {
    const storage = browserStorage();
    if (!storage) {
        return;
    }
    try {
        storage.setItem(AUTH_STORAGE_KEY, JSON.stringify({
            expiresIn,
            receivedAt: Date.now(),
            token,
            userId
        }));
    }
    catch {
        // Storage persistence is best effort; server auth remains authoritative.
    }
}
function clearStoredIdentity() {
    const storage = browserStorage();
    if (!storage) {
        return;
    }
    try {
        storage.removeItem(AUTH_STORAGE_KEY);
        storage.removeItem(LEGACY_SHOO_STORAGE_KEY);
    }
    catch {
        // Ignore storage failures; reconnecting as guest is still safe.
    }
}
function clearAuthResumeAttempt() {
    const storage = browserSessionStorage();
    if (!storage) {
        return;
    }
    try {
        storage.removeItem(AUTH_RESUME_STORAGE_KEY);
    }
    catch {
        // Ignore storage failures; resume attempts are best effort.
    }
}
function parseCallback(url = window.location.href) {
    const parsed = new URL(url);
    const code = parsed.searchParams.get("code");
    const state = parsed.searchParams.get("state");
    if (!code || !state) {
        return null;
    }
    return { code, state };
}
function clearCallbackParams(url = window.location.href) {
    const next = new URL(url);
    next.searchParams.delete("code");
    next.searchParams.delete("state");
    next.searchParams.delete("error");
    window.history.replaceState({}, "", next.toString());
}
function popReturnTo() {
    const value = normalizeReturnTo(window.sessionStorage.getItem(RETURN_TO_STORAGE_KEY));
    window.sessionStorage.removeItem(RETURN_TO_STORAGE_KEY);
    return value;
}
async function exchangeCode({ code, codeVerifier, options }) {
    const body = new URLSearchParams({
        client_id: options.clientId,
        code,
        code_verifier: codeVerifier,
        grant_type: "authorization_code",
        redirect_uri: options.redirectUri
    });
    const response = await fetch(new URL("/token", options.shooBaseUrl), {
        body,
        headers: {
            "Content-Type": "application/x-www-form-urlencoded"
        },
        method: "POST"
    });
    if (!response.ok) {
        const details = await response.text();
        throw new Error(`Google sign-in token exchange failed (${response.status}): ${details || "no details"}`);
    }
    return response.json();
}
async function handleGoogleCallback() {
    const callback = parseCallback();
    if (!callback) {
        return null;
    }
    const rawPkce = window.sessionStorage.getItem(PKCE_STORAGE_KEY);
    const parsedPkce = (rawPkce ? parseJson(rawPkce) : null);
    if (!parsedPkce?.state || !parsedPkce?.verifier) {
        throw new Error("Missing Google sign-in verifier. Start sign-in again.");
    }
    if (typeof parsedPkce.createdAt === "number" && Date.now() - parsedPkce.createdAt > PKCE_MAX_AGE_MS) {
        window.sessionStorage.removeItem(PKCE_STORAGE_KEY);
        throw new Error("Google sign-in verifier expired. Start sign-in again.");
    }
    if (parsedPkce.state !== callback.state) {
        throw new Error("Google sign-in state mismatch.");
    }
    const options = resolveGoogleAuthOptions();
    const token = await exchangeCode({
        code: callback.code,
        codeVerifier: parsedPkce.verifier,
        options
    });
    if (!token?.id_token || !token?.pairwise_sub) {
        throw new Error("Google sign-in token response was missing identity claims.");
    }
    persistIdentity(token.pairwise_sub, token.id_token, token.expires_in);
    clearAuthResumeAttempt();
    window.sessionStorage.removeItem(PKCE_STORAGE_KEY);
    const localAuth = createGoogleAuthFromToken(token.id_token);
    if (localAuth) {
        setAuth(withAuthLoading(localAuth, true));
        emitAuth();
    }
    const returnTo = popReturnTo() ?? fallbackRoute();
    clearCallbackParams();
    window.location.replace(returnTo);
    return token;
}
function authResumeAttemptKey(identity) {
    const claims = decodeIdentityClaims(identity.token);
    return [identity.userId, claims?.jti, claims?.exp].filter(Boolean).join(":") || identity.token;
}
function beginStoredGoogleSessionResume() {
    if (typeof window === "undefined" || getAuthResumeStarted()) {
        return false;
    }
    if (parseCallback()) {
        return false;
    }
    const search = new URLSearchParams(window.location.search);
    if (search.has("error") || window.location.pathname === callbackPath()) {
        return false;
    }
    if (search.has("lakebed_guest") || search.has("guest")) {
        return false;
    }
    const identity = readStoredIdentity({ allowExpired: true });
    if (!identity.token || !identity.expired) {
        return false;
    }
    const claims = decodeIdentityClaims(identity.token);
    if (!claims?.pairwise_sub && !claims?.sub) {
        clearStoredIdentity();
        return false;
    }
    const storage = browserSessionStorage();
    const attemptKey = authResumeAttemptKey(identity);
    try {
        if (storage?.getItem(AUTH_RESUME_STORAGE_KEY) === attemptKey) {
            return false;
        }
        storage?.setItem(AUTH_RESUME_STORAGE_KEY, attemptKey);
    }
    catch {
        // Without sessionStorage, the page navigation below is still safe.
    }
    setAuthResumeStarted(true);
    setAuth(withAuthLoading(createGuestAuth(currentGuestName()), true));
    emitAuth();
    void signInWithGoogle({ returnTo: currentRoute() }).catch((error) => {
        console.error("[lakebed] Google session resume failed", error);
        setAuthResumeStarted(false);
        clearStoredIdentity();
        clearAuthResumeAttempt();
        setAuth(withAuthLoading(createGuestAuth(currentGuestName()), false));
        emitAuth();
        reconnect();
    });
    return true;
}
export function ensureAuthInitialized() {
    if (authInitialized) {
        return Promise.resolve();
    }
    if (beginStoredGoogleSessionResume()) {
        authInitialized = true;
        return Promise.resolve();
    }
    authInitPromise ??= handleGoogleCallback()
        .then(() => undefined)
        .catch((error) => {
        console.error("[lakebed] Google sign-in failed", error);
    })
        .finally(() => {
        authInitialized = true;
    });
    return authInitPromise;
}
export function useAuth() {
    const [value, setValue] = useState(getAuth());
    useEffect(() => {
        void ensureAuthInitialized();
        connect();
        addAuthListener(setValue);
        return () => {
            removeAuthListener(setValue);
        };
    }, []);
    return value;
}
export async function signInWithGoogle(options = {}) {
    const resolved = resolveGoogleAuthOptions(options);
    const bundle = await createPkceBundle();
    window.sessionStorage.setItem(PKCE_STORAGE_KEY, JSON.stringify({
        createdAt: Date.now(),
        state: bundle.state,
        verifier: bundle.verifier
    }));
    window.sessionStorage.setItem(RETURN_TO_STORAGE_KEY, normalizeReturnTo(resolved.returnTo) === resolved.callbackPath
        ? fallbackRoute()
        : (normalizeReturnTo(resolved.returnTo) ?? fallbackRoute()));
    const url = createSignInUrl(resolved, bundle);
    window.location.assign(url);
    return { bundle, url };
}
export function signOut() {
    clearStoredIdentity();
    clearAuthResumeAttempt();
    setAuth(withAuthLoading(createGuestAuth(currentGuestName()), true));
    emitAuth();
    reconnect();
}
export function getIdentity() {
    return readStoredIdentity();
}
export function SignInWithGoogle({ children = "Sign in with Google", className = "", clientId, callbackPath, disabled, onClick, redirectUri, requestPii: _requestPii, requestProfile: _requestProfile, returnTo, shooBaseUrl, type = "button", ...props } = {}) {
    return h("button", {
        className,
        disabled,
        onClick: (event) => {
            onClick?.(event);
            if (event.defaultPrevented || disabled) {
                return;
            }
            void signInWithGoogle({
                callbackPath,
                clientId,
                redirectUri,
                returnTo,
                shooBaseUrl
            });
        },
        type,
        ...props
    }, children);
}
//# sourceMappingURL=auth.js.map