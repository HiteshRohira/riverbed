import { mkdir, rm, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import * as esbuild from "esbuild";
import { SERVER_ENV_FILE, validateServerEnvValues } from "../anonymous.js";
import { createMemorySourceStoreFromDirectory, sourcePathDirname, sourcePathJoin } from "../source-store.js";
import { resolveCapsuleDir, root } from "./args.js";
export const packageDir = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
export const packageNodeModules = resolve(packageDir, "node_modules");
export const clientCssFileName = "client.css";
export const sourceNamespace = "lakebed-source";
export function isBareSpecifier(path) {
    return !path.startsWith(".") && !path.startsWith("/") && !/^[a-zA-Z]:/.test(path);
}
export async function resolveSourceFile(sourceStore, requestedPath) {
    const normalized = sourcePathJoin(requestedPath);
    const candidates = [
        normalized,
        `${normalized}.ts`,
        `${normalized}.tsx`,
        `${normalized}.js`,
        `${normalized}.jsx`,
        `${normalized}.json`,
        sourcePathJoin(normalized, "index.ts"),
        sourcePathJoin(normalized, "index.tsx"),
        sourcePathJoin(normalized, "index.js"),
        sourcePathJoin(normalized, "index.jsx")
    ];
    for (const candidate of candidates) {
        if (sourceStore.hasFile(candidate)) {
            return candidate;
        }
    }
    throw new Error(`Unable to resolve source import: ${requestedPath}`);
}
export function loaderForPath(path) {
    if (path.endsWith(".tsx")) {
        return "tsx";
    }
    if (path.endsWith(".ts")) {
        return "ts";
    }
    if (path.endsWith(".js")) {
        return "ts";
    }
    if (path.endsWith(".jsx")) {
        return "jsx";
    }
    if (path.endsWith(".json")) {
        return "json";
    }
    return "js";
}
export function createSourcePlugin(sourceStore, target) {
    const allowedBare = new Set(target === "server"
        ? ["lakebed/server"]
        : ["lakebed/client", "preact", "preact/hooks", "preact/jsx-runtime", "preact/jsx-dev-runtime"]);
    return {
        name: "lakebed-source-store",
        setup(build) {
            build.onResolve({ filter: /.*/ }, async (args) => {
                if (args.kind === "entry-point") {
                    return {
                        path: await resolveSourceFile(sourceStore, args.path),
                        namespace: sourceNamespace
                    };
                }
                if (args.namespace !== sourceNamespace) {
                    return;
                }
                if (args.path.startsWith("node:")) {
                    return {
                        errors: [{ text: `Node built-ins are not available inside Lakebed ${target} modules: ${args.path}` }]
                    };
                }
                if (isBareSpecifier(args.path)) {
                    if (allowedBare.has(args.path) || (target === "client" && args.path.startsWith("preact/"))) {
                        if (target === "server" && args.path === "lakebed/server") {
                            return { path: join(packageDir, "dist/server.js") };
                        }
                        if (target === "client" && args.path === "lakebed/client") {
                            return { path: join(packageDir, "dist/client.js") };
                        }
                        if (target === "server") {
                            return { path: args.path, external: true };
                        }
                        return build.resolve(args.path, {
                            kind: args.kind,
                            resolveDir: packageDir
                        });
                    }
                    return {
                        errors: [
                            {
                                text: `External packages are not supported in Lakebed v0: ${args.path}. Use relative files or Lakebed built-ins.`
                            }
                        ]
                    };
                }
                const basePath = args.path.startsWith("/") ? "" : sourcePathDirname(args.importer);
                return {
                    path: await resolveSourceFile(sourceStore, sourcePathJoin(basePath, args.path)),
                    namespace: sourceNamespace
                };
            });
            build.onLoad({ filter: /.*/, namespace: sourceNamespace }, async (args) => ({
                contents: await sourceStore.readFile(args.path),
                loader: loaderForPath(args.path),
                resolveDir: sourcePathDirname(args.path)
            }));
        }
    };
}
export function unquoteServerEnvValue(value) {
    if (value.length < 2) {
        return value;
    }
    const quote = value[0];
    if ((quote !== `"` && quote !== `'`) || value[value.length - 1] !== quote) {
        return value;
    }
    return value.slice(1, -1);
}
export function parseServerEnvFile(contents) {
    const env = {};
    for (const [index, rawLine] of contents.split(/\r?\n/).entries()) {
        const line = rawLine.trim();
        if (!line || line.startsWith("#")) {
            continue;
        }
        const match = line.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
        if (!match) {
            throw new Error(`Invalid ${SERVER_ENV_FILE} line ${index + 1}. Use KEY=value.`);
        }
        const [, key, rawValue] = match;
        env[key] = unquoteServerEnvValue(rawValue.trim());
    }
    return validateServerEnvValues(env, SERVER_ENV_FILE);
}
export async function readCapsuleServerEnv(sourceStore) {
    if (!sourceStore.hasFile(SERVER_ENV_FILE)) {
        return {};
    }
    return parseServerEnvFile(await sourceStore.readFile(SERVER_ENV_FILE));
}
export async function buildTailwindCss(sourceStore, buildDir) {
    const tailwindDir = join(buildDir, "__tailwind");
    const sourceDir = join(tailwindDir, "source");
    const inputCss = join(tailwindDir, "input.css");
    const clientCssOut = join(buildDir, clientCssFileName);
    await mkdir(sourceDir, { recursive: true });
    const files = await sourceStore.listFiles();
    const sourceExtensions = new Set([".html", ".js", ".jsx", ".ts", ".tsx"]);
    for (const file of files) {
        if (file.startsWith("__lakebed/")) {
            continue;
        }
        const extension = file.match(/\.[^.]+$/)?.[0] ?? "";
        if (!sourceExtensions.has(extension)) {
            continue;
        }
        const outputPath = join(sourceDir, file);
        await mkdir(dirname(outputPath), { recursive: true });
        await writeFile(outputPath, await sourceStore.readFile(file));
    }
    await writeFile(inputCss, `@import "tailwindcss";\n@source "./source";\n`);
    const tailwindBin = process.platform === "win32"
        ? join(packageNodeModules, ".bin", "tailwindcss.cmd")
        : join(packageNodeModules, ".bin", "tailwindcss");
    await new Promise((resolveBuild, rejectBuild) => {
        execFile(tailwindBin, ["-i", inputCss, "-o", clientCssOut, "--minify"], { cwd: tailwindDir, env: { ...process.env, NODE_PATH: packageNodeModules } }, (error, stdout, stderr) => {
            if (error) {
                rejectBuild(new Error(`Tailwind CSS build failed:\n${stderr || stdout || error.message}`));
                return;
            }
            resolveBuild();
        });
    });
    return clientCssOut;
}
export async function buildCapsule({ capsuleDir, sourceStore, capsuleId = "dev" } = {}) {
    const resolvedCapsuleDir = resolveCapsuleDir(capsuleDir);
    const originalStore = sourceStore ?? (await createMemorySourceStoreFromDirectory(resolvedCapsuleDir));
    const workingStore = originalStore.clone();
    const buildDir = resolve(root, ".lakebed/build", capsuleId);
    await rm(buildDir, { recursive: true, force: true });
    await mkdir(buildDir, { recursive: true });
    const serverEntry = workingStore.hasFile("server/index.ts") ? "server/index.ts" : "server/index.js";
    if (!workingStore.hasFile(serverEntry)) {
        throw new Error("Missing capsule entry: server/index.ts");
    }
    if (!workingStore.hasFile("client/index.tsx")) {
        throw new Error("Missing client entry: client/index.tsx");
    }
    const serverOut = join(buildDir, "server.mjs");
    const clientOut = join(buildDir, "client.js");
    const clientCssOut = await buildTailwindCss(workingStore, buildDir);
    await workingStore.writeFile("__lakebed/client-entry.tsx", `import { h, render } from "preact";\nimport { App } from "../client/index.tsx";\n\nrender(h(App, {}), document.getElementById("app"));\n`);
    await esbuild.build({
        entryPoints: [serverEntry],
        outfile: serverOut,
        bundle: true,
        platform: "node",
        format: "esm",
        sourcemap: "inline",
        jsx: "automatic",
        jsxImportSource: "preact",
        plugins: [createSourcePlugin(workingStore, "server")]
    });
    await esbuild.build({
        entryPoints: ["__lakebed/client-entry.tsx"],
        outfile: clientOut,
        bundle: true,
        platform: "browser",
        format: "esm",
        sourcemap: "inline",
        jsx: "automatic",
        jsxImportSource: "preact",
        nodePaths: [packageNodeModules],
        plugins: [createSourcePlugin(workingStore, "client")]
    });
    const capsuleModule = await import(`${pathToFileURL(serverOut).href}?t=${Date.now()}-${Math.random()}`);
    return {
        app: capsuleModule.default,
        buildDir,
        clientCssOut,
        clientOut,
        env: await readCapsuleServerEnv(workingStore),
        serverOut,
        sourceStore: workingStore
    };
}
//# sourceMappingURL=build.js.map
