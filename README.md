# Riverbed

Riverbed is Hitesh's personal fork of Lakebed, a CLI and runtime for building small full-stack TypeScript apps called capsules.

This fork keeps the Lakebed capsule API intact. Existing capsules can continue importing from `lakebed/server` and `lakebed/client`.

## What Changed

Riverbed builds Tailwind CSS into the app by default.

- Tailwind is installed as a Riverbed dependency.
- Capsule authors do not need a Tailwind config, CSS file, PostCSS config, or build setup.
- `riverbed build` generates `client.css` beside `client.js`.
- `riverbed dev` serves a normal blocking stylesheet link:

```html
<link rel="stylesheet" href="/client.css" />
<script type="module" src="/client.js"></script>
```

There is no runtime `@tailwindcss/browser` CDN script, so hard refreshes do not wait for a remote CSS compiler before the app is styled.

## Usage

From a capsule:

```sh
npx riverbed dev
npx riverbed build --target anonymous --json
```

The `lakebed` bin alias is also kept for compatibility when this package is installed directly.

## Capsule Shape

Riverbed expects the same Lakebed v0 layout:

```txt
server/index.ts
client/index.tsx
shared/
```

Server code imports from `lakebed/server`. Client code imports from `lakebed/client`.

Styling is done with Tailwind classes in JSX.
