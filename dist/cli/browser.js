import { execFile } from "node:child_process";
import { promisify } from "node:util";
const execFileAsync = promisify(execFile);
export function browserOpenInvocation(url) {
    if (process.platform === "darwin") {
        return { command: "open", args: [url] };
    }
    if (process.platform === "win32") {
        return { command: "rundll32", args: ["url.dll,FileProtocolHandler", url] };
    }
    return { command: "xdg-open", args: [url] };
}
export async function openUrlInBrowser(url) {
    const invocation = browserOpenInvocation(url);
    await execFileAsync(invocation.command, invocation.args, { windowsHide: true });
}
//# sourceMappingURL=browser.js.map