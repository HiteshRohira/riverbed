import * as esbuild from "esbuild";
import { type MemorySourceStore } from "../source-store.js";
export declare const packageDir: string;
export declare const packageNodeModules: string;
export declare const clientCssFileName = "client.css";
export declare const sourceNamespace = "lakebed-source";
export declare function isBareSpecifier(path: string): boolean;
export declare function resolveSourceFile(sourceStore: MemorySourceStore, requestedPath: string): Promise<string>;
export declare function loaderForPath(path: string): esbuild.Loader;
export declare function createSourcePlugin(sourceStore: MemorySourceStore, target: "server" | "client"): esbuild.Plugin;
export declare function unquoteServerEnvValue(value: string): string;
export declare function parseServerEnvFile(contents: string): Record<string, string>;
export declare function readCapsuleServerEnv(sourceStore: MemorySourceStore): Promise<Record<string, string>>;
export declare function buildTailwindCss(sourceStore: MemorySourceStore, buildDir: string): Promise<string>;
export declare function buildCapsule({ capsuleDir, sourceStore, capsuleId }?: {
    capsuleDir?: string;
    sourceStore?: MemorySourceStore;
    capsuleId?: string;
}): Promise<{
    app: any;
    buildDir: string;
    clientCssOut: string;
    clientOut: string;
    env: Record<string, string>;
    serverOut: string;
    sourceStore: MemorySourceStore;
}>;
//# sourceMappingURL=build.d.ts.map
