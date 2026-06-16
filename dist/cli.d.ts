#!/usr/bin/env node
import { buildCapsule } from "./cli/build.js";
import { startDevServer } from "./cli/dev.js";
export { buildCapsule, startDevServer };
export declare function runCli(argv?: string[]): Promise<void>;
export declare function reportCliError(error: unknown): void;
//# sourceMappingURL=cli.d.ts.map