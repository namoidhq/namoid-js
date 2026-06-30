# NamoID JavaScript SDKs

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

## License

[MIT](./LICENSE) © PolyMindsLabs Pvt. Ltd.
