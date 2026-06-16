import { LAKEBED_APP_BASE_DOMAIN, LAKEBED_RELEASE_CHANNEL } from "./release.js";
export const cliPackageSpec = LAKEBED_RELEASE_CHANNEL === "staging" ? "riverbed@staging" : "riverbed";
export const cliCommand = `npx ${cliPackageSpec}`;
export const defaultHostedAppBaseDomain = LAKEBED_APP_BASE_DOMAIN;
//# sourceMappingURL=command.js.map
