import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { domainToASCII } from "node:url";
import { ANONYMOUS_ARTIFACT_MEDIA_TYPE, AnonymousCompilerError, LAKEBED_VERSION, SERVER_ENV_FILE, createAnonymousArtifact, createClaimedArtifact, stableStringify } from "../anonymous.js";
import { MemorySourceStore, createMemorySourceStoreFromDirectory } from "../source-store.js";
import { cliCommand, cliPackageSpec, defaultHostedAppBaseDomain } from "../command.js";
import { hasFlag, positionals, readArg, resolveCapsuleDir, shellQuote, usage } from "./args.js";
import { buildCapsule, readCapsuleServerEnv } from "./build.js";
import { defaultArtifactPath, defaultDeployApiUrl, deployApiUrl, deployApiUrlsMatch, deployMetadataPath, formatOptionalTimestamp, normalizeHostedUrl, readCapsuleBinding, readDeployMetadata, readResponseJson, writeCapsuleBinding, writeDeployMetadata } from "./deploy-api.js";
import { createCliSession, saveCliSession } from "./developer-auth-command.js";
import { developerAuthorizationHeaders, developerTokenForApi } from "./developer-auth.js";
import { openUrlInBrowser } from "./browser.js";
export async function buildAnonymousEnvelope(capsuleArg, sourceStore) {
    const capsuleDir = resolveCapsuleDir(capsuleArg);
    sourceStore ??= await createMemorySourceStoreFromDirectory(capsuleDir);
    const built = await buildCapsule({
        capsuleDir,
        capsuleId: `anonymous-${Date.now()}`,
        sourceStore
    });
    const artifact = await createAnonymousArtifact({
        app: built.app,
        clientCssOut: built.clientCssOut,
        clientOut: built.clientOut,
        serverOut: built.serverOut,
        sourceStore
    });
    return {
        artifact: artifact.artifact,
        artifactHash: artifact.artifactHash,
        clientBundle: artifact.clientBundle,
        clientCssBundle: artifact.clientCssBundle,
        clientCssBundleHash: artifact.clientCssBundleHash,
        clientBundleHash: artifact.clientBundleHash,
        mediaType: ANONYMOUS_ARTIFACT_MEDIA_TYPE
    };
}
export const claimRequiredDiagnosticMessages = new Set([
    "Outbound fetch is disabled for anonymous deploys.",
    "Async server handlers are not part of the anonymous IR yet. Use synchronous Lakebed database operations."
]);
export function canDeployAfterClaim(error) {
    return (error instanceof AnonymousCompilerError &&
        error.diagnostics.length > 0 &&
        error.diagnostics.every((entry) => claimRequiredDiagnosticMessages.has(entry.message)));
}
export async function buildClaimRequiredEnvelope({ capsuleDir, feature = "claimed server features" }) {
    const sourceStore = new MemorySourceStore();
    await sourceStore.writeFile("server/index.ts", `import { capsule } from "lakebed/server";

export default capsule({
  name: "Claim Required",
  schema: {},
  queries: {},
  mutations: {}
});
`);
    await sourceStore.writeFile("client/index.tsx", `export function App() {
  return (
    <main className="min-h-screen bg-neutral-950 px-6 py-12 text-neutral-100">
      <section className="mx-auto max-w-2xl rounded-lg border border-neutral-800 bg-neutral-900 p-8 shadow-2xl">
        <p className="text-sm font-semibold uppercase tracking-wide text-cyan-300">Lakebed deploy</p>
        <h1 className="mt-3 text-3xl font-semibold">Claim required</h1>
        <p className="mt-4 text-neutral-300">
          This capsule uses ${feature}. Claim this deploy, then run ${cliCommand} deploy again to publish the app.
        </p>
      </section>
    </main>
  );
}
`);
    const built = await buildCapsule({
        capsuleDir,
        capsuleId: `claim-required-${Date.now()}`,
        sourceStore
    });
    const artifact = await createAnonymousArtifact({
        app: built.app,
        clientCssOut: built.clientCssOut,
        clientOut: built.clientOut,
        sourceStore
    });
    return {
        artifact: artifact.artifact,
        artifactHash: artifact.artifactHash,
        clientBundle: artifact.clientBundle,
        clientCssBundle: artifact.clientCssBundle,
        clientCssBundleHash: artifact.clientCssBundleHash,
        clientBundleHash: artifact.clientBundleHash,
        claimRequired: true,
        mediaType: ANONYMOUS_ARTIFACT_MEDIA_TYPE
    };
}
export async function buildClaimedEnvelope(capsuleArg, sourceStore) {
    const capsuleDir = resolveCapsuleDir(capsuleArg);
    sourceStore ??= await createMemorySourceStoreFromDirectory(capsuleDir);
    const built = await buildCapsule({
        capsuleDir,
        capsuleId: `claimed-${Date.now()}`,
        sourceStore
    });
    const artifact = await createClaimedArtifact({
        app: built.app,
        clientCssOut: built.clientCssOut,
        clientOut: built.clientOut,
        serverOut: built.serverOut,
        sourceStore
    });
    return {
        artifact: artifact.artifact,
        artifactHash: artifact.artifactHash,
        clientBundle: artifact.clientBundle,
        clientCssBundle: artifact.clientCssBundle,
        clientCssBundleHash: artifact.clientCssBundleHash,
        clientBundleHash: artifact.clientBundleHash,
        mediaType: ANONYMOUS_ARTIFACT_MEDIA_TYPE
    };
}
export function claimTokenFromDeployResponse(deployed) {
    if (!deployed?.claimUrl || !deployed?.deployId) {
        return null;
    }
    try {
        const url = new URL(deployed.claimUrl);
        const segments = url.pathname.split("/").filter(Boolean);
        if (segments[0] === "claim" && segments[1] === deployed.deployId) {
            return segments[2] ?? null;
        }
    }
    catch {
        return null;
    }
    return null;
}
export function claimUrlFromDeployMetadata(metadata, api = metadata?.api) {
    if (!metadata?.api || !metadata?.deployId || !metadata?.claimToken) {
        return null;
    }
    return `${normalizeHostedUrl(api)}/claim/${encodeURIComponent(metadata.deployId)}/${encodeURIComponent(metadata.claimToken)}`;
}
export function claimCommandText({ api, capsuleArg }) {
    const parts = ["npx", cliPackageSpec, "claim"];
    if (capsuleArg) {
        parts.push(capsuleArg);
    }
    if (api !== defaultDeployApiUrl) {
        parts.push("--api", api);
    }
    return parts.map(shellQuote).join(" ");
}
export function normalizeDomainCommandHostname(value) {
    const raw = String(value ?? "").trim();
    if (!raw) {
        throw new Error("Domain is required.");
    }
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) || raw.includes("/") || raw.includes("\\") || raw.includes(":")) {
        throw new Error(`Enter a domain like my-app.${defaultHostedAppBaseDomain}, without a scheme, port, or path.`);
    }
    const hostname = domainToASCII(raw.replace(/\.$/, "").toLowerCase());
    if (!hostname) {
        throw new Error("Domain is not a valid hostname.");
    }
    if (hostname.length > 253) {
        throw new Error("Domain must be 253 characters or fewer.");
    }
    for (const label of hostname.split(".")) {
        if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label)) {
            throw new Error("Domain labels must use letters, numbers, or hyphens.");
        }
    }
    return hostname;
}
export function deployRequestBody(envelope, { inspectPolicy, serverEnv } = {}) {
    const body = {
        artifact: envelope.artifact,
        clientBundle: envelope.clientBundle,
        clientVersion: LAKEBED_VERSION
    };
    if (inspectPolicy !== undefined) {
        body.inspectPolicy = inspectPolicy;
    }
    if (serverEnv !== undefined) {
        body.serverEnv = {
            mode: "replace",
            values: serverEnv
        };
    }
    return JSON.stringify(body);
}
export async function buildCommand(args) {
    const [capsuleArg] = positionals(args);
    const target = readArg(args, "--target", "anonymous");
    if (target !== "anonymous") {
        throw new Error(`Unsupported build target: ${target}. The only explicit build target today is anonymous.`);
    }
    const capsuleDir = resolveCapsuleDir(capsuleArg);
    const out = readArg(args, "--out", defaultArtifactPath(capsuleDir));
    const envelope = await buildAnonymousEnvelope(capsuleArg);
    await mkdir(dirname(out), { recursive: true });
    await writeFile(out, `${stableStringify(envelope)}\n`);
    if (hasFlag(args, "--json")) {
        console.log(JSON.stringify({
            artifactHash: envelope.artifactHash,
            artifactPath: out,
            clientBundleHash: envelope.clientBundleHash,
            format: envelope.artifact.format
        }, null, 2));
        return;
    }
    console.log(`Anonymous artifact written to ${out}`);
    console.log(`Artifact: ${envelope.artifactHash}`);
    console.log(`Client:   ${envelope.clientBundleHash}`);
}
export async function deployCommand(args) {
    if (args.some((arg) => arg === "--ttl" || arg.startsWith("--ttl="))) {
        throw new Error(`${cliCommand} deploy no longer accepts --ttl. Deploy expiry is set by the server.`);
    }
    const [capsuleArg] = positionals(args);
    const capsuleDir = resolveCapsuleDir(capsuleArg);
    const sourceStore = await createMemorySourceStoreFromDirectory(capsuleDir);
    const serverEnvFileExists = sourceStore.hasFile(SERVER_ENV_FILE);
    const serverEnv = await readCapsuleServerEnv(sourceStore);
    const serverEnvKeys = Object.keys(serverEnv).sort();
    const hasServerEnvValues = serverEnvKeys.length > 0;
    const api = deployApiUrl(args);
    const inspectPolicy = hasFlag(args, "--public-inspect") ? "public" : undefined;
    const binding = await readCapsuleBinding(capsuleDir);
    const metadata = await readDeployMetadata(capsuleDir);
    const developerToken = await developerTokenForApi(api);
    const canUpdateLegacy = !binding &&
        deployApiUrlsMatch(metadata?.api, api) &&
        typeof metadata?.deployId === "string" &&
        typeof metadata?.claimToken === "string";
    let currentDeploy = null;
    const currentDeployId = binding?.deployId ?? (canUpdateLegacy ? metadata?.deployId : null);
    if (currentDeployId) {
        const currentResponse = await fetch(`${api}/v1/deploys/${encodeURIComponent(currentDeployId)}`);
        if (currentResponse.ok) {
            currentDeploy = await currentResponse.json();
        }
    }
    const shouldUpdateLegacy = canUpdateLegacy && (!developerToken || Boolean(currentDeploy?.claimed));
    let envelope;
    if (binding || developerToken) {
        envelope = await buildClaimedEnvelope(capsuleDir, sourceStore);
    }
    else if (!currentDeploy?.claimed && hasServerEnvValues) {
        if (canUpdateLegacy && currentDeploy) {
            throw new Error(`This capsule defines server env in ${SERVER_ENV_FILE}.\n\nThis deploy is still anonymous. Claim it first, then run ${cliCommand} deploy again to sync server env.`);
        }
        try {
            await buildAnonymousEnvelope(capsuleDir, sourceStore);
        }
        catch (error) {
            if (!canDeployAfterClaim(error)) {
                throw error;
            }
        }
        envelope = await buildClaimRequiredEnvelope({ capsuleDir, feature: "server env" });
    }
    else {
        try {
            envelope = currentDeploy?.claimed ? await buildClaimedEnvelope(capsuleDir, sourceStore) : await buildAnonymousEnvelope(capsuleDir, sourceStore);
        }
        catch (error) {
            if (error instanceof AnonymousCompilerError && canUpdateLegacy && currentDeploy && !currentDeploy.claimed) {
                throw new Error(`${error.message}\n\nThis deploy is still anonymous. Claim it first, then run ${cliCommand} deploy again to use server-side fetch.`);
            }
            if ((!canUpdateLegacy || !currentDeploy) && canDeployAfterClaim(error)) {
                envelope = await buildClaimRequiredEnvelope({ capsuleDir, feature: "server-side fetch" });
            }
            else {
                throw error;
            }
        }
    }
    const syncServerEnv = Boolean(binding || currentDeploy?.claimed);
    const serverEnvForUpdate = syncServerEnv ? serverEnv : undefined;
    let serverEnvSynced = false;
    let mode = "created";
    let response;
    if (binding) {
        if (!developerToken) {
            throw new Error(`This capsule is bound to ${binding.deployId}. Run ${cliCommand} auth login or set LAKEBED_TOKEN.`);
        }
        response = await fetch(`${api}/v1/deploys/${encodeURIComponent(binding.deployId)}`, {
            body: deployRequestBody(envelope, { inspectPolicy, serverEnv: serverEnvForUpdate }),
            headers: {
                ...(await developerAuthorizationHeaders(api)),
                "Content-Type": "application/json"
            },
            method: "PUT"
        });
        mode = "updated";
        serverEnvSynced = serverEnvForUpdate !== undefined;
    }
    else if (shouldUpdateLegacy) {
        response = await fetch(`${api}/v1/deploys/${encodeURIComponent(metadata.deployId)}`, {
            body: deployRequestBody(envelope, { inspectPolicy, serverEnv: serverEnvForUpdate }),
            headers: {
                ...(developerToken
                    ? await developerAuthorizationHeaders(api)
                    : { Authorization: `Bearer ${metadata.claimToken}` }),
                "Content-Type": "application/json"
            },
            method: "PUT"
        });
        if (response.status === 404 || response.status === 410) {
            mode = "created";
            response = null;
            if (serverEnvForUpdate !== undefined && hasServerEnvValues) {
                envelope = await buildClaimRequiredEnvelope({ capsuleDir, feature: "server env" });
            }
        }
        else {
            mode = "updated";
            serverEnvSynced = serverEnvForUpdate !== undefined;
        }
    }
    if (!response) {
        const owned = Boolean(developerToken);
        response = await fetch(`${api}${owned ? "/v1/deploys" : "/v1/anonymous-deploys"}`, {
            body: deployRequestBody(envelope, { inspectPolicy, serverEnv: owned && serverEnvFileExists ? serverEnv : undefined }),
            headers: {
                ...(owned ? await developerAuthorizationHeaders(api) : {}),
                "Content-Type": "application/json"
            },
            method: "POST"
        });
        serverEnvSynced = owned && serverEnvFileExists;
    }
    const deployed = (await readResponseJson(response));
    const claimToken = claimTokenFromDeployResponse(deployed) ?? (!binding ? metadata?.claimToken : undefined);
    if (deployed.claimed && developerToken) {
        await writeCapsuleBinding(capsuleDir, { deployId: deployed.deployId });
    }
    else if (claimToken) {
        await writeDeployMetadata(capsuleDir, {
            api,
            claimToken,
            deployId: deployed.deployId,
            updatedAt: new Date().toISOString(),
            url: deployed.url
        });
    }
    if (hasFlag(args, "--json")) {
        console.log(JSON.stringify({
            ...(envelope.claimRequired ? { ...deployed, claimRequired: true } : deployed),
            ...(serverEnvSynced ? { serverEnv: { keys: serverEnvKeys, mode: "replace", synced: true } } : {})
        }, null, 2));
        return;
    }
    if (envelope.claimRequired && mode !== "updated") {
        console.log("Created claim-required preview.\n");
    }
    else {
        const deployLabel = deployed.claimed ? "owned app" : envelope.artifact.deployTarget === "claimed-source" ? "claimed app" : "anonymous preview";
        console.log(`${mode === "updated" ? "Updated" : "Created"} ${deployLabel}.\n`);
    }
    console.log(`App:        ${deployed.url}`);
    console.log(`Updated:    ${formatOptionalTimestamp(deployed.updatedAt, "unknown")}`);
    console.log(`Expires:    ${formatOptionalTimestamp(deployed.expiresAt)}`);
    if (deployed.claimUrl) {
        console.log(`Claim:      ${claimCommandText({ api, capsuleArg })}`);
    }
    console.log(`Inspect:    ${cliCommand} inspect ${deployed.deployId}`);
    if (deployed.inspectPolicy === "public") {
        console.log("Inspect policy: public - data and logs are readable by anyone with the app URL.");
    }
    console.log("\nLimits:");
    console.log(`  source/artifact: ${deployed.limits.artifactBytes} bytes`);
    console.log(`  state:           ${deployed.limits.stateBytes} bytes`);
    console.log(`  requests:        ${deployed.limits.requestsPerDay} / day`);
    console.log(`  mutations:       ${deployed.limits.mutationsPerDay} / day`);
    console.log(`  outbound fetch:  ${envelope.artifact.deployTarget === "claimed-source" ? "enabled" : "disabled"}`);
    if (serverEnvSynced) {
        console.log(`\nServer env: ${serverEnvKeys.length} synced`);
        for (const key of serverEnvKeys) {
            console.log(`  ${key}`);
        }
    }
    if (envelope.claimRequired) {
        console.log("\nThis app needs a claimed deploy before server-side fetch or server env can run.");
        console.log(`Run ${claimCommandText({ api, capsuleArg })}, then run ${cliCommand} deploy again.`);
    }
}
export async function claimCommand(args) {
    const [capsuleArg] = positionals(args);
    const capsuleDir = resolveCapsuleDir(capsuleArg);
    const api = deployApiUrl(args);
    const metadata = await readDeployMetadata(capsuleDir);
    if (!metadata) {
        throw new Error(`No Lakebed deploy metadata found at ${deployMetadataPath(capsuleDir)}. Run ${cliCommand} deploy from this project first.`);
    }
    if (!deployApiUrlsMatch(metadata.api, api)) {
        throw new Error(`Saved deploy metadata is for ${metadata.api}, but this command is using ${api}. Pass --api ${metadata.api} to claim it.`);
    }
    const claimUrl = claimUrlFromDeployMetadata(metadata, api);
    if (!claimUrl) {
        throw new Error("This project does not have a saved claim token. Redeploy to create a new claim URL.");
    }
    let deploy = null;
    try {
        const response = await fetch(`${api}/v1/deploys/${encodeURIComponent(metadata.deployId)}`);
        if (response.ok) {
            deploy = await response.json();
        }
    }
    catch {
        deploy = null;
    }
    const result = {
        claimed: Boolean(deploy?.claimed),
        claimUrl,
        deployId: metadata.deployId,
        url: deploy?.url ?? metadata.url
    };
    if (hasFlag(args, "--json")) {
        console.log(JSON.stringify(result, null, 2));
        return;
    }
    if (result.claimed) {
        console.log(`Deploy ${result.deployId} is already claimed.`);
        if (result.url) {
            console.log(`App:   ${result.url}`);
        }
        return;
    }
    const session = await createCliSession(api);
    const interactiveClaimUrl = new URL(claimUrl);
    interactiveClaimUrl.searchParams.set("cli_session", session.sessionId);
    try {
        await openUrlInBrowser(interactiveClaimUrl.href);
    }
    catch (error) {
        throw new Error(`Unable to open the claim page in your browser: ${error instanceof Error ? error.message : String(error)}\n\nRun ${claimCommandText({ api, capsuleArg })} --json to read the claim URL.`);
    }
    console.log(`Opened claim page for deploy ${result.deployId} in your browser.`);
    console.log(`Verification code: ${session.code}`);
    console.log("Waiting for explicit CLI authorization...");
    await saveCliSession(api, session);
    console.log("Authenticated.");
}
export async function domainsCommand(args) {
    const [subcommand, hostname] = positionals(args);
    if (subcommand !== "add" || !hostname) {
        usage();
        return;
    }
    const capsuleDir = resolveCapsuleDir(undefined);
    const api = deployApiUrl(args);
    const binding = await readCapsuleBinding(capsuleDir);
    const metadata = await readDeployMetadata(capsuleDir);
    if (!binding && !metadata) {
        throw new Error(`No Lakebed deploy metadata found at ${deployMetadataPath(capsuleDir)}. Run ${cliCommand} deploy from this project first.`);
    }
    if (!binding && !deployApiUrlsMatch(metadata?.api, api)) {
        throw new Error(`Saved deploy metadata is for ${metadata?.api}, but this command is using ${api}. Pass --api ${metadata?.api} to use it.`);
    }
    const deployId = binding?.deployId ?? metadata?.deployId;
    const token = binding ? await developerTokenForApi(api) : metadata?.claimToken;
    if (!deployId || !token) {
        throw new Error("This project does not have a saved deploy token. Redeploy to refresh Lakebed deploy metadata.");
    }
    const normalizedHostname = normalizeDomainCommandHostname(hostname);
    const response = await fetch(`${api}/v1/deploys/${encodeURIComponent(deployId)}/domains`, {
        body: JSON.stringify({ hostname: normalizedHostname }),
        headers: {
            "Authorization": `Bearer ${token}`,
            "Content-Type": "application/json"
        },
        method: "POST"
    });
    const domain = (await readResponseJson(response));
    if (hasFlag(args, "--json")) {
        console.log(JSON.stringify(domain, null, 2));
        return;
    }
    console.log("Registered Lakebed subdomain.");
    console.log(`Domain: ${domain.url}`);
    console.log(`Deploy: ${domain.deployId}`);
}
//# sourceMappingURL=deploy.js.map
