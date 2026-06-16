type CliSession = {
    code: string;
    expiresAt: string;
    intervalSeconds: number;
    pollSecret: string;
    sessionId: string;
    verificationUrl: string;
};
export declare function createCliSession(api: string): Promise<CliSession>;
export declare function waitForCliSession(api: string, session: CliSession): Promise<{
    token: string;
    user?: Record<string, unknown>;
}>;
export declare function saveCliSession(api: string, session: CliSession): Promise<{
    token: string;
    user?: Record<string, unknown>;
}>;
export declare function developerAuthCommand(args: string[]): Promise<boolean>;
export declare function tokenCommand(args: string[]): Promise<void>;
export {};
//# sourceMappingURL=developer-auth-command.d.ts.map