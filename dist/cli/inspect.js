import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { hasFlag, positionals, readArg, readNumberArg, root, usage } from "./args.js";
import { deployLookupApiUrl, deployApiUrl, formatOptionalTimestamp, normalizeHostedUrl, readCapsuleBinding, readDeployMetadata, readResponseJson } from "./deploy-api.js";
import { developerTokenForApi } from "./developer-auth.js";
export function isLocalApiUrl(value) {
    try {
        const { hostname } = new URL(value);
        return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
    }
    catch {
        return false;
    }
}
export async function requestWithHostHeader(url, headers) {
    const requestUrl = new URL(url);
    const transport = requestUrl.protocol === "https:" ? httpsRequest : httpRequest;
    return new Promise((resolveRequest, rejectRequest) => {
        const req = transport({
            headers,
            hostname: requestUrl.hostname,
            method: "GET",
            path: `${requestUrl.pathname}${requestUrl.search}`,
            port: requestUrl.port
        }, (res) => {
            const chunks = [];
            res.on("data", (chunk) => chunks.push(chunk));
            res.on("end", () => {
                const body = Buffer.concat(chunks).toString("utf8");
                resolveRequest({
                    ok: (res.statusCode ?? 500) >= 200 && (res.statusCode ?? 500) < 300,
                    status: res.statusCode ?? 500,
                    text: async () => body
                });
            });
        });
        req.on("error", rejectRequest);
        req.end();
    });
}
export async function resolveHostedTarget(target, args, metadata) {
    if (!target) {
        throw new Error("Expected a deploy ID or URL.");
    }
    try {
        const url = new URL(target);
        return { api: deployApiUrl(args), url: url.href.replace(/\/+$/g, "") };
    }
    catch {
        const api = deployLookupApiUrl(target, args, metadata);
        const response = await fetch(`${api}/v1/deploys/${encodeURIComponent(target)}`);
        const deploy = (await readResponseJson(response));
        return { api, url: deploy.url.replace(/\/+$/g, "") };
    }
}
export function inspectTokenForHostedTarget({ args, metadata, target, url }) {
    const explicitToken = readArg(args, "--inspect-token", process.env.LAKEBED_INSPECT_TOKEN ?? "");
    if (explicitToken) {
        return explicitToken;
    }
    if (!metadata?.claimToken) {
        return "";
    }
    const normalizedTarget = normalizeHostedUrl(target);
    const normalizedUrl = normalizeHostedUrl(url);
    const metadataUrl = normalizeHostedUrl(metadata.url);
    if (metadata.deployId === target || (metadataUrl && (metadataUrl === normalizedTarget || metadataUrl === normalizedUrl))) {
        return metadata.claimToken;
    }
    return "";
}
export async function hostedJson(target, path, args) {
    const binding = await readCapsuleBinding(root);
    const metadata = await readDeployMetadata(root);
    const { api, url } = await resolveHostedTarget(target, args, metadata);
    const inspectToken = inspectTokenForHostedTarget({ args, metadata, target, url }) ||
        (binding?.deployId === target ? await developerTokenForApi(api) : "");
    const headers = inspectToken ? { Authorization: `Bearer ${inspectToken}` } : {};
    let response;
    try {
        response = await fetch(`${url}${path}`, { headers });
    }
    catch (error) {
        if (!api || !isLocalApiUrl(api)) {
            throw error;
        }
        response = await requestWithHostHeader(`${api}${path}`, {
            ...headers,
            Host: new URL(url).host
        });
    }
    return readResponseJson(response);
}
export async function inspectCommand(args) {
    const [target] = positionals(args);
    const manifest = (await hostedJson(target, "/__lakebed/manifest", args));
    if (hasFlag(args, "--json")) {
        console.log(JSON.stringify(manifest, null, 2));
        return;
    }
    console.log(`Deploy:   ${manifest.deployId}`);
    if (manifest.url) {
        console.log(`URL:      ${manifest.url}`);
    }
    console.log(`Updated:  ${formatOptionalTimestamp(manifest.updatedAt, "unknown")}`);
    console.log(`Expires:  ${formatOptionalTimestamp(manifest.expiresAt)}`);
    console.log(`Runtime:  ${manifest.runtimeVersion ?? "unknown"}`);
    if (manifest.inspectPolicy) {
        console.log(`Policy:   ${manifest.inspectPolicy}`);
    }
    if (Array.isArray(manifest.domains) && manifest.domains.length > 0) {
        console.log(`Domains:  ${manifest.domains.map((domain) => domain.hostname).join(", ")}`);
    }
    if (manifest.artifactHash) {
        console.log(`Artifact: ${manifest.artifactHash}`);
    }
    if (Array.isArray(manifest.queries)) {
        console.log(`Queries:  ${manifest.queries.join(", ") || "(none)"}`);
    }
    if (Array.isArray(manifest.mutations)) {
        console.log(`Mutations: ${manifest.mutations.join(", ") || "(none)"}`);
    }
    if (Array.isArray(manifest.endpoints)) {
        const endpoints = manifest.endpoints.map((endpoint) => `${endpoint.method} ${endpoint.path} -> ${endpoint.name}`);
        console.log(`Endpoints: ${endpoints.join(", ") || "(none)"}`);
    }
    if (Array.isArray(manifest.mutationDetails) && manifest.mutationDetails.length > 0) {
        console.log("Mutation runtime:");
        for (const detail of manifest.mutationDetails) {
            const guardSummary = (detail.guards ?? [])
                .map((guard) => `${guard.table}.${guard.operation}:${guard.field}=auth.${guard.equalsAuth}`)
                .join(", ");
            console.log(`  ${detail.name}: ${detail.mode}${guardSummary ? ` (${guardSummary})` : ""}`);
        }
    }
}
export async function fetchLakebedJson(port, path) {
    const response = await fetch(`http://localhost:${port}${path}`);
    if (!response.ok) {
        throw new Error(`Unable to read ${path} from port ${port}: ${response.status}`);
    }
    return response.text();
}
export async function logsCommand(args) {
    const [target] = positionals(args);
    if (target) {
        console.log(JSON.stringify(await hostedJson(target, "/__lakebed/logs", args), null, 2));
        return;
    }
    const port = readNumberArg(args, "--port", 3000);
    console.log(await fetchLakebedJson(port, "/__lakebed/logs"));
}
export async function dbCommand(args) {
    const [subcommand, target] = positionals(args);
    const port = readNumberArg(args, "--port", 3000);
    if (subcommand === "list") {
        if (target) {
            console.log(JSON.stringify(await hostedJson(target, "/__lakebed/db/tables", args), null, 2));
            return;
        }
        console.log(await fetchLakebedJson(port, "/__lakebed/db/tables"));
        return;
    }
    if (subcommand === "dump") {
        if (target) {
            console.log(JSON.stringify(await hostedJson(target, "/__lakebed/db", args), null, 2));
            return;
        }
        console.log(await fetchLakebedJson(port, "/__lakebed/db"));
        return;
    }
    usage();
}
//# sourceMappingURL=inspect.js.map