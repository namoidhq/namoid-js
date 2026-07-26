# @namoidhq/js

Core JavaScript SDK for **NamoID Hosted Auth**.

Use it to fetch auth config, build Hosted Auth URLs, create public PKCE transactions, exchange hosted codes, and revoke native sessions.

```bash
npm i @namoidhq/js
```

## Browser hosted login

```js
import { createNamoIDClient } from "@namoidhq/js";

const namoid = createNamoIDClient({ clientId: "namoid_client_live_..." });

const transaction = await namoid.hostedAuth.createPublicTransaction();

namoid.hostedAuth.redirect({
  mode: "sign_in",
  returnTo: "https://your-app.com/callback",
  state: transaction.state,
  completionMode: "public",
  codeChallenge: transaction.codeChallenge,
  codeChallengeMethod: "S256",
});
```

The Client ID identifies its application. The SDK resolves the linked
Hosted Auth domain and application context automatically; do not copy an
internal application UUID or API base URL into your app.

For Next.js apps, use [`@namoidhq/nextjs`](https://www.npmjs.com/package/@namoidhq/nextjs) so transaction cookies and callback validation are handled for you.

Server-side token validation is available from the server-only subpath:

```ts
import { validateAuthToken } from "@namoidhq/js/server";

const result = await validateAuthToken({
  token: accessToken,
  clientId: process.env.NAMOID_CLIENT_ID!,
  clientSecret: process.env.NAMOID_CLIENT_SECRET!,
});
```

Never expose the Client Secret or this server-only helper in browser code.

Docs: <https://namoid.in> · Contact: hello@namoid.in

## License

MIT © PolyMindsLabs Pvt. Ltd.
