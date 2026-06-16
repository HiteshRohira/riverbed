export declare function isLocalApiUrl(value: string): boolean;
export declare function requestWithHostHeader(url: string, headers: Record<string, string>): Promise<Response>;
export declare function resolveHostedTarget(target: string, args: string[], metadata: {
    api?: string;
    deployId?: string;
} | null): Promise<{
    api: string;
    url: string;
}>;
export declare function inspectTokenForHostedTarget({ args, metadata, target, url }: {
    args: string[];
    metadata: {
        claimToken?: string;
        deployId?: string;
        url?: string;
    } | null;
    target: string;
    url: string;
}): string;
export declare function hostedJson(target: string, path: string, args: string[]): Promise<unknown>;
export declare function inspectCommand(args: string[]): Promise<void>;
export declare function fetchLakebedJson(port: number, path: string): Promise<string>;
export declare function logsCommand(args: string[]): Promise<void>;
export declare function dbCommand(args: string[]): Promise<void>;
//# sourceMappingURL=inspect.d.ts.map