import { homedir } from "node:os";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { canonicalDeployApiUrl, defaultDeployApiUrl } from "./deploy-api.js";
export function developerAuthFile() {
    return resolve(homedir(), ".lakebed/developer-auth.json");
}
export async function readDeveloperAuthProfiles() {
    try {
        const parsed = JSON.parse(await readFile(developerAuthFile(), "utf8"));
        return parsed && typeof parsed === "object" && parsed.profiles && typeof parsed.profiles === "object"
            ? { profiles: parsed.profiles }
            : { profiles: {} };
    }
    catch (error) {
        if (error?.code === "ENOENT") {
            return { profiles: {} };
        }
        throw new Error(`Unable to read Lakebed developer auth: ${error instanceof Error ? error.message : String(error)}`);
    }
}
export async function writeDeveloperAuthProfiles(auth) {
    const path = developerAuthFile();
    await mkdir(dirname(path), { mode: 0o700, recursive: true });
    await writeFile(path, `${JSON.stringify(auth, null, 2)}\n`, { mode: 0o600 });
}
export async function saveDeveloperAuthProfile(profile) {
    const auth = await readDeveloperAuthProfiles();
    const api = canonicalDeployApiUrl(profile.api);
    auth.profiles[api] = { ...profile, api };
    await writeDeveloperAuthProfiles(auth);
}
export async function clearDeveloperAuthProfile(api) {
    const auth = await readDeveloperAuthProfiles();
    const canonicalApi = canonicalDeployApiUrl(api);
    const removed = Boolean(auth.profiles[canonicalApi]);
    delete auth.profiles[canonicalApi];
    await writeDeveloperAuthProfiles(auth);
    return removed;
}
export function assertEnvironmentTokenDestination(api, env = process.env) {
    if (!env.LAKEBED_TOKEN || canonicalDeployApiUrl(api) === canonicalDeployApiUrl(defaultDeployApiUrl)) {
        return;
    }
    if (!env.LAKEBED_TOKEN_API || canonicalDeployApiUrl(env.LAKEBED_TOKEN_API) !== canonicalDeployApiUrl(api)) {
        throw new Error(`Refusing to send LAKEBED_TOKEN to ${api}. Set LAKEBED_TOKEN_API=${canonicalDeployApiUrl(api)} to authorize this custom API origin explicitly.`);
    }
}
export async function developerTokenForApi(api, env = process.env) {
    if (env.LAKEBED_TOKEN) {
        assertEnvironmentTokenDestination(api, env);
        return env.LAKEBED_TOKEN;
    }
    const auth = await readDeveloperAuthProfiles();
    return auth.profiles[canonicalDeployApiUrl(api)]?.token ?? "";
}
export async function developerAuthorizationHeaders(api) {
    const token = await developerTokenForApi(api);
    return token ? { Authorization: `Bearer ${token}` } : {};
}
//# sourceMappingURL=developer-auth.js.map