# NamoID JavaScript SDKs

[![@namoidhq/js](https://img.shields.io/npm/v/@namoidhq/js.svg?label=%40namoidhq%2Fjs)](https://www.npmjs.com/package/@namoidhq/js)
[![@namoidhq/react](https://img.shields.io/npm/v/@namoidhq/react.svg?label=%40namoidhq%2Freact)](https://www.npmjs.com/package/@namoidhq/react)
[![@namoidhq/nextjs](https://img.shields.io/npm/v/@namoidhq/nextjs.svg?label=%40namoidhq%2Fnextjs)](https://www.npmjs.com/package/@namoidhq/nextjs)
[![@namoidhq/mcp](https://img.shields.io/npm/v/@namoidhq/mcp.svg?label=%40namoidhq%2Fmcp)](https://www.npmjs.com/package/@namoidhq/mcp)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

The JavaScript/TypeScript SDKs for [NamoID](https://namoid.in) — Hosted Auth for applications, and OAuth protection for MCP servers. A pnpm monorepo; every JS/TS package lives here.

## Packages

| Package | npm | What it is |
|---|---|---|
| [`@namoidhq/js`](./packages/js) | `@namoidhq/js` | Core SDK — Hosted Auth URLs, auth config, PKCE transactions, token exchange, and native session helpers |
| [`@namoidhq/react`](./packages/react) | `@namoidhq/react` | React provider, hooks, and hosted sign-in / sign-up / waitlist components |
| [`@namoidhq/nextjs`](./packages/nextjs) | `@namoidhq/nextjs` | Next.js route-handler adapter — PKCE redirects, callback handling, and secure transaction cookies |
| [`@namoidhq/mcp`](./packages/mcp) | `@namoidhq/mcp` | Protect an MCP server — RFC 9728 metadata, audience-bound token verification, and per-tool scopes |

Future framework adapters (`@namoidhq/vue`, `@namoidhq/svelte`, …) go in this same repo under `packages/`.

## Install

```bash
npm install @namoidhq/js
# React apps:
npm install @namoidhq/react @namoidhq/js
# Next.js apps:
npm install @namoidhq/nextjs @namoidhq/js
# MCP servers (does not need @namoidhq/js):
npm install @namoidhq/mcp @modelcontextprotocol/sdk
```

## Develop

Requires [pnpm](https://pnpm.io).

```bash
pnpm install        # links the workspace packages
pnpm build          # builds every package (tsc), in dependency order
pnpm typecheck
pnpm test           # builds, then runs tests/*.test.mjs against dist output
```

`@namoidhq/react` and `@namoidhq/nextjs` depend on `@namoidhq/js` via `workspace:^`, so changes to the core SDK are picked up locally with no republish.

`@namoidhq/mcp` deliberately depends on neither. It is a resource server that verifies tokens locally against JWKS, whereas `@namoidhq/js` is an OAuth client that validates tokens remotely with a Client Secret — different roles, no shared surface. It keeps `@modelcontextprotocol/sdk` as a peer dependency so the application's copy is the only one loaded.

## Repo layout

```
packages/
  js/        @namoidhq/js       (core primitives)
  react/     @namoidhq/react    (React UI)
  nextjs/    @namoidhq/nextjs   (Next.js server routes)
  mcp/       @namoidhq/mcp      (MCP resource-server authorization)
```

## Links

- Website — [namoid.in](https://namoid.in)
- Docs — [docs.namoid.in](https://docs.namoid.in)
- Contact — [hello@namoid.in](mailto:hello@namoid.in)
- Issues — [github.com/namoidhq/namoid-js/issues](https://github.com/namoidhq/namoid-js/issues)

## License

[MIT](./LICENSE) © PolyMindsLabs Pvt. Ltd.
