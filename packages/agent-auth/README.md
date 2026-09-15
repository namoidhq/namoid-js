# `@namoidhq/agent-auth`

Server-only TypeScript SDK for NamoID customer Agent Auth. It lets a customer
backend connect a user's provider account and mint a short-lived, user-bound
MCP session without receiving provider OAuth credentials.

> Private preview. Do not use this package in browser code or expose the
> Application Client Secret to an agent, browser, mobile app, or model.

```bash
pnpm add @namoidhq/agent-auth
```

```ts
import { NamoIDAgentAuth } from "@namoidhq/agent-auth";

const agentAuth = new NamoIDAgentAuth({
  clientId: process.env.NAMOID_CLIENT_ID!,
  clientSecret: process.env.NAMOID_CLIENT_SECRET!,
});

// Load this from the application's authenticated server-side user session.
const user = { accessToken: currentUser.namoidAccessToken };

const connectSession = await agentAuth.userConnections.create(
  {
    connectionId: "connection_uuid",
    returnUrl: "https://app.example.com/settings/connections/callback",
  },
  user,
);

// Redirect the user's browser to connectSession.authorizeUrl, then confirm the
// result with userConnections.getSession(connectSession.id, user).

const session = await agentAuth.sessions.create(
  { gatewayId: "gateway_uuid" },
  user,
);

// NamoID resolves the account when this user has exactly one compatible
// active User connection. If several are compatible, list them, show an
// account picker, and retry with userConnectionId: selected.id.

// Pass session.mcp to a compatible MCP client. It contains the gateway URL and
// a five-minute Authorization header. Never persist or log the returned object.
```

When a custom MCP server requires no upstream authentication, `sessions.create`
still uses user-bound NamoID authorization. It returns `userConnectionId: null`
because no downstream provider account is required. The NamoID Gateway and
Runtime Session remain authenticated.

The SDK sends the Application Client ID and Client Secret in dedicated NamoID
headers and sends the current user's access token as the Bearer credential.
Every user-bound operation requires that token explicitly; it is never cached
on the SDK client.

Available resources:

- `userConnections.create` and `userConnections.getSession`
- `userConnections.list` and `userConnections.revoke`
- `sessions.create` and `sessions.revoke`

`sessions.create` does not require `userConnectionId` when the verified user
has exactly one active User connection compatible with the published Gateway. If
several accounts are eligible, NamoID returns `account_selection_required` with
opaque eligible account IDs; the product must ask the user which account to use
and retry with that selected User connection ID.

Errors are normalized as `NamoIDAgentAuthError`, with stable `code`, `status`,
`requestId`, `retryable`, and bounded non-secret `details` fields.
