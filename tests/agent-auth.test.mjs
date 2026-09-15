import assert from "node:assert/strict";
import test from "node:test";

import {
  NamoIDAgentAuth,
  NamoIDAgentAuthError,
} from "../packages/agent-auth/dist/index.js";

const clientId = "namoid_client_test";
const clientSecret = "namoid_secret_test";
const accessToken = "user-access-token";
const user = { accessToken };

function client(fetcher, options = {}) {
  return new NamoIDAgentAuth({
    clientId,
    clientSecret,
    baseUrl: "http://localhost:8000",
    fetch: fetcher,
    ...options,
  });
}

test("Agent Auth sends separate application and user authorities", async () => {
  const requests = [];
  const agentAuth = client(async (request, init) => {
    requests.push({ url: new URL(request), init, body: JSON.parse(init.body) });
    return Response.json(
      { id: "connect-1", authorize_url: "/v1/agent-auth/connect/txn", expires_in: 300 },
      { status: 201 },
    );
  });

  const result = await agentAuth.userConnections.create(
    {
      connectionId: "connection-1",
      returnUrl: "https://app.example.com/connections/callback",
    },
    user,
  );

  assert.equal(requests.length, 1);
  assert.equal(requests[0].init.headers["x-namoid-client-id"], clientId);
  assert.equal(requests[0].init.headers["x-namoid-client-secret"], clientSecret);
  assert.equal(requests[0].init.headers.authorization, `Bearer ${accessToken}`);
  assert.deepEqual(requests[0].body, {
    connection_id: "connection-1",
    return_url: "https://app.example.com/connections/callback",
  });
  assert.deepEqual(result, {
    id: "connect-1",
    authorizeUrl: "http://localhost:8000/v1/agent-auth/connect/txn",
    expiresIn: 300,
  });
});

test("User connections preserve their parent Connection", async () => {
  const agentAuth = client(async (request) => {
    const path = new URL(request).pathname;
    if (path.endsWith("/connect-sessions/connect-1")) {
      return Response.json({
        id: "connect-1",
        status: "completed",
        connected_account_id: "user-connection-1",
      });
    }
    return Response.json([
      {
        id: "user-connection-1",
        connection_id: "connection-1",
        connector: "gmail",
        provider_display_hint: "user@example.com",
        granted_scopes: ["gmail.readonly"],
        status: "active",
        authorized_at: "2026-08-14T12:00:00Z",
        revoked_at: null,
      },
    ]);
  });

  const status = await agentAuth.userConnections.getSession("connect-1", user);
  const [userConnection] = await agentAuth.userConnections.list(user);

  assert.equal(status.userConnectionId, "user-connection-1");
  assert.equal(userConnection.id, "user-connection-1");
  assert.equal(userConnection.connectionId, "connection-1");
});

test("one shared client does not cache or mix user access tokens", async () => {
  const authorizations = [];
  const agentAuth = client(async (_request, init) => {
    authorizations.push(init.headers.authorization);
    return Response.json([]);
  });

  await Promise.all([
    agentAuth.userConnections.list({ accessToken: "user-a" }),
    agentAuth.userConnections.list({ accessToken: "user-b" }),
  ]);

  assert.deepEqual(new Set(authorizations), new Set(["Bearer user-a", "Bearer user-b"]));
});

test("MCP session maps the API response and redacts JSON serialization", async () => {
  const agentAuth = client(async () =>
    Response.json(
      {
        id: "session-1",
        gateway_id: "gateway-1",
        gateway_revision_id: "revision-1",
        connected_account_id: "account-1",
        status: "active",
        expires_at: "2026-08-14T12:05:00Z",
        revoked_at: null,
        revoked_reason: null,
        created_at: "2026-08-14T12:00:00Z",
        token: "namoid_agent_auth_st_secret",
        gateway_url: "/mcp/mail-reader",
      },
      { status: 201 },
    ),
  );

  const session = await agentAuth.sessions.create(
    { gatewayId: "gateway-1", userConnectionId: "account-1" },
    user,
  );

  assert.equal(session.mcp.url, "http://localhost:8000/mcp/mail-reader");
  assert.equal(session.mcp.headers.Authorization, "Bearer namoid_agent_auth_st_secret");
  assert.equal(session.gatewayRevisionId, "revision-1");
  const serialized = JSON.stringify(session);
  assert.equal(serialized.includes("namoid_agent_auth_st_secret"), false);
  assert.equal(serialized.includes("[REDACTED]"), true);
});

test("MCP session creation omits account selection for one compatible Connection", async () => {
  let requestBody;
  const agentAuth = client(async (_request, init) => {
    requestBody = JSON.parse(init.body);
    return Response.json(
      {
        id: "session-1",
        gateway_id: "gateway-1",
        gateway_revision_id: "revision-1",
        connected_account_id: "server-resolved-account",
        status: "active",
        expires_at: "2026-08-14T12:05:00Z",
        revoked_at: null,
        revoked_reason: null,
        created_at: "2026-08-14T12:00:00Z",
        token: "namoid_agent_auth_st_secret",
        gateway_url: "/mcp/mail-reader",
      },
      { status: 201 },
    );
  });

  const session = await agentAuth.sessions.create({ gatewayId: "gateway-1" }, user);

  assert.deepEqual(requestBody, { gateway_id: "gateway-1" });
  assert.equal(session.userConnectionId, "server-resolved-account");
});

test("custom MCP sessions accept a null User connection", async () => {
  const agentAuth = client(async () =>
    Response.json(
      {
        id: "session-1",
        gateway_id: "gateway-1",
        gateway_revision_id: "revision-1",
        connected_account_id: null,
        status: "active",
        expires_at: "2026-08-14T12:05:00Z",
        revoked_at: null,
        revoked_reason: null,
        created_at: "2026-08-14T12:00:00Z",
        token: "namoid_agent_auth_st_secret",
        gateway_url: "/mcp/calendar-reader",
      },
      { status: 201 },
    ),
  );

  const session = await agentAuth.sessions.create({ gatewayId: "gateway-1" }, user);

  assert.equal(session.userConnectionId, null);
  assert.equal(session.mcp.url, "http://localhost:8000/mcp/calendar-reader");
});

test("structured server errors retain safe recovery details", async () => {
  const agentAuth = client(async () =>
    Response.json(
      {
        error: "account_selection_required",
        message: "select one account",
        detail: {
          connected_account_ids: ["account-1", "account-2"],
          provider_token: "must-not-leak",
        },
      },
      { status: 409, headers: { "x-request-id": "request-1" } },
    ),
  );

  await assert.rejects(
    agentAuth.sessions.create({ gatewayId: "gateway-1" }, user),
    (error) => {
      assert.ok(error instanceof NamoIDAgentAuthError);
      assert.equal(error.code, "account_selection_required");
      assert.equal(error.status, 409);
      assert.equal(error.requestId, "request-1");
      assert.deepEqual(error.details.connected_account_ids, ["account-1", "account-2"]);
      assert.equal(error.details.provider_token, "[REDACTED]");
      return true;
    },
  );
});

test("timeouts and caller aborts have distinct stable error codes", async () => {
  const never = (_request, init) =>
    new Promise((_resolve, reject) => {
      init.signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
    });
  const agentAuth = client(never, { timeoutMs: 10 });

  await assert.rejects(agentAuth.userConnections.list(user), { code: "request_timeout" });

  const aborter = new AbortController();
  const pending = agentAuth.userConnections.list(user, {
    signal: aborter.signal,
    timeoutMs: 1_000,
  });
  aborter.abort();
  await assert.rejects(pending, { code: "request_aborted" });
});

test("configuration rejects browser use and unsafe URLs", () => {
  assert.throws(
    () => client(async () => Response.json({}), { baseUrl: "http://example.com" }),
    { code: "invalid_configuration" },
  );
});

test("malformed successful responses fail with a stable non-secret error", async () => {
  const agentAuth = client(async () => Response.json({ token: "should-not-appear" }));

  await assert.rejects(
    agentAuth.sessions.create({ gatewayId: "gateway-1" }, user),
    (error) => {
      assert.equal(error.code, "unexpected_response");
      assert.equal(error.message.includes("should-not-appear"), false);
      return true;
    },
  );
});

test("invalid Application credentials are distinct from invalid user assertions", async () => {
  const agentAuth = client(async () =>
    Response.json(
      { error: "unauthorized", message: "invalid Application credentials", detail: {} },
      { status: 401 },
    ),
  );

  await assert.rejects(agentAuth.userConnections.list(user), {
    code: "application_not_authorized",
  });
});

test("only read requests advertise safe retries before idempotency exists", async () => {
  const agentAuth = client(async () =>
    Response.json(
      { error: "upstream_error", message: "temporarily unavailable", detail: {} },
      { status: 503 },
    ),
  );

  await assert.rejects(agentAuth.userConnections.list(user), {
    code: "provider_unavailable",
    retryable: true,
  });
  await assert.rejects(agentAuth.sessions.create({ gatewayId: "gateway-1" }, user), {
    code: "provider_unavailable",
    retryable: false,
  });
});
