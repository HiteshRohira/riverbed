import { isAbsolute, resolve } from "node:path";
import { cliCommand, defaultHostedAppBaseDomain } from "../command.js";
export const root = process.cwd();
export function usage() {
    console.log(`riverbed

Usage:
  ${cliCommand} new [name] [--template todo] [--no-git]
  ${cliCommand} create [name] [--template todo] [--no-git]
  ${cliCommand} dev [capsule-dir] [--port 3000]
  ${cliCommand} build [capsule-dir] --target anonymous [--out .lakebed/artifacts/app.json] [--json]
  ${cliCommand} deploy [capsule-dir] [--api <url>] [--public-inspect] [--json]
  ${cliCommand} claim [capsule-dir] [--api <url>] [--json]
  ${cliCommand} auth login [--api <url>] [--json]
  ${cliCommand} auth status [--api <url>] [--json]
  ${cliCommand} auth logout [--api <url>]
  ${cliCommand} token create --name <name> [--personal] [--api <url>] [--json]
  ${cliCommand} token list [--api <url>] [--json]
  ${cliCommand} token revoke <token-id> [--api <url>]
  ${cliCommand} domains add <subdomain.${defaultHostedAppBaseDomain}> [--api <url>] [--json]
  ${cliCommand} inspect <deploy-id-or-url> [--api <url>] [--inspect-token <token>] [--json]
  ${cliCommand} run-many [capsule-dir] [--count 20] [--base-port 4000]
  ${cliCommand} auth as <name>
  ${cliCommand} auth reset
  ${cliCommand} db list [deploy-id-or-url] [--port 3000] [--inspect-token <token>]
  ${cliCommand} db dump [deploy-id-or-url] [--port 3000] [--inspect-token <token>]
  ${cliCommand} logs [deploy-id-or-url] [--port 3000] [--inspect-token <token>]
`);
}
export function readArg(args, name, fallback) {
    const index = args.indexOf(name);
    if (index === -1) {
        return fallback;
    }
    return args[index + 1] ?? fallback;
}
export const optionsWithValues = new Set([
    "--api",
    "--app-base-domain",
    "--base-port",
    "--count",
    "--dashboard-root-url",
    "--inspect-token",
    "--name",
    "--out",
    "--port",
    "--public-root-url",
    "--role",
    "--target",
    "--template"
]);
export function positionals(args) {
    const values = [];
    for (let index = 0; index < args.length; index += 1) {
        const value = args[index];
        if (value.startsWith("--")) {
            if (optionsWithValues.has(value)) {
                index += 1;
            }
            continue;
        }
        values.push(value);
    }
    return values;
}
export function readNumberArg(args, name, fallback) {
    const value = Number(readArg(args, name, String(fallback)));
    if (!Number.isInteger(value) || value <= 0) {
        throw new Error(`${name} must be a positive integer.`);
    }
    return value;
}
export function hasFlag(args, name) {
    return args.includes(name);
}
export function resolveCapsuleDir(value) {
    if (!value) {
        return root;
    }
    return isAbsolute(value) ? value : resolve(root, value);
}
export function shellQuote(value) {
    const text = String(value);
    if (/^[A-Za-z0-9_./:=,@%+-]+$/.test(text)) {
        return text;
    }
    return `'${text.replaceAll("'", "'\\''")}'`;
}
//# sourceMappingURL=args.js.map
