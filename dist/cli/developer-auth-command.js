import { cliCommand } from "../command.js";
import { hasFlag, positionals, readArg, root, usage } from "./args.js";
import { openUrlInBrowser } from "./browser.js";
import { readCapsuleBinding, readResponseJson, deployApiUrl } from "./deploy-api.js";
import { clearDeveloperAuthProfile, developerAuthorizationHeaders, developerTokenForApi, saveDeveloperAuthProfile } from "./developer-auth.js";
export async function createCliSession(api) {
    const response = await fetch(`${api}/v1/auth/cli-sessions`, { method: "POST" });
    return (await readResponseJson(response));
}
function wait(milliseconds) {
    return new Promise((resolveWait) => setTimeout(resolveWait, milliseconds));
}
export async function waitForCliSession(api, session) {
    while (Date.now() < Date.parse(session.expiresAt)) {
        const response = await fetch(`${api}/v1/auth/cli-sessions/${encodeURIComponent(session.sessionId)}/exchange`, {
            body: JSON.stringify({ pollSecret: session.pollSecret }),
            headers: { "Content-Type": "application/json" },
            method: "POST"
        });
        const body = (await readResponseJson(response));
        if (body.status === "approved" && body.token) {
            return { token: body.token, user: body.user };
        }
        await wait(Math.max(250, Number(session.intervalSeconds || 1) * 1000));
    }
    throw new Error("Lakebed CLI authorization expired. Run lakebed auth login again.");
}
export async function saveCliSession(api, session) {
    const approved = await waitForCliSession(api, session);
    await saveDeveloperAuthProfile({
        api,
        token: approved.token,
        updatedAt: new Date().toISOString(),
        user: approved.user
    });
    return approved;
}
export async function developerAuthCommand(args) {
    const [subcommand] = positionals(args);
    if (!["login", "status", "logout"].includes(subcommand)) {
        return false;
    }
    const api = deployApiUrl(args);
    if (subcommand === "login") {
        const session = await createCliSession(api);
        if (hasFlag(args, "--json")) {
            console.log(JSON.stringify(session, null, 2));
            return true;
        }
        try {
            await openUrlInBrowser(session.verificationUrl);
            console.log(`Opened ${session.verificationUrl}`);
        }
        catch {
            console.warn(`Unable to open a browser. Open this URL manually: ${session.verificationUrl}`);
        }
        console.log(`Verification code: ${session.code}`);
        console.log("Waiting for approval...");
        const approved = await saveCliSession(api, session);
        console.log(`Authenticated${approved.user?.login ? ` as ${approved.user.login}` : ""}.`);
        return true;
    }
    if (subcommand === "logout") {
        const removed = await clearDeveloperAuthProfile(api);
        console.log(removed ? `Removed Lakebed developer auth for ${api}.` : `No saved Lakebed developer auth for ${api}.`);
        return true;
    }
    const token = await developerTokenForApi(api);
    if (!token) {
        if (hasFlag(args, "--json")) {
            console.log(JSON.stringify({ api, authenticated: false }, null, 2));
        }
        else {
            console.log(`Not authenticated for ${api}. Run ${cliCommand} auth login.`);
        }
        return true;
    }
    const response = await fetch(`${api}/v1/me`, { headers: await developerAuthorizationHeaders(api) });
    const result = (await readResponseJson(response));
    if (hasFlag(args, "--json")) {
        console.log(JSON.stringify({ api, authenticated: true, ...result }, null, 2));
    }
    else {
        console.log(`Authenticated for ${api}${result.user?.login ? ` as ${result.user.login}` : ""}.`);
    }
    return true;
}
export async function tokenCommand(args) {
    const [subcommand, tokenId] = positionals(args);
    const api = deployApiUrl(args);
    const headers = {
        ...(await developerAuthorizationHeaders(api)),
        "Content-Type": "application/json"
    };
    if (subcommand === "create") {
        const personal = hasFlag(args, "--personal");
        const binding = personal ? null : await readCapsuleBinding(root);
        if (!personal && !binding) {
            throw new Error("No lakebed.json binding found. Run lakebed deploy from this capsule first, or pass --personal.");
        }
        const name = readArg(args, "--name");
        if (!name) {
            throw new Error("Expected --name <name> for the CI token.");
        }
        const response = await fetch(`${api}/v1/me/tokens`, {
            body: JSON.stringify({ deployId: binding?.deployId ?? null, name }),
            headers,
            method: "POST"
        });
        const created = await readResponseJson(response);
        console.log(JSON.stringify(created, null, 2));
        return;
    }
    if (subcommand === "list") {
        const response = await fetch(`${api}/v1/me/tokens`, { headers });
        console.log(JSON.stringify(await readResponseJson(response), null, 2));
        return;
    }
    if (subcommand === "revoke" && tokenId) {
        const response = await fetch(`${api}/v1/me/tokens/${encodeURIComponent(tokenId)}`, {
            headers,
            method: "DELETE"
        });
        const result = await readResponseJson(response);
        console.log(hasFlag(args, "--json") ? JSON.stringify(result, null, 2) : `Revoked ${tokenId}.`);
        return;
    }
    usage();
}
//# sourceMappingURL=developer-auth-command.js.map