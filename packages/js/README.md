# @namoidhq/js

Core JavaScript SDK for **NamoID** — identity infrastructure for India (OAuth 2.1 / OpenID Connect).

Use it to fetch auth config, build hosted-login URLs, create PKCE transactions, exchange authorization codes, call UserInfo, revoke tokens, and verify ID tokens against JWKS.

```bash
npm i @namoidhq/js
```

## Browser hosted login

```js
import { createNamoIDClient } from "@namoidhq/js";

const namoid = createNamoIDClient({ publishableKey: "pk_live_..." });

namoid.hostedLogin.redirect({
  mode: "signin",
  clientId: "your_client_id",
  redirectUri: "https://your-app.com/callback",
});
```

## Server-side OAuth callback primitives

```ts
import {
  createOAuthTransaction,
  buildHostedLoginUrl,
  exchangeAuthorizationCode,
  verifyIdToken,
} from "@namoidhq/js";

const transaction = await createOAuthTransaction();
const authorizeUrl = buildHostedLoginUrl("https://auth.your-project.namoid.in", {
  clientId: process.env.NAMOID_CLIENT_ID!,
  redirectUri: "https://your-app.com/callback",
  scope: "openid profile email offline_access",
  state: transaction.state,
  nonce: transaction.nonce,
  codeChallenge: transaction.codeChallenge,
  codeChallengeMethod: "S256",
});

const tokens = await exchangeAuthorizationCode({
  issuer: "https://auth.your-project.namoid.in",
  clientId: process.env.NAMOID_CLIENT_ID!,
  clientSecret: process.env.NAMOID_CLIENT_SECRET!,
  code,
  redirectUri: "https://your-app.com/callback",
  codeVerifier: transaction.codeVerifier,
});

const claims = await verifyIdToken({
  idToken: tokens.id_token!,
  issuer: "https://auth.your-project.namoid.in",
  audience: process.env.NAMOID_CLIENT_ID!,
  nonce: transaction.nonce,
});
```

For Next.js apps, prefer [`@namoidhq/nextjs`](https://www.npmjs.com/package/@namoidhq/nextjs) so transaction cookies and callback validation are handled for you.

Docs: <https://namoid.in> · Contact: hello@namoid.in

## License

MIT © PolyMindsLabs Pvt. Ltd.
