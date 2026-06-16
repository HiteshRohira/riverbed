import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import { LAKEBED_DEPLOY_API_URL } from "../release.js";
import { readArg, root } from "./args.js";
export const defaultDeployApiUrl = LAKEBED_DEPLOY_API_URL;
export const legacyDeployApiUrl = "https://api.lakebed.app";
function isLocalHostname(hostname) {
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1" || hostname.endsWith(".localhost");
}
export function normalizeDeployApiOrigin(value) {
    let url;
    try {
        url = new URL(String(value ?? ""));
    }
    catch {
        throw new Error(`Invalid Lakebed API origin: ${value || "(empty)"}. Expected a URL like https://api.lakebed.dev.`);
    }
    if (url.username ||
        url.password ||
        (url.pathname && url.pathname !== "/") ||
        url.search ||
        url.hash ||
        (url.protocol !== "https:" && !(url.protocol === "http:" && isLocalHostname(url.hostname)))) {
        throw new Error(`Invalid Lakebed API origin: ${value}. Use an HTTPS origin without credentials, a path, a query, or a fragment. HTTP is allowed only for localhost.`);
    }
    return url.origin;
}
export function deployApiUrl(args) {
    return canonicalDeployApiUrl(readArg(args, "--api", process.env.LAKEBED_DEPLOY_API ?? process.env.SPAN_DEPLOY_API ?? defaultDeployApiUrl));
}
export function hasExplicitOption(args, name) {
    return args.some((arg) => arg === name || arg.startsWith(`${name}=`));
}
export function normalizeHostedUrl(value) {
    if (!value) {
        return "";
    }
    try {
        return new URL(value).href.replace(/\/+$/g, "");
    }
    catch {
        return String(value).replace(/\/+$/g, "");
    }
}
export function canonicalDeployApiUrl(value) {
    if (!value) {
        return "";
    }
    const normalized = normalizeDeployApiOrigin(value);
    return normalized === legacyDeployApiUrl ? defaultDeployApiUrl : normalized;
}
export function deployApiUrlsMatch(left, right) {
    return canonicalDeployApiUrl(left) === canonicalDeployApiUrl(right);
}
export async function readResponseJson(response) {
    const body = await response.text();
    if (!response.ok) {
        throw new Error(body || `Request failed with ${response.status}`);
    }
    return JSON.parse(body);
}
export function deployLookupApiUrl(target, args, metadata) {
    if (!hasExplicitOption(args, "--api") && metadata?.api && metadata.deployId === target) {
        return canonicalDeployApiUrl(metadata.api);
    }
    return deployApiUrl(args);
}
export function deployMetadataPath(capsuleDir) {
    return resolve(capsuleDir, ".lakebed/deploy.json");
}
export function capsuleBindingPath(capsuleDir) {
    return resolve(capsuleDir, "lakebed.json");
}
export async function readCapsuleBinding(capsuleDir) {
    try {
        const parsed = JSON.parse(await readFile(capsuleBindingPath(capsuleDir), "utf8"));
        if (!parsed ||
            typeof parsed !== "object" ||
            Array.isArray(parsed) ||
            typeof parsed.deployId !== "string" ||
            !parsed.deployId.trim()) {
            throw new Error("Expected an object containing a non-empty deployId.");
        }
        return { deployId: parsed.deployId.trim() };
    }
    catch (error) {
        if (error?.code === "ENOENT") {
            return null;
        }
        throw new Error(`Unable to read ${capsuleBindingPath(capsuleDir)}: ${error instanceof Error ? error.message : String(error)}`);
    }
}
export async function writeCapsuleBinding(capsuleDir, binding) {
    await writeFile(capsuleBindingPath(capsuleDir), `${JSON.stringify({ deployId: binding.deployId }, null, 2)}\n`);
}
export async function readDeployMetadata(capsuleDir) {
    try {
        return JSON.parse(await readFile(deployMetadataPath(capsuleDir), "utf8"));
    }
    catch (error) {
        if (error?.code === "ENOENT") {
            return null;
        }
        throw new Error(`Unable to read Lakebed deploy metadata: ${error instanceof Error ? error.message : String(error)}`);
    }
}
export async function writeDeployMetadata(capsuleDir, metadata) {
    const path = deployMetadataPath(capsuleDir);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, `${JSON.stringify(metadata, null, 2)}\n`);
}
export function defaultArtifactPath(capsuleDir) {
    return resolve(root, ".lakebed/artifacts", `${basename(capsuleDir)}.anonymous.json`);
}
export function formatOptionalTimestamp(value, fallback = "never") {
    return value || fallback;
}
//# sourceMappingURL=deploy-api.js.map