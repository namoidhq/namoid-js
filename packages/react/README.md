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
collecting credentials in your application DOM. It reads public application
configuration and renders direct buttons for configured social providers and
hosted email-code, magic-link, phone-code, password, and passkey ceremonies.
Credentials, federation, WebAuthn, MFA, consent, and recovery still execute on
Hosted Auth. If the browser blocks the popup, it starts a fresh full-page
redirect by default. The first configured method is the primary action; the
component lists only the remaining methods as alternatives, avoiding a generic
intermediate picker and duplicate choices.

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
the same verified popup and redirect-fallback behavior. Custom markup can call
`signIn({ identityProvider: "google" })` or
`signIn({ authenticationMethod: "passkey" })` (also `email_otp`, `magic_link`,
`password`, or `phone_otp`); the server rejects methods that are not configured
for the application environment.

The drop-in consumes the server-resolved `sign_in_choices` contract. Native
challenges stay in the native component; browser-redirect choices open Hosted
Auth with the appropriate authentication-method or identity-provider hint.

## Google One Tap on your application

Add `NamoIDGoogleOneTap` beside your sign-in surface to offer the Google prompt
as soon as the page loads. The component sends Google's signed credential to
NamoID and continues through the same authorization-code with PKCE callback as
Hosted Auth.

```tsx
import { NamoIDGoogleOneTap, NamoIDSignIn } from "@namoidhq/react";

const oneTapCallback = `${window.location.origin}/auth/namoid/callback`;
const popupCallback = `${window.location.origin}/auth/namoid/popup`;

<>
  <NamoIDGoogleOneTap redirectUri={oneTapCallback} />
  <NamoIDSignIn
    redirectUri={popupCallback}
    onComplete={({ identity }) => console.log(identity.sub)}
  />
</>
```

Enable application-site One Tap on the Google provider in NamoID, register the
application as a public SPA with its exact redirect URI and allowed web origin,
and add that origin as an Authorized JavaScript origin in Google Cloud. Your
callback page completes the result with `completeHostedAuthRedirect` like any
other full-page Hosted Auth redirect. A restrictive Content Security Policy
must allow `https://accounts.google.com/gsi/client` for scripts and
`https://accounts.google.com/gsi/` for connections and frames.

## Native email OTP (Test preview)

`useNamoIDNativeEmailOtp()` is the explicit headless API for the guarded
customer-DOM email OTP preview. It is available only when the application
advertises `native`; unsupported environment policy fails closed. The SDK
loads Cloudflare Turnstile from NamoID's public configuration and obtains a
fresh token for every protected action. Customers do not configure site keys,
action names, widget IDs, or token callbacks.

Use the guarded drop-in when you want NamoID to render the email and code
steps. Other configured methods stay visible, but their secure ceremonies open
in Hosted Auth. MFA is not an initial sign-in method; NamoID enforces it there
after the primary factor when environment policy requires it.

```tsx
<NamoIDNativeEmailOtpSignIn
  redirectUri={`${window.location.origin}/auth/namoid/popup`}
  onComplete={({ identity }) => console.log(identity.sub)}
/>
```

For custom markup, use the headless hook:

```tsx
const auth = useNamoIDNativeEmailOtp({
  redirectUri: `${window.location.origin}/auth/namoid/callback`,
  onComplete: ({ identity }) => console.log(identity.sub),
});

await auth.requestCode(email);
await auth.verifyCode(code);
```

The hook keeps the challenge and PKCE transaction in React memory, preserves
account-nondisclosing request behavior, and completes through the standard OIDC
token exchange. Do not persist returned tokens in browser storage. Passkeys,
social federation, and policy-driven MFA continue through the hosted popup.
Applications with a restrictive Content Security Policy must allow
`https://challenges.cloudflare.com` for Turnstile scripts and frames. The
headless hook retains an optional `getTurnstileToken` override for advanced
integrations and deterministic tests; the drop-in requires no Turnstile prop.

The React adapter keeps only short-lived protocol state in `sessionStorage`.
It does not persist bearer or refresh tokens. Prefer a confidential BFF such
as [`@namoidhq/nextjs`](https://www.npmjs.com/package/@namoidhq/nextjs) for
production applications that need durable sessions or refresh tokens.

Docs: <https://docs.namoid.in> · Contact: hello@namoid.in

## License

MIT © PolyMindsLabs Pvt. Ltd.
