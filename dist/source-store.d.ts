export type SourceFiles = Map<string, string>;
type Snapshot = {
    id: string;
    message: string;
    at: string;
    files: SourceFiles;
};
export declare class MemorySourceStore {
    files: SourceFiles;
    snapshots: Map<string, Snapshot>;
    archived: boolean;
    constructor(files?: SourceFiles, snapshots?: Map<string, Snapshot>);
    clone(): MemorySourceStore;
    hasFile(path: string): boolean;
    readFile(path: string): Promise<string>;
    writeFile(path: string, contents: string): Promise<void>;
    listFiles(root?: string): Promise<string[]>;
    snapshot(message?: string): Promise<string>;
    fork(snapshotId: string): Promise<MemorySourceStore>;
    archive(): Promise<void>;
}
export declare function createMemorySourceStoreFromDirectory(rootDir: string): Promise<MemorySourceStore>;
export declare function sourcePathJoin(...parts: string[]): string;
export declare function sourcePathDirname(path: string): string;
export {};
//# sourceMappingURL=source-store.d.ts.map