# @namoidhq/nextjs

Next.js route-handler SDK for **NamoID** hosted login.

It implements the secure NamoID Hosted Auth plumbing your app should not hand-roll:

- one-time hosted-code flow with PKCE
- `state` transaction cookies
- callback validation
- native session exchange and access-token validation
- app-specific success hooks for your own session cookie

Hosted Auth is the complete integration surface for this package. Server-side
callback handling uses an application Client ID and Client Secret.

The SDK reads browser-safe configuration using the Client ID and resolves the
correct Hosted Auth domain automatically. An internal application UUID and API
base URL are not required.

```bash
npm i @namoidhq/nextjs @namoidhq/js
```

## App Router example

`app/api/auth/login/route.ts`

```ts
import { createNamoIDNextClient } from "@namoidhq/nextjs";

const namoid = createNamoIDNextClient({
  clientId: process.env.NAMOID_CLIENT_ID!,
  clientSecret: process.env.NAMOID_CLIENT_SECRET!,
  appBaseUrl: process.env.NEXT_PUBLIC_APP_URL!,
  callbackPath: "/api/auth/callback/namoid",
  postLoginRedirectPath: "/dashboard",
});

export const GET = () => namoid.login();
```

`app/api/auth/callback/namoid/route.ts`

```ts
import { createNamoIDNextClient } from "@namoidhq/nextjs";

const namoid = createNamoIDNextClient({
  clientId: process.env.NAMOID_CLIENT_ID!,
  clientSecret: process.env.NAMOID_CLIENT_SECRET!,
  appBaseUrl: process.env.NEXT_PUBLIC_APP_URL!,
  callbackPath: "/api/auth/callback/namoid",
  postLoginRedirectPath: "/dashboard",
});

export const GET = (request: Request) =>
  namoid.callback(request, {
    async onSuccess({ tokens }) {
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
