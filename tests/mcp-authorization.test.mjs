import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";

import { exportJWK, generateKeyPair, SignJWT } from "jose";

import {
  NamoIDMcpConfigurationError,
  callerFromAuthInfo,
  createNamoIDMcpAuth,
  protectedResourceMetadataPath,
  requireScopes,
} from "../packages/mcp/dist/index.js";

const KID = "test-key-1";

/**
 * Stand-in for a NamoID environment: RFC 8414 discovery plus JWKS, served over
 * loopback so `jose`'s remote key set fetches it the same way it would in
 * production.
 */
async function startAuthorizationServer(overrides = {}) {
  const { publicKey, privateKey } = await generateKeyPair("RS256", { extractable: true });
  const jwk = { ...(await exportJWK(publicKey)), kid: KID, alg: "RS256", use: "sig" };

  let issuer;
  const server = createServer((request, response) => {
    const url = new URL(request.url, issuer);
    const send = (body) => {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify(body));
    };

    if (url.pathname === "/.well-known/oauth-authorization-server") {
      return send({
        issuer,
        authorization_endpoint: `${issuer}/oauth/authorize`,
        token_endpoint: `${issuer}/v1/oauth/token`,
        jwks_uri: `${issuer}/v1/oauth/jwks.json`,
        response_types_supported: ["code"],
        grant_types_supported: ["authorization_code", "refresh_token"],
        code_challenge_methods_supported: ["S256"],
        client_id_metadata_document_supported: true,
        ...overrides,
      });
    }
    if (url.pathname === "/v1/oauth/jwks.json") {
      return send({ keys: [jwk] });
    }
    response.writeHead(404).end("{}");
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  issuer = `http://127.0.0.1:${server.address().port}`;

  return {
    issuer,
    close: () => new Promise((resolve) => server.close(resolve)),
    /** Mint a token the way NamoID's access-token path does. */
    async mint({
      audience,
      scope = "",
      subject = "user-uuid-1",
      clientId = "https://client.example/oauth/metadata.json",
      tokenUse = "access",
      issuerOverride,
      expiresIn = "5m",
    } = {}) {
      const claims = { client_id: clientId, scope, token_use: tokenUse };
      if (subject !== null) claims.sub = subject;
      return new SignJWT({
        ...claims,
        tid: "tenant-uuid",
        pid: "project-uuid",
        eid: "environment-uuid",
        jti: "token-uuid",
      })
        .setProtectedHeader({ alg: "RS256", kid: KID })
        .setIssuer(issuerOverride ?? issuer)
        .setAudience(audience)
        .setIssuedAt()
        .setExpirationTime(expiresIn)
        .sign(privateKey);
    },
  };
}

async function withAuth(run, { resource = null, overrides = {} } = {}) {
  const as = await startAuthorizationServer(overrides);
  try {
    const resourceUrl = resource ?? "https://mcp.acme.example/mcp";
    const auth = await createNamoIDMcpAuth({
      issuer: as.issuer,
      resource: resourceUrl,
      resourceName: "Acme Finance MCP",
      scopesSupported: ["customers:read", "invoices:read"],
    });
    await run({ as, auth, resource: resourceUrl });
  } finally {
    await as.close();
  }
}

test("derives the RFC 9728 metadata path from the resource path", () => {
  assert.equal(
    protectedResourceMetadataPath("https://mcp.acme.example/mcp"),
    "/.well-known/oauth-protected-resource/mcp",
  );
  assert.equal(
    protectedResourceMetadataPath("https://mcp.acme.example/"),
    "/.well-known/oauth-protected-resource",
  );
  assert.equal(
    protectedResourceMetadataPath("https://mcp.acme.example/a/b/"),
    "/.well-known/oauth-protected-resource/a/b",
  );
});

test("publishes the issuer exactly as the issuer spells it", async () => {
  await withAuth(({ as, auth }) => {
    // A trailing slash here would break RFC 8414's exact issuer comparison for
    // any client that follows this document back to the authorization server.
    assert.deepEqual(auth.protectedResourceMetadata.authorization_servers, [as.issuer]);
    assert.equal(auth.protectedResourceMetadata.resource, "https://mcp.acme.example/mcp");
    assert.equal(auth.protectedResourceMetadata.resource_name, "Acme Finance MCP");
    assert.deepEqual(auth.protectedResourceMetadata.bearer_methods_supported, ["header"]);
    assert.equal(
      auth.protectedResourceMetadataUrl,
      "https://mcp.acme.example/.well-known/oauth-protected-resource/mcp",
    );
  });
});

test("rejects a discovery document that declares a different issuer", async () => {
  const as = await startAuthorizationServer({ issuer: "https://someone-else.example" });
  try {
    await assert.rejects(
      createNamoIDMcpAuth({
        issuer: as.issuer,
        resource: "https://mcp.acme.example/mcp",
        scopesSupported: [],
      }),
      (error) =>
        error instanceof NamoIDMcpConfigurationError && /issuer mismatch/.test(error.message),
    );
  } finally {
    await as.close();
  }
});

test("rejects a discovery document with no jwks_uri", async () => {
  const as = await startAuthorizationServer({ jwks_uri: undefined });
  try {
    await assert.rejects(
      createNamoIDMcpAuth({
        issuer: as.issuer,
        resource: "https://mcp.acme.example/mcp",
        scopesSupported: [],
      }),
      (error) =>
        error instanceof NamoIDMcpConfigurationError && /jwks_uri/.test(error.message),
    );
  } finally {
    await as.close();
  }
});

test("rejects unusable issuer and resource configuration before any network call", async () => {
  const cases = [
    [{ issuer: "not-a-url", resource: "https://mcp.acme.example/mcp" }, /absolute URL/],
    [{ issuer: "http://mcp.acme.example", resource: "https://mcp.acme.example/mcp" }, /https/],
    [{ issuer: "https://a.example?x=1", resource: "https://mcp.acme.example/mcp" }, /query/],
    [{ issuer: "https://a.example", resource: "https://mcp.acme.example/mcp#frag" }, /fragment/],
    [{ issuer: "https://a.example", resource: "http://mcp.acme.example/mcp" }, /https/],
  ];
  for (const [options, expected] of cases) {
    await assert.rejects(
      createNamoIDMcpAuth({ ...options, scopesSupported: [] }),
      (error) => error instanceof NamoIDMcpConfigurationError && expected.test(error.message),
      `expected ${JSON.stringify(options)} to be rejected by ${expected}`,
    );
  }
});

test("accepts an audience-bound access token and exposes the caller", async () => {
  await withAuth(async ({ as, auth, resource }) => {
    const token = await as.mint({ audience: resource, scope: "customers:read invoices:read" });
    const info = await auth.verifier.verifyAccessToken(token);

    assert.deepEqual(info.scopes, ["customers:read", "invoices:read"]);
    assert.equal(info.clientId, "https://client.example/oauth/metadata.json");
    assert.equal(info.resource.href, resource);
    assert.equal(typeof info.expiresAt, "number");

    const caller = callerFromAuthInfo(info);
    assert.equal(caller.subject, "user-uuid-1");
    assert.equal(caller.tenantId, "tenant-uuid");
    assert.equal(caller.environmentId, "environment-uuid");
    assert.ok(caller.scopes.has("customers:read"));
  });
});

test("rejects tokens that must never reach a tool", async () => {
  await withAuth(async ({ as, auth, resource }) => {
    const cases = [
      [
        "a token minted for another MCP server",
        { audience: "https://other.example/mcp", scope: "invoices:read" },
        /issuer or audience/,
      ],
      [
        "an ID token presented as an API token",
        { audience: resource, scope: "invoices:read", tokenUse: "id" },
        /not an access token/,
      ],
      [
        "a token from a different issuer",
        { audience: resource, scope: "invoices:read", issuerOverride: "https://evil.example" },
        /issuer or audience/,
      ],
      [
        "a token with no subject",
        { audience: resource, scope: "invoices:read", subject: null },
        /missing the sub claim/,
      ],
      [
        "an expired token",
        { audience: resource, scope: "invoices:read", expiresIn: "-1m" },
        /expired/,
      ],
    ];

    for (const [label, mintOptions, expected] of cases) {
      const token = await as.mint(mintOptions);
      await assert.rejects(
        auth.verifier.verifyAccessToken(token),
        (error) => expected.test(error.message),
        `${label} should have been rejected by ${expected}`,
      );
    }

    await assert.rejects(auth.verifier.verifyAccessToken("not-a-jwt-at-all"));
  });
});

test("a forged signature is rejected even when every claim looks right", async () => {
  await withAuth(async ({ auth, as, resource }) => {
    // Same claims, signed by a key that is not in the environment's JWKS.
    const other = await startAuthorizationServer();
    try {
      const token = await other.mint({ audience: resource, scope: "invoices:read" });
      // Re-issue with the expected issuer so only the signing key differs.
      const forged = await other.mint({
        audience: resource,
        scope: "invoices:read",
        issuerOverride: as.issuer,
      });
      await assert.rejects(auth.verifier.verifyAccessToken(token));
      await assert.rejects(auth.verifier.verifyAccessToken(forged));
    } finally {
      await other.close();
    }
  });
});

test("requireScopes runs the handler when every scope is granted", async () => {
  await withAuth(async ({ as, auth, resource }) => {
    const token = await as.mint({ audience: resource, scope: "invoices:read refunds:create" });
    const authInfo = await auth.verifier.verifyAccessToken(token);

    const handler = requireScopes(auth, ["refunds:create"], async (args, caller) => ({
      content: [{ type: "text", text: `refunded ${args.invoiceId} for ${caller.subject}` }],
    }));

    const result = await handler({ invoiceId: "inv_1" }, { authInfo });
    assert.equal(result.isError, undefined);
    assert.equal(result.content[0].text, "refunded inv_1 for user-uuid-1");
  });
});

test("requireScopes answers a missing scope with an incremental challenge", async () => {
  await withAuth(async ({ as, auth, resource }) => {
    const token = await as.mint({ audience: resource, scope: "invoices:read" });
    const authInfo = await auth.verifier.verifyAccessToken(token);

    let handlerRan = false;
    const handler = requireScopes(auth, ["refunds:create"], async () => {
      handlerRan = true;
      return { content: [] };
    });

    const result = await handler({}, { authInfo });
    assert.equal(handlerRan, false, "the handler must not run without its scope");
    assert.equal(result.isError, true);
    assert.equal(result.structuredContent.error, "insufficient_scope");
    assert.deepEqual(result.structuredContent.required_scopes, ["refunds:create"]);
    assert.deepEqual(result.structuredContent.granted_scopes, ["invoices:read"]);
    assert.equal(result.structuredContent.resource, resource);
    assert.equal(
      result.structuredContent.resource_metadata,
      auth.protectedResourceMetadataUrl,
    );
    assert.match(result.structuredContent.www_authenticate, /error="insufficient_scope"/);
    assert.match(result.structuredContent.www_authenticate, /scope="refunds:create"/);
  });
});

test("requireScopes fails closed when there is no verified token", async () => {
  await withAuth(async ({ auth }) => {
    let handlerRan = false;
    const handler = requireScopes(auth, ["invoices:read"], async () => {
      handlerRan = true;
      return { content: [] };
    });

    const result = await handler({}, {});
    assert.equal(handlerRan, false);
    assert.equal(result.isError, true);
    assert.equal(result.structuredContent.error, "insufficient_scope");
  });
});
