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

## Hosted sign-in in a popup

Popup delivery uses the same OIDC Authorization Code + PKCE flow. Register a
same-origin callback such as `https://your-app.com/auth/namoid/popup` and render
this minimal bridge on that route:

```ts
import { relayHostedAuthPopupCallback } from "@namoidhq/js";

relayHostedAuthPopupCallback();
```

Then open Hosted Auth from a direct user click:

```ts
const result = await namoid.hostedAuth.popup({
  redirectUri: `${window.location.origin}/auth/namoid/popup`,
  // Optional: identityProvider: "google",
  // Optional: authenticationMethod: "passkey", "password", "email_otp",
  // "magic_link", or "phone_otp",
});

const tokens = await namoid.hostedAuth.exchangeCode({
  code: result.code,
  redirectUri: result.transaction.redirectUri,
  codeVerifier: result.transaction.codeVerifier,
});
```

The SDK binds the callback to a random, same-origin per-popup channel and
validates callback origin, state, and issuer. It also verifies the exact popup
handle when the browser preserves `window.opener`. The bridge relays only the
code, state, issuer, or a bounded OAuth error—never tokens or profile data. If
a browser blocks the popup, catch `popup_blocked` and offer a fresh normal
full-page redirect.

`identityProvider` selects a configured social provider. `authenticationMethod`
selects a configured hosted passkey, password, email-code, magic-link, or
phone-code ceremony. All remain ordinary OIDC Authorization Code + PKCE
requests; provider credentials, passwords, OTPs, and WebAuthn challenges never
move into the relying-party DOM.

`namoid.auth.getConfig()` includes `sign_in_choices`, which tells UI adapters
whether each configured choice uses a `native_challenge` or a
`browser_redirect`. Consume this field instead of inferring delivery from a
method name. The older method and provider lists remain available for
compatibility with earlier NamoID deployments.

## Custom SPA UI with native email OTP (Test preview)

Native email OTP is a guarded Test-only preview for trusted first-party SPA
applications provisioned for the preview. It is not a general Console setting.
Read `turnstile_site_key` and `native_auth_turnstile_actions` from
`namoid.auth.getConfig()` and obtain a fresh Turnstile token for each protected
step.

```ts
const started = await namoid.nativeAuth.start({
  redirectUri: `${window.location.origin}/auth/callback`,
  turnstileToken: startTurnstileToken,
});

await namoid.nativeAuth.requestEmailOtp({
  flowToken: started.flowToken,
  email,
  turnstileToken: otpTurnstileToken,
});

const authorization = await namoid.nativeAuth.verifyEmailOtp({
  flowToken: started.flowToken,
  email,
  code,
  transaction: started.transaction,
});

const tokens = await namoid.hostedAuth.exchangeCode({
  code: authorization.code,
  redirectUri: started.transaction.redirectUri,
  codeVerifier: started.transaction.codeVerifier,
});
```

Social login, passkeys, MFA, waitlists, custom registration fields, and mobile
native clients continue through Hosted Auth. Do not store bearer or refresh
tokens in browser storage.

## Consent-aware authentication analytics

After a successful callback, NamoID can expose one minimized `login` or
`sign_up` event. The SDK does not load an analytics vendor and does not decide
consent. Consume the event only after your application has established its
session:

```ts
await namoid.consumeAuthAnalyticsEvent(async (event) => {
  if (!analyticsConsentGranted()) return;

  gtag("event", event.name, {
    method: event.method,
  });
});
```

The SDK marks the event consumed before invoking the handler, preventing
duplicate delivery after refreshes or React Strict Mode. The event contains an
opaque event ID, method, application ID, Instance ID, and timestamp. It never
contains a user ID, workspace ID, email, phone number, or profile data. Handler
failures do not invalidate the authenticated session.

Docs: <https://docs.namoid.in> · Contact: hello@namoid.in

## Server-side Management API

`NamoIDManagement` is exported only from `@namoidhq/js/server`. Use a Management Client created
for the exact Instance; never expose its secret to browser, mobile, desktop, or edge-rendered
client code.

```ts
import { NamoIDManagement } from "@namoidhq/js/server";

const namoid = new NamoIDManagement({
  issuer: process.env.NAMOID_ISSUER!,
  instanceId: process.env.NAMOID_INSTANCE_ID!,
  clientId: process.env.NAMOID_MANAGEMENT_CLIENT_ID!,
  clientSecret: process.env.NAMOID_MANAGEMENT_CLIENT_SECRET!,
});

const firstPage = await namoid.users.list({ limit: 100 });
const user = await namoid.users.get(firstPage.data[0].id);

for await (const users of namoid.users.pages({ limit: 100 })) {
  // Reconcile one bounded page at a time.
}
```

The SDK obtains five-minute OAuth Client Credentials tokens, caches them only in memory, merges
concurrent token requests, follows opaque pagination cursors, retries one safe read after a `401`,
and exposes request IDs through `NamoIDManagementError`. The current public Management API supports
`users:read`; additional resources will be added as their machine scopes and gateway contracts are
released.

Authentication Hook configuration is intentionally not included yet: those endpoints currently
require an interactive Console administrator. A future SDK addition requires dedicated machine
scopes and isolated Management gateway routes first.

## License

MIT © PolyMindsLabs Pvt. Ltd.
