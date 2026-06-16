export type DeveloperAuthProfile = {
    api: string;
    token: string;
    updatedAt: string;
    user?: Record<string, unknown>;
};
type DeveloperAuthFile = {
    profiles: Record<string, DeveloperAuthProfile>;
};
export declare function developerAuthFile(): string;
export declare function readDeveloperAuthProfiles(): Promise<DeveloperAuthFile>;
export declare function writeDeveloperAuthProfiles(auth: DeveloperAuthFile): Promise<void>;
export declare function saveDeveloperAuthProfile(profile: DeveloperAuthProfile): Promise<void>;
export declare function clearDeveloperAuthProfile(api: string): Promise<boolean>;
export declare function assertEnvironmentTokenDestination(api: string, env?: NodeJS.ProcessEnv): void;
export declare function developerTokenForApi(api: string, env?: NodeJS.ProcessEnv): Promise<string>;
export declare function developerAuthorizationHeaders(api: string): Promise<Record<string, string>>;
export {};
//# sourceMappingURL=developer-auth.d.ts.map