# @namoidhq/nextjs

Next.js route-handler SDK for **NamoID** hosted login.

It implements the secure NamoID Hosted Auth plumbing your app should not hand-roll:

- one-time hosted-code flow with PKCE
- `state` transaction cookies
- callback validation
- native session exchange and access-token validation
- app-specific success hooks for your own session cookie

Hosted Auth is the complete integration surface for this package. Browser code
uses a publishable key; server-side callback handling uses the environment auth
secret key.

```bash
npm i @namoidhq/nextjs @namoidhq/js
```

## App Router example

`app/api/auth/login/route.ts`

```ts
import { createNamoIDNextClient } from "@namoidhq/nextjs";

const namoid = createNamoIDNextClient({
  hostedAuthBaseUrl: process.env.NAMOID_HOSTED_AUTH_URL!,
  authSecretKey: process.env.NAMOID_AUTH_SECRET_KEY!,
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
  hostedAuthBaseUrl: process.env.NAMOID_HOSTED_AUTH_URL!,
  authSecretKey: process.env.NAMOID_AUTH_SECRET_KEY!,
  appBaseUrl: process.env.NEXT_PUBLIC_APP_URL!,
  redirectPath: "/api/auth/callback/namoid",
  postLoginRedirectPath: "/dashboard",
});

export const GET = (request: Request) =>
  namoid.callback(request, {
    async onSuccess({ tokens, idTokenClaims }) {
      // Create your own HttpOnly app session here.
      // Create your own HttpOnly app session here.
      return new Response(null, {
        status: 302,
        headers: { location: "/dashboard" },
      });
    },
  });
```


Docs: <https://namoid.in> · Contact: hello@namoid.in

## License

MIT © PolyMindsLabs Pvt. Ltd.
