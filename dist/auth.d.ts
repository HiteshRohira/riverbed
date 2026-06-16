import type { IncomingMessage } from "node:http";
export type Auth = {
    userId: string;
    displayName: string;
    isAuthenticated: boolean;
    isGuest: boolean;
    provider: "guest" | "google";
    email?: string;
    emailVerified?: boolean;
    picture?: string;
};
type IdentityClaims = Record<string, unknown>;
export declare function shooBaseUrlFromEnv(env?: NodeJS.ProcessEnv): string;
export declare function toGuestName(name: string | null | undefined): string;
export declare function toDisplayName(name: string | null | undefined): string;
export declare function createGuestAuth(name: string | null | undefined): Auth;
export declare function requestOrigin(req: IncomingMessage, fallbackUrl?: string): string;
export declare function decodeIdentityClaims(idToken: string | null | undefined): IdentityClaims | null;
export declare function verifyShooAuth({ origin, shooBaseUrl, token }: {
    origin: string;
    shooBaseUrl?: string;
    token: string | null | undefined;
}): Promise<Auth | null>;
export declare function authFromUrl({ defaultAuth, onError, origin, shooBaseUrl, url }: {
    defaultAuth?: Auth;
    onError?: (error: unknown) => void | Promise<void>;
    origin: string;
    shooBaseUrl?: string;
    url: URL;
}): Promise<Auth>;
export {};
//# sourceMappingURL=auth.d.ts.map