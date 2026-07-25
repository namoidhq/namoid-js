import assert from "node:assert/strict";
import test from "node:test";

import { createNamoIDClient } from "../packages/js/dist/index.js";
import { createNamoIDNextClient } from "../packages/nextjs/dist/index.js";

const config = {
  project_id: "project-id",
  environment_id: "environment-id",
  key_prefix: "namoid_auth_pk_test",
  issuer: "https://tenant.sandbox.namoid.in",
  hosted_auth_base_url: "https://tenant.sandbox.namoid.in",
  hosted_auth_pages: {
    sign_in:
      "https://tenant.sandbox.namoid.in/sign-in?application_id=application-id",
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
  assert.equal(init.headers["X-API-Key"], "configured-key");
  return Promise.resolve(Response.json(config));
}

test("browser client uses the key-resolved Hosted Auth entry point", async () => {
  const client = createNamoIDClient({
    publishableKey: "configured-key",
    fetcher: configFetcher,
  });

  const url = new URL(
    await client.hostedAuth.getUrl({
      returnTo: "https://app.example.com/callback",
      state: "state",
      completionMode: "public",
      extraParams: { application_id: "caller-supplied-id" },
    }),
  );

  assert.equal(url.origin, "https://tenant.sandbox.namoid.in");
  assert.equal(url.pathname, "/sign-in");
  assert.equal(url.searchParams.get("application_id"), "application-id");
});

test("Next.js client uses the secret-key-resolved Hosted Auth entry point", async () => {
  const client = createNamoIDNextClient({
    authSecretKey: "configured-key",
    appBaseUrl: "https://app.example.com",
    fetcher: configFetcher,
  });

  const { hostedAuthUrl } = await client.createTransaction({
    returnTo: "/dashboard",
    extraParams: { application_id: "caller-supplied-id" },
  });
  const url = new URL(hostedAuthUrl);

  assert.equal(url.origin, "https://tenant.sandbox.namoid.in");
  assert.equal(url.pathname, "/sign-in");
  assert.equal(url.searchParams.get("application_id"), "application-id");
  assert.equal(
    url.searchParams.get("return_to"),
    "https://app.example.com/api/auth/callback/namoid",
  );
});

test("Next.js logout preserves the opaque application routing context", async () => {
  const client = createNamoIDNextClient({
    authSecretKey: "configured-key",
    appBaseUrl: "https://app.example.com",
    fetcher: configFetcher,
  });

  const response = await client.logout();
  const url = new URL(response.headers.get("location"));

  assert.equal(url.origin, "https://tenant.sandbox.namoid.in");
  assert.equal(url.pathname, "/sign-out");
  assert.equal(url.searchParams.get("application_id"), "application-id");
  assert.equal(url.searchParams.get("return_to"), "https://app.example.com/login");
});
