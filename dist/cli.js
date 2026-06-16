#!/usr/bin/env node
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { AnonymousCompilerError } from "./anonymous.js";
import { usage } from "./cli/args.js";
import { authCommand } from "./cli/auth-store.js";
import { developerAuthCommand, tokenCommand } from "./cli/developer-auth-command.js";
import { buildCapsule } from "./cli/build.js";
import { buildCommand, claimCommand, deployCommand, domainsCommand } from "./cli/deploy.js";
import { dev, startDevServer } from "./cli/dev.js";
import { dbCommand, inspectCommand, logsCommand } from "./cli/inspect.js";
import { newCommand, runMany } from "./cli/scaffold.js";
export { buildCapsule, startDevServer };
export async function runCli(argv = process.argv.slice(2)) {
    const [command, ...args] = argv;
    if (command === "new" || command === "create") {
        await newCommand(args);
        return;
    }
    if (command === "dev") {
        await dev(args);
        return;
    }
    if (command === "build") {
        await buildCommand(args);
        return;
    }
    if (command === "deploy") {
        await deployCommand(args);
        return;
    }
    if (command === "claim") {
        await claimCommand(args);
        return;
    }
    if (command === "domains") {
        await domainsCommand(args);
        return;
    }
    if (command === "inspect") {
        await inspectCommand(args);
        return;
    }
    if (command === "run-many") {
        await runMany(args);
        return;
    }
    if (command === "auth") {
        if (await developerAuthCommand(args)) {
            return;
        }
        await authCommand(args);
        return;
    }
    if (command === "token") {
        await tokenCommand(args);
        return;
    }
    if (command === "db") {
        await dbCommand(args);
        return;
    }
    if (command === "logs") {
        await logsCommand(args);
        return;
    }
    usage();
}
function isMainModule() {
    try {
        return realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1]);
    }
    catch {
        return false;
    }
}
export function reportCliError(error) {
    if (error instanceof AnonymousCompilerError) {
        console.error("Anonymous build failed:");
        for (const diagnostic of error.diagnostics) {
            console.error(`- ${diagnostic.file}: ${diagnostic.message}`);
        }
        process.exitCode = 1;
        return;
    }
    console.error(error);
    process.exitCode = 1;
}
if (isMainModule()) {
    runCli().catch(reportCliError);
}
//# sourceMappingURL=cli.js.map