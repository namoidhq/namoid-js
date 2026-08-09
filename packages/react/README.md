# @namoidhq/react

React helpers for **NamoID Hosted Auth** using OpenID Connect Authorization Code with PKCE.

```bash
npm i @namoidhq/react @namoidhq/js
```

```tsx
import { NamoIDProvider, SignIn } from "@namoidhq/react";

export function App() {
  return (
    <NamoIDProvider clientId="namoid_client_test_...">
      <SignIn redirectUri="https://your-app.com/auth/callback" />
    </NamoIDProvider>
  );
}
```

Complete the callback with `completeHostedAuthRedirect`. It validates state, authorization-response issuer, the signed ID token, nonce, and the UserInfo subject before returning tokens and identity.

```ts
import { completeHostedAuthRedirect, useNamoID } from "@namoidhq/react";

const result = await completeHostedAuthRedirect(namoid);
console.log(result.identity.sub);
```

The React adapter keeps only the one-time PKCE transaction in `sessionStorage`. It does not persist bearer or refresh tokens. Prefer a confidential BFF such as [`@namoidhq/nextjs`](https://www.npmjs.com/package/@namoidhq/nextjs) for production applications that need durable sessions or refresh tokens.

Docs: <https://docs.namoid.in> · Contact: hello@namoid.in

## License

MIT © PolyMindsLabs Pvt. Ltd.
