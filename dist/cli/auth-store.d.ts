import type { Auth } from "../auth.js";
export declare function authFile(): string;
export declare function readAuth(): Promise<Auth>;
export declare function writeAuth(auth: Auth): Promise<void>;
export declare function authCommand(args: string[]): Promise<void>;
//# sourceMappingURL=auth-store.d.ts.map