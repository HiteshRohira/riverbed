import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { createGuestAuth } from "../auth.js";
import { root, usage } from "./args.js";
export function authFile() {
    return resolve(root, ".lakebed/auth.json");
}
function isAuth(value) {
    if (!value || typeof value !== "object") {
        return false;
    }
    const auth = value;
    return (typeof auth.userId === "string" &&
        typeof auth.displayName === "string" &&
        typeof auth.isAuthenticated === "boolean" &&
        typeof auth.isGuest === "boolean" &&
        (auth.provider === "guest" || auth.provider === "google"));
}
export async function readAuth() {
    try {
        const auth = JSON.parse(await readFile(authFile(), "utf8"));
        return isAuth(auth) ? auth : createGuestAuth("local");
    }
    catch {
        return createGuestAuth("local");
    }
}
export async function writeAuth(auth) {
    await mkdir(dirname(authFile()), { recursive: true });
    await writeFile(authFile(), `${JSON.stringify(auth, null, 2)}\n`);
}
export async function authCommand(args) {
    if (args[0] === "as" && args[1]) {
        const auth = createGuestAuth(args[1]);
        await writeAuth(auth);
        console.log(`Lakebed auth set to ${auth.userId}`);
        return;
    }
    if (args[0] === "reset") {
        await writeAuth(createGuestAuth("local"));
        console.log("Lakebed auth reset to guest:local");
        return;
    }
    usage();
}
//# sourceMappingURL=auth-store.js.map