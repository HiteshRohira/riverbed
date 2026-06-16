export declare const DEFAULT_SHOO_BASE_URL = "https://shoo.dev";
export declare const AUTH_STORAGE_KEY = "lakebed_identity";
export declare const LEGACY_SHOO_STORAGE_KEY = "shoo_identity";
export declare const PKCE_STORAGE_KEY = "lakebed_google_pkce";
export declare const RETURN_TO_STORAGE_KEY = "lakebed_google_return_to";
export declare const AUTH_RESUME_STORAGE_KEY = "lakebed_google_resume_attempt";
export declare const PKCE_MAX_AGE_MS: number;
export declare const encoder: TextEncoder;
export type AuthValue = {
    userId: string;
    displayName: string;
    provider: "guest" | "google";
    isGuest: boolean;
    isAuthenticated: boolean;
    isLoading?: boolean;
    email?: string;
    emailVerified?: boolean;
    picture?: string;
};
export interface IdentityClaims {
    iss?: string;
    aud?: string;
    sub?: string;
    iat?: number;
    exp?: number;
    jti?: string;
    pairwise_sub?: string;
    email?: string;
    email_verified?: boolean;
    name?: string;
    picture?: string;
}
export declare function getAuth(): AuthValue;
export declare function setAuth(value: AuthValue): void;
export declare function getAuthResumeStarted(): boolean;
export declare function setAuthResumeStarted(value: boolean): void;
export declare function addAuthListener(listener: (value: AuthValue) => void): void;
export declare function removeAuthListener(listener: (value: AuthValue) => void): void;
export declare function emitAuth(): void;
export declare function normalizeBasePathValue(value: unknown): string;
export declare function basePath(): string;
export declare function authConfig(): Record<string, unknown>;
export declare function toGuestName(name: unknown): string;
export declare function toDisplayName(name: unknown): string;
export declare function createGuestAuth(name: unknown): AuthValue;
export declare function withAuthLoading(value: AuthValue, isLoading: boolean): AuthValue;
export declare function browserStorage(): Storage | null;
export declare function browserSessionStorage(): Storage | null;
export declare function currentGuestName(): string;
export declare function parseJson(value: string | null): unknown;
export declare function decodeBase64Url(value: string): string;
export declare function decodeIdentityClaims(idToken: string | null | undefined): IdentityClaims | null;
export declare function isExpiredClaims(claims: IdentityClaims | null): boolean;
export interface StoredIdentityResult {
    expired?: boolean;
    token?: string;
    userId: string | null;
}
export declare function readStoredIdentity({ allowExpired }?: {
    allowExpired?: boolean;
}): StoredIdentityResult;
export declare function storedAuthToken(): string;
export declare function createGoogleAuthFromToken(token: string | null | undefined): AuthValue | null;
export declare function createInitialAuth(): AuthValue;
//# sourceMappingURL=internal.d.ts.map