# NamoID JavaScript SDKs

[![@namoidhq/js](https://img.shields.io/npm/v/@namoidhq/js.svg?label=%40namoidhq%2Fjs)](https://www.npmjs.com/package/@namoidhq/js)
[![@namoidhq/react](https://img.shields.io/npm/v/@namoidhq/react.svg?label=%40namoidhq%2Freact)](https://www.npmjs.com/package/@namoidhq/react)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

The JavaScript/TypeScript SDKs for [NamoID](https://namoid.in) — enterprise
identity for India (OAuth 2.1 / OIDC). A pnpm monorepo; every JS/TS package
lives here.

## Packages

| Package | npm | What it is |
|---|---|---|
| [`@namoidhq/js`](./packages/js) | `@namoidhq/js` | Core SDK — hosted-login URLs, auth config, session helpers |
| [`@namoidhq/react`](./packages/react) | `@namoidhq/react` | React provider, hooks, and hosted sign-in / sign-up / waitlist components |

Future framework adapters (`@namoidhq/nextjs`, `@namoidhq/vue`, …) go in this
same repo under `packages/`.

## Install

```bash
npm install @namoidhq/js
# React apps:
npm install @namoidhq/react @namoidhq/js
```

## Develop

Requires [pnpm](https://pnpm.io).

```bash
pnpm install        # links the workspace packages
pnpm build          # builds every package (tsc), in dependency order
pnpm typecheck
```

`@namoidhq/react` depends on `@namoidhq/js` via `workspace:^`, so changes to the
core SDK are picked up locally with no republish.

## Repo layout

```
packages/
  js/        @namoidhq/js     (core)
  react/     @namoidhq/react
```

## Links

- Website — [namoid.in](https://namoid.in)
- Docs — [docs.namoid.in](https://docs.namoid.in)
- Contact — [hello@namoid.in](mailto:hello@namoid.in)
- Issues — [github.com/namoidhq/namoid-js/issues](https://github.com/namoidhq/namoid-js/issues)

## License

[MIT](./LICENSE) © PolyMindsLabs Pvt. Ltd.
