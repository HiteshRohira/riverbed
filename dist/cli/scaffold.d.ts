export declare function todoTemplate(name: string): Promise<Record<string, string>>;
export declare function newCommand(args: string[]): Promise<void>;
export declare function initializeGitRepository(targetDir: string): Promise<string>;
export declare function isInsideGitWorkTree(cwd: string): Promise<boolean>;
export declare function promptForCapsuleName(): Promise<string>;
export declare function runMany(args: string[]): Promise<void>;
//# sourceMappingURL=scaffold.d.ts.map