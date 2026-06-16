import type { ComponentChildren, VNode } from "preact";
import type { AuthValue } from "./internal.js";
export interface GoogleAuthOptions {
    callbackPath?: string;
    clientId?: string;
    redirectUri?: string;
    returnTo?: string;
    shooBaseUrl?: string;
}
export interface PkceBundle {
    challenge: string;
    state: string;
    verifier: string;
}
export declare function ensureAuthInitialized(): Promise<void>;
export declare function useAuth(): AuthValue;
export declare function signInWithGoogle(options?: GoogleAuthOptions): Promise<{
    bundle: PkceBundle;
    url: string;
}>;
export declare function signOut(): void;
export declare function getIdentity(): {
    expired?: boolean;
    token?: string;
    userId: string | null;
};
export interface SignInWithGoogleProps {
    children?: ComponentChildren;
    className?: string;
    clientId?: string;
    callbackPath?: string;
    disabled?: boolean;
    onClick?: (event: {
        defaultPrevented: boolean;
    }) => void;
    redirectUri?: string;
    requestPii?: boolean;
    requestProfile?: boolean;
    returnTo?: string;
    shooBaseUrl?: string;
    type?: string;
    [prop: string]: unknown;
}
export declare function SignInWithGoogle({ children, className, clientId, callbackPath, disabled, onClick, redirectUri, requestPii: _requestPii, requestProfile: _requestProfile, returnTo, shooBaseUrl, type, ...props }?: SignInWithGoogleProps): VNode<any>;
//# sourceMappingURL=auth.d.ts.map