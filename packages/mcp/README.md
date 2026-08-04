# @namoidhq/mcp

Protect a **Model Context Protocol server** with NamoID.

NamoID is the authorization server. Your MCP server is the protected resource.
An MCP host — Claude, ChatGPT, Cursor, VS Code — is the OAuth client, and the
signed-in human is the resource owner. NamoID authenticates that human, records
consent, and issues a short-lived token limited to your server and to the
actions approved. This package validates and enforces it.

```bash
npm i @namoidhq/mcp @modelcontextprotocol/sdk
```

No NamoID credentials required: a resource server only consumes public
discovery metadata and JWKS. Nothing here imports Express, so it works with the
MCP SDK's Express middleware, its web-standard transport, Hono, or Fastify.

## Use it

```ts
import { createNamoIDMcpAuth, requireScopes } from "@namoidhq/mcp";

const auth = await createNamoIDMcpAuth({
  // Console -> Environment -> MCP Authorization -> Integration details
  issuer: "https://acme-test.id.namoid.in",
  // The canonical MCP URL, exactly as registered as the resource audience
  resource: "https://mcp.acme.example/mcp",
  resourceName: "Acme Finance MCP",
  // Advertise only what an ordinary first connection needs
  scopesSupported: ["customers:read", "invoices:read"],
});
```

Publish the RFC 9728 document and mount the bearer challenge:

```ts
import express from "express";
import { requireBearerAuth } from "@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js";

const app = express();

app.get(auth.protectedResourceMetadataPath, (_req, res) => {
  res.json(auth.protectedResourceMetadata);
});

app.post(
  "/mcp",
  requireBearerAuth({
    verifier: auth.verifier,
    resourceMetadataUrl: auth.protectedResourceMetadataUrl,
  }),
  handleMcpRequest,
);
```

Do not set `requiredScopes` on the endpoint. Connecting needs a valid token, not
every scope — otherwise a read-only client cannot connect at all. Enforce scopes
per tool instead:

```ts
server.registerTool(
  "issue_refund",
  { title: "Issue refund", inputSchema: { invoiceId: z.string() } },
  requireScopes(auth, ["refunds:create"], async ({ invoiceId }, caller) => {
    // caller.subject is the NamoID user who consented, never the MCP host.
    await assertRefundAllowed(caller.subject, invoiceId);
    return issueRefund(invoiceId);
  }),
);
```

A scope is permission to **attempt** an action. `refunds:create` does not mean
this user may refund another organization's invoice or exceed your refund
policy. Ownership, limits, and every other business rule stay inside the
handler.

When a scope is missing, the tool answers with an `insufficient_scope` result
naming the missing scopes, the resource, and the metadata URL — what a host
needs to start incremental authorization. The tool stays visible in
`tools/list`, because hiding it would leave the host unable to ask for access.

## What it validates

`createNamoIDMcpAuth` runs discovery once at startup, so a wrong issuer or
resource fails immediately with a readable message rather than as an opaque
`401` on the first tool call. It fetches
`{issuer}/.well-known/oauth-authorization-server`, checks the document declares
the issuer you asked for — RFC 9700 mix-up defence — and reads `jwks_uri` from
it rather than hard-coding a key location.

Every token must satisfy all of:

| Check | Why |
|---|---|
| `RS256` from the environment's JWKS | The only algorithm NamoID issues |
| Exact `iss` | A token from another issuer is not yours |
| Exact `aud` | A token minted for MCP server A must fail on server B |
| `exp` / `nbf`, 30s tolerance | Configurable via `clockToleranceSeconds` |
| `token_use === "access"` | An ID token must never be an API token |
| `sub` and `client_id` present | Without `sub`, every caller is one identity |

Failures surface as the MCP SDK's `InvalidTokenError`, which
`requireBearerAuth` turns into a `401` plus the `WWW-Authenticate` challenge
that starts discovery. Reasons are short and never echo the token.

`@modelcontextprotocol/sdk` is a **peer** dependency on purpose. The SDK's
middleware identifies errors with `instanceof`, so a second copy of the SDK in
the tree would silently turn every `401` into a `500` and lose the challenge.

## API

| Export | What it is |
|---|---|
| `createNamoIDMcpAuth(options)` | Discovery, verifier, and metadata. Call once at startup. |
| `requireScopes(auth, scopes, handler)` | Wrap a tool handler in a scope check. |
| `callerFromAuthInfo(authInfo)` | Build an `McpCaller` from verified token info. |
| `protectedResourceMetadataPath(resource)` | Derive the RFC 9728 path from a resource URL. |
| `NamoIDMcpConfigurationError` | Thrown for bad configuration or discovery. |

Types: `NamoIDMcpAuth`, `NamoIDMcpAuthOptions`, `McpCaller`.

## Runnable examples

Complete servers, including a FastMCP equivalent in Python:
[namoid-examples/mcp-authorization](https://github.com/namoidhq/namoid-examples/tree/main/mcp-authorization).

## Client onboarding

NamoID resolves MCP clients by pre-registration or Client ID Metadata Document
(CIMD). Dynamic Client Registration is not available for customer-owned MCP
resources, so a host that can only do DCR cannot connect yet.

Docs: <https://namoid.in> · Contact: hello@namoid.in

## License

MIT © PolyMindsLabs Pvt. Ltd.
