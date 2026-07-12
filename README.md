# NamoID JavaScript SDKs

[![@namoidhq/js](https://img.shields.io/npm/v/@namoidhq/js.svg?label=%40namoidhq%2Fjs)](https://www.npmjs.com/package/@namoidhq/js)
[![@namoidhq/react](https://img.shields.io/npm/v/@namoidhq/react.svg?label=%40namoidhq%2Freact)](https://www.npmjs.com/package/@namoidhq/react)
[![@namoidhq/nextjs](https://img.shields.io/npm/v/@namoidhq/nextjs.svg?label=%40namoidhq%2Fnextjs)](https://www.npmjs.com/package/@namoidhq/nextjs)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

The JavaScript/TypeScript SDKs for [NamoID](https://namoid.in) Hosted Auth. A pnpm monorepo; every JS/TS package lives here.

## Packages

| Package | npm | What it is |
|---|---|---|
| [`@namoidhq/js`](./packages/js) | `@namoidhq/js` | Core SDK — Hosted Auth URLs, auth config, PKCE transactions, token exchange, and native session helpers |
| [`@namoidhq/react`](./packages/react) | `@namoidhq/react` | React provider, hooks, and hosted sign-in / sign-up / waitlist components |
| [`@namoidhq/nextjs`](./packages/nextjs) | `@namoidhq/nextjs` | Next.js route-handler adapter — PKCE redirects, callback handling, and secure transaction cookies |

Future framework adapters (`@namoidhq/vue`, `@namoidhq/svelte`, …) go in this same repo under `packages/`.

## Install

```bash
npm install @namoidhq/js
# React apps:
npm install @namoidhq/react @namoidhq/js
# Next.js apps:
npm install @namoidhq/nextjs @namoidhq/js
```

## Develop

Requires [pnpm](https://pnpm.io).

```bash
pnpm install        # links the workspace packages
pnpm build          # builds every package (tsc), in dependency order
pnpm typecheck
```

`@namoidhq/react` and `@namoidhq/nextjs` depend on `@namoidhq/js` via `workspace:^`, so changes to the core SDK are picked up locally with no republish.

## Repo layout

```
packages/
  js/        @namoidhq/js       (core primitives)
  react/     @namoidhq/react    (React UI)
  nextjs/    @namoidhq/nextjs   (Next.js server routes)
```

## Links

- Website — [namoid.in](https://namoid.in)
- Docs — [docs.namoid.in](https://docs.namoid.in)
- Contact — [hello@namoid.in](mailto:hello@namoid.in)
- Issues — [github.com/namoidhq/namoid-js/issues](https://github.com/namoidhq/namoid-js/issues)

## License

[MIT](./LICENSE) © PolyMindsLabs Pvt. Ltd.
