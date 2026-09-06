# JavaScript Management SDK scope

Status: first server-only slice implemented.

## Boundary

`NamoIDManagement` is a machine client for the isolated NamoID Management API. It is exported
only from `@namoidhq/js/server` and authenticates with an Instance-bound OAuth 2.0 Client
Credentials grant. It does not use an end-user token, Console cookie, Console administrator token,
OAuth Application Client Secret, or global NamoID key.

The SDK is intentionally separate from `createNamoIDClient`:

- `createNamoIDClient` runs customer sign-in with Authorization Code and PKCE.
- `NamoIDManagement` runs trusted backend automation with a five-minute, audience-bound machine
  access token.

## Implemented surface

```ts
const namoid = new NamoIDManagement({
  issuer,
  instanceId,
  clientId,
  clientSecret,
});

await namoid.users.list({ query, cursor, limit, userKind });
await namoid.users.get(userId);

for await (const users of namoid.users.pages({ limit: 100 })) {
  // bounded reconciliation
}
```

Operational behavior:

- exact Management audience and Instance path;
- in-memory token cache with a 30-second expiry skew;
- one in-flight token request shared by concurrent callers;
- one automatic retry for a safe GET after `401`;
- opaque cursor pagination without client-side cursor interpretation;
- 10-second default request timeout, configurable from 250 ms to 60 seconds;
- HTTPS required except explicit localhost development;
- redirects rejected;
- typed errors with status, machine code, request ID, and bounded retry timing;
- credentials and bearer tokens absent from thrown error details.

## Deliberately excluded

- Browser, mobile, desktop, or client-component use.
- Console APIs and interactive administrator bearer tokens.
- Automatic retries for writes.
- Persistent token or credential storage.
- Authentication Hook administration until the Management gateway exposes reviewed
  `authentication-hooks:read` and `authentication-hooks:write` scopes.
- Session operations until `sessions:read` and `sessions:revoke` are available in the deployed
  Management API contract.
- User lifecycle writes until the corresponding backend scopes and idempotency contracts exist.
- mTLS transport configuration in the first portable JavaScript implementation; customers using
  mTLS need a runtime-specific fetch adapter in a later release.

## Next compatible additions

Add resources without changing constructor semantics:

```text
namoid.sessions.*
namoid.authenticationHooks.*
namoid.organizations.*
```

Each resource ships only after its dedicated Management scopes, gateway handlers, audit behavior,
idempotency rules, and backend contract tests are production-ready. New scopes are always opt-in;
existing Management Clients never inherit them automatically.
