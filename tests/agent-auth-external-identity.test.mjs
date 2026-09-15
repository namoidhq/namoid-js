import assert from "node:assert/strict";
import test from "node:test";
import { NamoIDAgentAuth } from "../packages/agent-auth/dist/index.js";

const options = { clientId: "app", clientSecret: "secret", baseUrl: "http://localhost:8001" };
const identity = { identitySourceId: "source", subject: "Org-1/User-α", sessionReference: "non-secret-login-reference" };

test("context creation authenticates only the backend and redacts returned tokens", async () => {
  const requests = [];
  const client = new NamoIDAgentAuth({ ...options, fetch: async (url, init) => {
    requests.push({ url: String(url), init });
    return Response.json({ id: "ctx", principal_id: "principal", identity_source_id: "source", token: "namoid_agent_identity_secret", expires_in: 39, expires_at: "2030-01-01T00:00:00Z" });
  }});
  const context = await client.identityContexts.create({ ...identity, expiresIn: 40 });
  assert.equal(requests[0].init.headers.authorization, undefined);
  assert.equal(requests[0].init.headers["x-namoid-client-secret"], "secret");
  assert.deepEqual(JSON.parse(requests[0].init.body), { identity_source_id: "source", subject: identity.subject, session_reference: identity.sessionReference, expires_in: 40 });
  assert.equal(context.expiresIn, 39);
  assert.equal(JSON.stringify(context).includes(context.token), false);
});

test("shared SDK never mixes native and external authorities", async () => {
  const bearers = [];
  const client = new NamoIDAgentAuth({ ...options, fetch: async (_url, init) => {
    bearers.push(init.headers.authorization);
    return Response.json([]);
  }});
  await Promise.all([
    client.userConnections.list({ accessToken: "native" }),
    client.userConnections.list({ identityContextToken: "namoid_agent_identity_alice" }),
    client.userConnections.list({ identityContextToken: "namoid_agent_identity_bob" }),
  ]);
  assert.deepEqual(new Set(bearers), new Set(["Bearer native", "Bearer namoid_agent_identity_alice", "Bearer namoid_agent_identity_bob"]));
  await assert.rejects(client.userConnections.list({ accessToken: "native", identityContextToken: "namoid_agent_identity_alice" }), { code: "invalid_user_assertion" });
  await assert.rejects(client.userConnections.list({ identityContextToken: "native" }), { code: "invalid_user_assertion" });
});

test("logout and suspension work after context expiry and accept empty responses", async () => {
  const requests = [];
  const client = new NamoIDAgentAuth({ ...options, fetch: async (url, init) => {
    requests.push({ path: new URL(url).pathname, init });
    return new Response(null, { status: 204 });
  }});
  await client.externalSessions.revoke(identity);
  await client.externalPrincipals.suspend(identity);
  await client.identityContexts.revoke("ctx");
  assert.equal(requests.length, 3);
  for (const request of requests) assert.equal(request.init.headers.authorization, undefined);
  assert.equal(requests[0].path, "/v1/agent-auth/external-sessions/revoke");
});

test("external identity validates input and does not retry ambiguous requests", async () => {
  let calls = 0;
  const client = new NamoIDAgentAuth({ ...options, fetch: async () => { calls++; throw new Error("network"); } });
  for (const input of [{ ...identity, subject: "" }, { ...identity, sessionReference: "raw\ncookie" }, { ...identity, expiresIn: 301 }, { ...identity, sessionExpiresAt: "2030-01-01" }]) {
    await assert.rejects(client.identityContexts.create(input), { code: "invalid_configuration" });
  }
  assert.equal(calls, 0);
  await assert.rejects(client.identityContexts.create(identity), { code: "network_error", retryable: false });
  assert.equal(calls, 1);
});
