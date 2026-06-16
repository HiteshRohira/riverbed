import { LAKEBED_VERSION } from "./version.js";
export declare const ANONYMOUS_ARTIFACT_FORMAT = "lakebed.capsule.artifact.v1";
export declare const ANONYMOUS_ARTIFACT_MEDIA_TYPE = "application/vnd.lakebed.artifact+json";
export { LAKEBED_VERSION };
export declare const LAKEBED_CONFIG_FILE = "lakebed.json";
export declare const SERVER_ENV_FILE = ".env.lakebed.server";
export declare const SERVER_ENV_LIMITS: {
    maxKeyBytes: number;
    maxKeys: number;
    maxTotalBytes: number;
    maxValueBytes: number;
};
export declare const DEFAULT_ANONYMOUS_LIMITS: {
    artifactBytes: number;
    stateBytes: number;
    stateRows: number;
    requestsPerDay: number;
    mutationsPerDay: number;
    rowsReturned: number;
    instructionBudget: number;
    maxValueBytes: number;
    logEntries: number;
    logBytes: number;
    logEntryBytes: number;
};
type JsonRecord = Record<string, any>;
type Diagnostic = {
    file: string;
    message: string;
};
type SourceStoreLike = {
    listFiles(): Promise<string[]>;
    readFile(path: string): Promise<string>;
};
export declare class AnonymousCompilerError extends Error {
    diagnostics: Diagnostic[];
    constructor(diagnostics: Diagnostic[]);
}
export declare function sha256(value: string | Buffer): string;
export declare function stableStringify(value: unknown): string | undefined;
export declare function byteLength(value: unknown): number;
export declare function stateRowsLimitForLimits(limits?: Partial<typeof DEFAULT_ANONYMOUS_LIMITS>): number;
export declare function mutationTransactionOptions(limits?: Partial<typeof DEFAULT_ANONYMOUS_LIMITS>): {
    stateBytesLimit: number;
    stateRowsLimit: number;
};
export declare function validateServerEnvValues(values: unknown, path?: string): Record<string, string>;
export declare function validateServerEnvPayload(payload: unknown): Record<string, string> | undefined;
export declare function createAnonymousArtifact({ app, clientCssOut, clientOut, serverOut, sourceStore, version }: {
    app: JsonRecord;
    clientCssOut?: string;
    clientOut: string;
    serverOut?: string;
    sourceStore: SourceStoreLike;
    version?: string;
}): Promise<{
    artifact: JsonRecord;
    artifactHash: string;
    clientBundle: string;
    clientCssBundle?: string;
    clientCssBundleHash?: string | null;
    clientBundleHash: string;
}>;
export declare function createClaimedArtifact({ app, clientCssOut, clientOut, serverOut, sourceStore, version }: {
    app: JsonRecord;
    clientCssOut?: string;
    clientOut: string;
    serverOut?: string;
    sourceStore: SourceStoreLike;
    version?: string;
}): Promise<{
    artifact: JsonRecord;
    artifactHash: string;
    clientBundle: string;
    clientCssBundle?: string;
    clientCssBundleHash?: string | null;
    clientBundleHash: string;
}>;
export declare function validateAnonymousArtifact(artifact: unknown, { allowClaimedSource }?: {
    allowClaimedSource?: boolean;
}): Diagnostic[];
export declare function validateAnonymousDeployPayload(payload: unknown, options?: {
    allowClaimedSource?: boolean;
}): {
    artifact: any;
    artifactHash: string;
    clientBundle: Buffer<ArrayBuffer>;
    clientBundleBase64: string;
    clientBundleHash: string;
    serverEnv: Record<string, string> | undefined;
};
export declare function parseTtlSeconds(value?: unknown, fallback?: number): number;
export declare function createDeployId(): string;
export declare function createClaimToken(): string;
export declare function createSlug(): string;
export declare function hashClaimToken(token: string): string;
export declare function prepareAnonymousInsert(schema: JsonRecord, tableName: string, value: JsonRecord, limits?: Partial<typeof DEFAULT_ANONYMOUS_LIMITS>): JsonRecord;
export declare function prepareAnonymousPatch(schema: JsonRecord, tableName: string, patch: JsonRecord, limits?: Partial<typeof DEFAULT_ANONYMOUS_LIMITS>): JsonRecord;
//# sourceMappingURL=anonymous.d.ts.map