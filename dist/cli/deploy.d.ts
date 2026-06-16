import { MemorySourceStore } from "../source-store.js";
export declare function buildAnonymousEnvelope(capsuleArg: string | undefined, sourceStore?: MemorySourceStore): Promise<{
    artifact: {
        name: any;
        client: {
            bundleHash: string;
            bytes: number;
            entry: string;
        };
        createdWith: {
            compiler: string;
            lakebed: string;
        };
        deployTarget: string;
        format: string;
        limits: {
            instructionBudget: number;
            maxRowsReturned: number;
            maxValueBytes: number;
        };
        server: {
            endpoints: {
                [x: string]: any;
            };
            helpers: {};
            imports: string[];
            mutations: {
                [k: string]: {
                    op: string;
                };
            };
            queries: {
                [k: string]: {
                    op: string;
                };
            };
            schema: {
                [x: string]: any;
            };
            source: {
                bytes: number;
                bundle: string | undefined;
                bundleHash: string | null;
                entry: string;
            };
        } | {
            endpoints: {};
            helpers: {};
            imports: string[];
            mutations: {
                [x: string]: any;
            };
            queries: {
                [x: string]: any;
            };
            schema: {
                [x: string]: any;
            };
        };
        source: {
            files: {
                bytes: number;
                hash: string;
                path: string;
            }[];
            snapshotHash: string;
        };
    };
    artifactHash: string;
    clientBundle: string;
    clientBundleHash: string;
    mediaType: string;
}>;
export declare const claimRequiredDiagnosticMessages: Set<string>;
export declare function canDeployAfterClaim(error: unknown): boolean;
export declare function buildClaimRequiredEnvelope({ capsuleDir, feature }: {
    capsuleDir: string;
    feature?: string;
}): Promise<{
    artifact: {
        name: any;
        client: {
            bundleHash: string;
            bytes: number;
            entry: string;
        };
        createdWith: {
            compiler: string;
            lakebed: string;
        };
        deployTarget: string;
        format: string;
        limits: {
            instructionBudget: number;
            maxRowsReturned: number;
            maxValueBytes: number;
        };
        server: {
            endpoints: {
                [x: string]: any;
            };
            helpers: {};
            imports: string[];
            mutations: {
                [k: string]: {
                    op: string;
                };
            };
            queries: {
                [k: string]: {
                    op: string;
                };
            };
            schema: {
                [x: string]: any;
            };
            source: {
                bytes: number;
                bundle: string | undefined;
                bundleHash: string | null;
                entry: string;
            };
        } | {
            endpoints: {};
            helpers: {};
            imports: string[];
            mutations: {
                [x: string]: any;
            };
            queries: {
                [x: string]: any;
            };
            schema: {
                [x: string]: any;
            };
        };
        source: {
            files: {
                bytes: number;
                hash: string;
                path: string;
            }[];
            snapshotHash: string;
        };
    };
    artifactHash: string;
    clientBundle: string;
    clientBundleHash: string;
    claimRequired: boolean;
    mediaType: string;
}>;
export declare function buildClaimedEnvelope(capsuleArg: string | undefined, sourceStore?: MemorySourceStore): Promise<{
    artifact: {
        name: any;
        client: {
            bundleHash: string;
            bytes: number;
            entry: string;
        };
        createdWith: {
            compiler: string;
            lakebed: string;
        };
        deployTarget: string;
        format: string;
        limits: {
            instructionBudget: number;
            maxRowsReturned: number;
            maxValueBytes: number;
        };
        server: {
            endpoints: {
                [x: string]: any;
            };
            helpers: {};
            imports: string[];
            mutations: {
                [k: string]: {
                    op: string;
                };
            };
            queries: {
                [k: string]: {
                    op: string;
                };
            };
            schema: {
                [x: string]: any;
            };
            source: {
                bytes: number;
                bundle: string;
                bundleHash: string;
                entry: string;
            };
        };
        source: {
            files: {
                bytes: number;
                hash: string;
                path: string;
            }[];
            snapshotHash: string;
        };
    };
    artifactHash: string;
    clientBundle: string;
    clientBundleHash: string;
    mediaType: string;
}>;
export declare function claimTokenFromDeployResponse(deployed: {
    claimUrl?: string;
    deployId?: string;
} | null): string | null;
export declare function claimUrlFromDeployMetadata(metadata: {
    api?: string;
    deployId?: string;
    claimToken?: string;
} | null, api?: string | undefined): string | null;
export declare function claimCommandText({ api, capsuleArg }: {
    api: string;
    capsuleArg?: string;
}): string;
export declare function normalizeDomainCommandHostname(value: string): string;
export declare function deployRequestBody(envelope: {
    artifact: unknown;
    clientBundle: unknown;
}, { inspectPolicy, serverEnv }?: {
    inspectPolicy?: string;
    serverEnv?: Record<string, string>;
}): string;
export declare function buildCommand(args: string[]): Promise<void>;
export declare function deployCommand(args: string[]): Promise<void>;
export declare function claimCommand(args: string[]): Promise<void>;
export declare function domainsCommand(args: string[]): Promise<void>;
//# sourceMappingURL=deploy.d.ts.map