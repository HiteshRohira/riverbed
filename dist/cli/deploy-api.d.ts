export declare const defaultDeployApiUrl: string;
export declare const legacyDeployApiUrl = "https://api.lakebed.app";
export declare function normalizeDeployApiOrigin(value: string | undefined): string;
export declare function deployApiUrl(args: string[]): string;
export declare function hasExplicitOption(args: string[], name: string): boolean;
export declare function normalizeHostedUrl(value: string | undefined): string;
export declare function canonicalDeployApiUrl(value: string | undefined): string;
export declare function deployApiUrlsMatch(left: string | undefined, right: string | undefined): boolean;
export declare function readResponseJson(response: Response): Promise<unknown>;
export declare function deployLookupApiUrl(target: string, args: string[], metadata: {
    api?: string;
    deployId?: string;
} | null): string;
export declare function deployMetadataPath(capsuleDir: string): string;
export declare function capsuleBindingPath(capsuleDir: string): string;
export declare function readCapsuleBinding(capsuleDir: string): Promise<{
    deployId: string;
} | null>;
export declare function writeCapsuleBinding(capsuleDir: string, binding: {
    deployId: string;
}): Promise<void>;
export declare function readDeployMetadata(capsuleDir: string): Promise<Record<string, unknown> | null>;
export declare function writeDeployMetadata(capsuleDir: string, metadata: unknown): Promise<void>;
export declare function defaultArtifactPath(capsuleDir: string): string;
export declare function formatOptionalTimestamp(value: string | undefined, fallback?: string): string;
//# sourceMappingURL=deploy-api.d.ts.map