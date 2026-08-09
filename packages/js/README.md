# @namoidhq/js

Core JavaScript SDK for **NamoID Hosted Auth** using OpenID Connect Authorization Code with PKCE.

```bash
npm i @namoidhq/js
```

## Start hosted sign-in

```ts
import { createNamoIDClient } from "@namoidhq/js";

const namoid = createNamoIDClient({
  clientId: "namoid_client_live_...",
});

const started = await namoid.hostedAuth.start({
  redirectUri: "https://your-app.com/auth/callback",
  scopes: ["openid", "email"],
});

// Retain this one-time transaction until the callback. Do not store tokens here.
sessionStorage.setItem("namoid_transaction", JSON.stringify(started.transaction));
window.location.assign(started.authorizationUrl);
```

The Client ID resolves the correct issuer and Hosted Auth domain. The SDK then uses issuer discovery instead of hard-coded OAuth endpoints.

## Complete a public-client callback

```ts
const transaction = JSON.parse(sessionStorage.getItem("namoid_transaction")!);
const callback = new URL(window.location.href);

if (callback.searchParams.get("state") !== transaction.state) {
  throw new Error("Invalid authorization state");
}

const tokens = await namoid.hostedAuth.exchangeCode({
  code: callback.searchParams.get("code")!,
  redirectUri: transaction.redirectUri,
  codeVerifier: transaction.codeVerifier,
});

const identity = await namoid.hostedAuth.userInfo(tokens.access_token);
sessionStorage.removeItem("namoid_transaction");
```

For browser apps, prefer [`@namoidhq/react`](https://www.npmjs.com/package/@namoidhq/react), which validates state, response issuer, the signed ID token, nonce, and the UserInfo subject. Do not persist bearer or refresh tokens in `localStorage` or `sessionStorage`.

For confidential Next.js apps, use [`@namoidhq/nextjs`](https://www.npmjs.com/package/@namoidhq/nextjs) so the Client Secret, PKCE verifier, callback validation, refresh token, and application session remain server-side.

Docs: <https://docs.namoid.in> · Contact: hello@namoid.in

## License

MIT © PolyMindsLabs Pvt. Ltd.
