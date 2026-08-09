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

For a popup presentation, register a same-origin callback bridge as described
by `@namoidhq/js`, then use the popup button. It completes the same OIDC + PKCE
flow and validates the signed identity before calling `onSuccess`.

```tsx
import { HostedAuthPopupButton } from "@namoidhq/react";

<HostedAuthPopupButton
  redirectUri={`${window.location.origin}/auth/namoid/popup`}
  onSuccess={({ identity }) => console.log(identity.sub)}
  onError={(error) => console.error(error)}
>
  Sign in
</HostedAuthPopupButton>
```

## Drop-in sign-in and modal

`NamoIDSignIn` provides a branded, popup-first sign-in surface without
collecting credentials in your application DOM. It delegates email, social
providers, passkeys, MFA, consent, and recovery to Hosted Auth. If the browser
blocks the popup, it starts a fresh full-page redirect by default.

```tsx
import { NamoIDSignIn } from "@namoidhq/react";

<NamoIDSignIn
  redirectUri={`${window.location.origin}/auth/namoid/popup`}
  onComplete={({ identity }) => console.log(identity.sub)}
  appearance={{ accent: "#0d684f", radius: 16 }}
/>
```

For an overlay, control the accessible native-dialog wrapper from your own
button:

```tsx
const [open, setOpen] = useState(false);

<button onClick={() => setOpen(true)}>Sign in</button>
<NamoIDSignInModal
  open={open}
  onOpenChange={setOpen}
  redirectUri={`${window.location.origin}/auth/namoid/popup`}
  onComplete={() => setOpen(false)}
/>
```

Use `useNamoIDSignIn()` when you need to provide your own markup. It exposes
`config`, `status`, `error`, `ready`, `signIn()`, and `reset()` while retaining
the same verified popup and redirect-fallback behavior.

The React adapter keeps only short-lived protocol state in `sessionStorage`.
It does not persist bearer or refresh tokens. Prefer a confidential BFF such
as [`@namoidhq/nextjs`](https://www.npmjs.com/package/@namoidhq/nextjs) for
production applications that need durable sessions or refresh tokens.

Docs: <https://docs.namoid.in> · Contact: hello@namoid.in

## License

MIT © PolyMindsLabs Pvt. Ltd.
