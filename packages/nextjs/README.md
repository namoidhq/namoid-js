# @namoidhq/nextjs

Next.js route-handler SDK for **NamoID Hosted Auth**.

It hides the OpenID Connect plumbing your app should not hand-roll:

- issuer discovery and exact authorization endpoints
- Authorization Code with PKCE S256, state, and nonce
- HttpOnly, SameSite transaction cookies
- confidential code and refresh-token exchange
- authorization-response issuer and signed ID-token validation
- online UserInfo/session validation
- RFC 7009 grant revocation and RP-initiated logout

```bash
npm i @namoidhq/nextjs @namoidhq/js
```

## Configure once

```ts
import { createNamoIDNextClient } from "@namoidhq/nextjs";

export const namoid = createNamoIDNextClient({
  clientId: process.env.NAMOID_CLIENT_ID!,
  clientSecret: process.env.NAMOID_CLIENT_SECRET!,
  appBaseUrl: process.env.NEXT_PUBLIC_APP_URL!,
  callbackPath: "/api/auth/callback/namoid",
  postLoginRedirectPath: "/dashboard",
  postLogoutRedirectPath: "/login",
});
```

The callback URL must exactly match the URL registered in the NamoID Console.

## Login route

```ts
import { namoid } from "@/lib/namoid";

export const GET = () => namoid.login();
```

## Callback route

```ts
import { namoid } from "@/lib/namoid";

export const GET = (request: Request) =>
  namoid.callback(request, {
    async onSuccess({ tokens, identity }) {
      // Create your own opaque, HttpOnly application session here.
      // Keep tokens server-side; do not place them in browser storage.
      return new Response(null, {
        status: 302,
        headers: { location: "/dashboard" },
      });
    },
  });
```

NamoID requests the identity scopes `openid profile email` internally and adds
`offline_access` for this confidential server-side flow. Customers do not
configure scopes for ordinary sign-in. A refresh token is returned only when
the issuer grants `offline_access`; store it only in a protected server-side
session.

## Refresh and logout

```ts
const rotated = await namoid.refresh(serverSession.refreshToken);

return namoid.logout({
  refreshToken: serverSession.refreshToken,
  idTokenHint: serverSession.idToken,
});
```

Revocation ends the application grant. Supplying the retained ID-token hint additionally clears the NamoID browser SSO session and permits the registered post-logout redirect.

Docs: <https://docs.namoid.in> · Contact: hello@namoid.in

## License

MIT © PolyMindsLabs Pvt. Ltd.
