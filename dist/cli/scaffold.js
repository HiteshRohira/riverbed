import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { cliCommand, defaultHostedAppBaseDomain } from "../command.js";
import { LAKEBED_RELEASE_CHANNEL } from "../release.js";
import { hasFlag, positionals, readArg, readNumberArg, resolveCapsuleDir, shellQuote } from "./args.js";
import { startDevServer } from "./dev.js";
const execFileAsync = promisify(execFile);
const todoTemplateRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../templates/todo");
const todoTemplateFiles = [
    ["gitignore", ".gitignore"],
    "AGENTS.md",
    "README.md",
    "client/index.tsx",
    "server/index.ts",
    "shared/todo.ts"
].map((file) => Array.isArray(file) ? file : [file, file]);
function renderTemplate(source, title) {
    return source
        .replaceAll("{{CAPSULE_TITLE}}", () => title)
        .replaceAll("{{CAPSULE_TITLE_JSON}}", () => JSON.stringify(title))
        .replaceAll("{{LAKEBED_APP_BASE_DOMAIN}}", () => defaultHostedAppBaseDomain)
        .replaceAll("{{LAKEBED_CLI_COMMAND}}", () => cliCommand)
        .replaceAll("{{LAKEBED_RELEASE_CHANNEL}}", () => LAKEBED_RELEASE_CHANNEL);
}
async function readTodoTemplate(path, title) {
    return renderTemplate(await readFile(join(todoTemplateRoot, path), "utf8"), title);
}
export async function todoTemplate(name) {
    const title = basename(name);
    const files = Object.fromEntries(await Promise.all(todoTemplateFiles.map(async ([sourcePath, outputPath]) => [outputPath, await readTodoTemplate(sourcePath, title)])));
    files["CLAUDE.md"] = files["AGENTS.md"];
    return files;
}
export async function newCommand(args) {
    const [nameArg] = positionals(args);
    const template = readArg(args, "--template", "todo");
    const shouldInitGit = !hasFlag(args, "--no-git");
    if (template !== "todo") {
        throw new Error(`Unknown template: ${template}`);
    }
    const name = nameArg ?? (await promptForCapsuleName());
    if (!name) {
        throw new Error("Capsule name is required.");
    }
    const targetDir = resolveCapsuleDir(name);
    if (existsSync(targetDir)) {
        throw new Error(`Target already exists: ${targetDir}`);
    }
    const files = await todoTemplate(name);
    for (const [path, contents] of Object.entries(files)) {
        const absolutePath = join(targetDir, path);
        await mkdir(dirname(absolutePath), { recursive: true });
        await writeFile(absolutePath, contents);
    }
    console.log(`Created Lakebed capsule at ${targetDir}`);
    const gitStatus = shouldInitGit ? await initializeGitRepository(targetDir) : "Skipped git setup (--no-git).";
    console.log(gitStatus);
    console.log(`
Project files:
  AGENTS.md contains the Lakebed-specific instructions for agents working in this capsule.
  CLAUDE.md mirrors AGENTS.md for Claude-based workflows.

Next:
  cd ${shellQuote(name)}
  ${cliCommand} dev

Deploy:
  ${cliCommand} deploy

Notice to agents who run this command:
  make sure to read AGENTS.md before changing files in this capsule.`);
}
export async function initializeGitRepository(targetDir) {
    if (await isInsideGitWorkTree(dirname(targetDir))) {
        return "Skipped git setup because the capsule is inside an existing git repository.";
    }
    try {
        await execFileAsync("git", ["init"], { cwd: targetDir });
        await execFileAsync("git", ["add", "."], { cwd: targetDir });
        await execFileAsync("git", ["-c", "user.name=Lakebed", "-c", "user.email=lakebed@example.invalid", "commit", "-m", "Initial Lakebed capsule"], { cwd: targetDir });
        return "Initialized git repository and created initial commit.";
    }
    catch (error) {
        return `Skipped git setup: ${error instanceof Error ? error.message : String(error)}`;
    }
}
export async function isInsideGitWorkTree(cwd) {
    try {
        const { stdout } = await execFileAsync("git", ["rev-parse", "--is-inside-work-tree"], { cwd });
        return stdout.trim() === "true";
    }
    catch {
        return false;
    }
}
export async function promptForCapsuleName() {
    const rl = createInterface({
        input: process.stdin,
        output: process.stdout
    });
    try {
        return (await rl.question("Capsule name: ")).trim();
    }
    finally {
        rl.close();
    }
}
export async function runMany(args) {
    const [capsuleArg] = positionals(args);
    const capsuleDir = resolveCapsuleDir(capsuleArg);
    const count = readNumberArg(args, "--count", 20);
    const basePort = readNumberArg(args, "--base-port", 4000);
    if (basePort + count - 1 > 65535) {
        throw new Error("--base-port and --count must stay within the TCP port range.");
    }
    const handles = [];
    try {
        for (let index = 0; index < count; index += 1) {
            handles.push(await startDevServer({
                capsuleDir,
                port: basePort + index,
                capsuleId: `run-many-${basePort + index}`,
                quiet: true
            }));
        }
    }
    catch (error) {
        await Promise.allSettled(handles.map((handle) => handle.close()));
        throw error;
    }
    console.log(`Started ${handles.length} Lakebed capsules:`);
    for (const handle of handles) {
        console.log(handle.url);
    }
    async function stop() {
        await Promise.allSettled(handles.map((handle) => handle.close()));
    }
    process.once("SIGINT", async () => {
        await stop();
        process.exit(0);
    });
    process.once("SIGTERM", async () => {
        await stop();
        process.exit(0);
    });
    await new Promise(() => { });
}
//# sourceMappingURL=scaffold.js.map