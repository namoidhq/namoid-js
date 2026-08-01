import assert from "node:assert/strict";
import test from "node:test";

import {
  createNamoIDClient,
  exchangeHostedAuthCode,
} from "../packages/js/dist/index.js";
import { createNamoIDNextClient } from "../packages/nextjs/dist/index.js";

const config = {
  client_id: "namoid_client_test_configured",
  issuer: "https://tenant.sandbox.namoid.in",
  hosted_auth_base_url: "https://tenant.sandbox.namoid.in",
  hosted_auth_pages: {
    sign_in:
      "https://tenant.sandbox.namoid.in/sign-in?client_id=namoid_client_test_configured",
  },
  access_mode: "open",
  waitlist_enabled: false,
  signin_methods: ["email_otp"],
  mfa_mode: "off",
  brand_logo_url: null,
  brand_primary_color: null,
  brand_accent_color: null,
  brand_dark_mode: false,
  brand_locale_default: "en",
  signup_tos_required: false,
  signup_tos_url: null,
  signup_privacy_url: null,
};

function configFetcher(request, init = {}) {
  const url = new URL(request);
  assert.equal(url.pathname, "/v1/auth/config");
  assert.equal(url.searchParams.get("client_id"), "namoid_client_test_configured");
  assert.equal(init.headers["X-API-Key"], undefined);
  return Promise.resolve(Response.json(config));
}

test("browser client uses the Client ID-resolved Hosted Auth entry point", async () => {
  const client = createNamoIDClient({
    clientId: "namoid_client_test_configured",
    fetcher: configFetcher,
  });

  const url = new URL(
    await client.hostedAuth.getUrl({
      returnTo: "https://app.example.com/callback",
      state: "state",
      completionMode: "public",
      extraParams: { client_id: "caller-supplied-id" },
    }),
  );

  assert.equal(url.origin, "https://tenant.sandbox.namoid.in");
  assert.equal(url.pathname, "/sign-in");
  assert.equal(url.searchParams.get("client_id"), "namoid_client_test_configured");
});

test("Next.js client uses the Client ID-resolved Hosted Auth entry point", async () => {
  const client = createNamoIDNextClient({
    clientId: "namoid_client_test_configured",
    clientSecret: "namoid_secret_test_configured",
    appBaseUrl: "https://app.example.com",
    fetcher: configFetcher,
  });

  const { hostedAuthUrl } = await client.createTransaction({
    returnTo: "/dashboard",
    extraParams: { client_id: "caller-supplied-id" },
  });
  const url = new URL(hostedAuthUrl);

  assert.equal(url.origin, "https://tenant.sandbox.namoid.in");
  assert.equal(url.pathname, "/sign-in");
  assert.equal(url.searchParams.get("client_id"), "namoid_client_test_configured");
  assert.equal(
    url.searchParams.get("return_to"),
    "https://app.example.com/api/auth/callback/namoid",
  );
});

test("confidential exchange sends application credentials in the request body", async () => {
  const tokens = await exchangeHostedAuthCode({
    code: "hosted-code",
    clientId: "namoid_client_test_configured",
    clientSecret: "namoid_secret_test_configured",
    fetcher: async (request, init) => {
      const url = new URL(request);
      assert.equal(url.origin, "https://api.namoid.in");
      assert.equal(url.pathname, "/v1/auth/hosted/exchange");
      assert.equal(init.headers["X-API-Key"], undefined);
      assert.deepEqual(JSON.parse(init.body), {
        code: "hosted-code",
        client_id: "namoid_client_test_configured",
        client_secret: "namoid_secret_test_configured",
      });
      return Response.json({ access_token: "access", token_type: "Bearer" });
    },
  });
  assert.equal(tokens.access_token, "access");
});

test("Next.js logout preserves the Client ID routing context", async () => {
  const client = createNamoIDNextClient({
    clientId: "namoid_client_test_configured",
    clientSecret: "namoid_secret_test_configured",
    appBaseUrl: "https://app.example.com",
    fetcher: configFetcher,
  });

  const response = await client.logout();
  const url = new URL(response.headers.get("location"));

  assert.equal(url.origin, "https://tenant.sandbox.namoid.in");
  assert.equal(url.pathname, "/sign-out");
  assert.equal(url.searchParams.get("client_id"), "namoid_client_test_configured");
  assert.equal(url.searchParams.get("return_to"), "https://app.example.com/login");
});

test("Next.js callback accepts a Response.redirect result with immutable headers", async () => {
  const fetcher = async (request) => {
    const url = new URL(request);
    if (url.pathname === "/v1/auth/hosted/exchange") {
      return Response.json({ access_token: "access", token_type: "Bearer", expires_in: 600 });
    }
    if (url.pathname === "/v1/auth/tokens/validate") {
      return Response.json({
        valid: true,
        user_id: "user-1",
        session_id: "session-1",
        client_id: "namoid_client_test_configured",
        scopes: [],
        error: null,
      });
    }
    throw new Error(`Unexpected request: ${url}`);
  };
  const client = createNamoIDNextClient({
    clientId: "namoid_client_test_configured",
    clientSecret: "namoid_secret_test_configured",
    appBaseUrl: "https://app.example.com",
    fetcher,
  });
  const createdAt = Date.now();
  const request = new Request(
    "https://app.example.com/api/auth/callback/namoid?code=hosted-code&state=state",
    {
      headers: {
        cookie: `namoid_state=state; namoid_return_to=%2Fdashboard; namoid_created_at=${createdAt}`,
      },
    },
  );

  const response = await client.callback(request, {
    onSuccess: () => Response.redirect("https://app.example.com/dashboard"),
  });

  assert.equal(response.status, 302);
  assert.equal(response.headers.get("location"), "https://app.example.com/dashboard");
  assert.match(response.headers.get("set-cookie"), /namoid_state=; Max-Age=0/);
  assert.doesNotMatch(response.headers.get("location"), /error=immutable/);
});
