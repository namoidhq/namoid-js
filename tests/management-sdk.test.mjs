import assert from "node:assert/strict";
import test from "node:test";

import {
  NamoIDManagement,
  NamoIDManagementError,
} from "../packages/js/dist/server.js";

const issuer = "https://example.id.namoid.in";
const apiBaseUrl = "https://api.namoid.in";
const instanceId = "namoid_ins_test_abcdefghijklmnopqrstuvwx";
const clientId = "namoid_mgmt_test_client";
const clientSecret = "namoid_mgmts_test_secret";

function tokenResponse(token = "management-access-token") {
  return Response.json({
    access_token: token,
    token_type: "Bearer",
    expires_in: 300,
    scope: "users:read",
  });
}

function user(id) {
  return {
    id,
    user_kind: "regular",
    test_user_label: null,
    email: `${id}@example.com`,
    email_verified: true,
    user_created_at: "2026-09-02T00:00:00Z",
    first_consent_at: null,
    last_consent_at: null,
    last_seen_at: null,
    client_names: [],
    providers: [],
    picture: null,
  };
}

test("management client obtains and caches one client-credentials token", async () => {
  const requests = [];
  const namoid = new NamoIDManagement({
    issuer,
    apiBaseUrl,
    instanceId,
    clientId,
    clientSecret,
    fetcher: async (input, init = {}) => {
      const url = new URL(input);
      requests.push({ url, init });
      if (url.pathname === "/v1/oauth/token") return tokenResponse();
      if (url.pathname.endsWith("/users")) {
        return Response.json({ data: [user("one")], next_cursor: null, total_count: 1 });
      }
      if (url.pathname.endsWith("/users/two")) return Response.json(user("two"));
      throw new Error(`Unexpected request ${url}`);
    },
  });

  const [page, second] = await Promise.all([
    namoid.users.list({ limit: 25, query: "one" }),
    namoid.users.get("two"),
  ]);

  assert.equal(page.data[0].id, "one");
  assert.equal(second.id, "two");
  assert.equal(requests.filter(({ url }) => url.pathname === "/v1/oauth/token").length, 1);
  const tokenRequest = requests.find(({ url }) => url.pathname === "/v1/oauth/token");
  assert.equal(tokenRequest.init.method, "POST");
  assert.equal(
    tokenRequest.init.headers.authorization,
    `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
  );
  assert.equal(tokenRequest.init.body.get("grant_type"), "client_credentials");
  assert.equal(tokenRequest.init.body.get("resource"), "https://api.namoid.in/management");
  const apiRequests = requests.filter(({ url }) => url.pathname.startsWith("/management/"));
  assert.ok(apiRequests.every(({ init }) => init.headers.authorization === "Bearer management-access-token"));
  assert.equal(apiRequests[0].url.searchParams.get("limit"), "25");
  assert.equal(apiRequests[0].url.searchParams.get("q"), "one");
});

test("management pagination follows only returned opaque cursors", async () => {
  const cursors = [];
  const namoid = new NamoIDManagement({
    issuer,
    apiBaseUrl,
    instanceId,
    clientId,
    clientSecret,
    fetcher: async (input) => {
      const url = new URL(input);
      if (url.pathname === "/v1/oauth/token") return tokenResponse();
      const cursor = url.searchParams.get("cursor");
      cursors.push(cursor);
      return cursor === null
        ? Response.json({ data: [user("one")], next_cursor: "opaque-next", total_count: 2 })
        : Response.json({ data: [user("two")], next_cursor: null, total_count: 2 });
    },
  });

  const ids = [];
  for await (const page of namoid.users.pages({ limit: 1 })) {
    ids.push(...page.map((entry) => entry.id));
  }

  assert.deepEqual(ids, ["one", "two"]);
  assert.deepEqual(cursors, [null, "opaque-next"]);
});

test("a 401 clears the cached token and retries a safe read once", async () => {
  let tokenRequests = 0;
  let apiRequests = 0;
  const namoid = new NamoIDManagement({
    issuer,
    apiBaseUrl,
    instanceId,
    clientId,
    clientSecret,
    fetcher: async (input) => {
      const url = new URL(input);
      if (url.pathname === "/v1/oauth/token") {
        tokenRequests += 1;
        return tokenResponse(`token-${tokenRequests}`);
      }
      apiRequests += 1;
      if (apiRequests === 1) {
        return Response.json({ error: "unauthorized", message: "invalid_token" }, { status: 401 });
      }
      return Response.json({ data: [], next_cursor: null, total_count: 0 });
    },
  });

  await namoid.users.list();

  assert.equal(tokenRequests, 2);
  assert.equal(apiRequests, 2);
});

test("management errors expose safe diagnostics without credentials", async () => {
  const namoid = new NamoIDManagement({
    issuer,
    apiBaseUrl,
    instanceId,
    clientId,
    clientSecret,
    fetcher: async (input) => {
      const url = new URL(input);
      if (url.pathname === "/v1/oauth/token") return tokenResponse();
      return Response.json(
        { error: "forbidden", message: "insufficient_scope" },
        { status: 403, headers: { "x-request-id": "request-123" } },
      );
    },
  });

  await assert.rejects(
    () => namoid.users.list(),
    (error) => {
      assert.ok(error instanceof NamoIDManagementError);
      assert.equal(error.status, 403);
      assert.equal(error.code, "forbidden");
      assert.equal(error.requestId, "request-123");
      assert.equal(String(error).includes(clientSecret), false);
      return true;
    },
  );
});

test("management client validates bounded configuration before network use", async () => {
  assert.throws(
    () =>
      new NamoIDManagement({
        issuer,
        instanceId: "internal-environment-uuid",
        clientId,
        clientSecret,
      }),
    (error) => error instanceof NamoIDManagementError && error.code === "invalid_configuration",
  );
  assert.throws(
    () =>
      new NamoIDManagement({
        issuer: "http://remote.example",
        instanceId,
        clientId,
        clientSecret,
      }),
    (error) => error instanceof NamoIDManagementError && error.code === "invalid_configuration",
  );
  const namoid = new NamoIDManagement({
    issuer,
    instanceId,
    clientId,
    clientSecret,
    fetcher: async () => tokenResponse(),
  });
  await assert.rejects(
    () => namoid.users.list({ limit: 101 }),
    (error) => error instanceof NamoIDManagementError && error.code === "invalid_argument",
  );
});
