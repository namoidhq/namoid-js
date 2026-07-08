# @namoidhq/nextjs

Next.js route-handler SDK for **NamoID** hosted login.

It implements the secure OAuth/OIDC plumbing your app should not hand-roll:

- authorization code flow with PKCE
- `state` and `nonce` transaction cookies
- callback validation
- token endpoint exchange
- ID token signature and claim verification
- app-specific success hooks for your own session cookie

```bash
npm i @namoidhq/nextjs @namoidhq/js
```

## App Router example

`app/api/auth/login/route.ts`

```ts
import { createNamoIDNextClient } from "@namoidhq/nextjs";

const namoid = createNamoIDNextClient({
  issuer: process.env.NAMOID_ISSUER!,
  clientId: process.env.NAMOID_CLIENT_ID!,
  clientSecret: process.env.NAMOID_CLIENT_SECRET!,
  appBaseUrl: process.env.NEXT_PUBLIC_APP_URL!,
  redirectPath: "/api/auth/callback/namoid",
  postLoginRedirectPath: "/dashboard",
});

export const GET = () => namoid.login();
```

`app/api/auth/callback/namoid/route.ts`

```ts
import { createNamoIDNextClient } from "@namoidhq/nextjs";

const namoid = createNamoIDNextClient({
  issuer: process.env.NAMOID_ISSUER!,
  clientId: process.env.NAMOID_CLIENT_ID!,
  clientSecret: process.env.NAMOID_CLIENT_SECRET!,
  appBaseUrl: process.env.NEXT_PUBLIC_APP_URL!,
  redirectPath: "/api/auth/callback/namoid",
  postLoginRedirectPath: "/dashboard",
});

export const GET = (request: Request) =>
  namoid.callback(request, {
    async onSuccess({ tokens, idTokenClaims }) {
      // Create your own HttpOnly app session here.
      // Do not store OAuth tokens in localStorage or sessionStorage.
      return new Response(null, {
        status: 302,
        headers: { location: "/dashboard" },
      });
    },
  });
```

## NamoID Console as root partner

The NamoID console uses the same pattern as any partner app. The only difference
is the issuer/client points at the root tenant, and the callback can exchange the
root ID token for the console's first-party dashboard session.

```ts
import { createNamoIDNextClient, exchangeNamoIDCodeForSession } from "@namoidhq/nextjs";

const namoid = createNamoIDNextClient({
  issuer: process.env.CONSOLE_OIDC_ISSUER!,
  clientId: process.env.CONSOLE_OIDC_CLIENT_ID!,
  clientSecret: process.env.CONSOLE_OIDC_CLIENT_SECRET!,
  appBaseUrl: process.env.NEXT_PUBLIC_APP_URL!,
  redirectPath: "/oauth/callback",
  postLoginRedirectPath: "/overview",
  tokenEndpoint: process.env.CONSOLE_OIDC_INTERNAL_ISSUER
    ? `${process.env.CONSOLE_OIDC_INTERNAL_ISSUER}/v1/oauth/token`
    : undefined,
});

export const GET = (request: Request) =>
  namoid.callback(request, {
    async onSuccess({ tokens, transaction }) {
      const session = await exchangeNamoIDCodeForSession({
        apiBaseUrl: process.env.IDP_API_BASE!,
        idToken: tokens.id_token!,
        issuer: process.env.CONSOLE_OIDC_ISSUER!,
        clientId: process.env.CONSOLE_OIDC_CLIENT_ID!,
        nonce: transaction.nonce,
        sessionMintToken: process.env.CONSOLE_SESSION_MINT_TOKEN,
      });

      // Set the console's own HttpOnly session cookies from `session`.
      return new Response(null, {
        status: 302,
        headers: { location: "/overview" },
      });
    },
  });
```

Docs: <https://namoid.in> · Contact: hello@namoid.in

## License

MIT © PolyMindsLabs Pvt. Ltd.
