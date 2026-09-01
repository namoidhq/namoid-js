import assert from "node:assert/strict";
import test from "node:test";

import { exportJWK, generateKeyPair, SignJWT } from "jose";

import {
  createNamoIDClient,
  relayHostedAuthPopupCallback,
} from "../packages/js/dist/index.js";
import { createNamoIDNextClient } from "../packages/nextjs/dist/index.js";

const issuer = "https://tenant.sandbox.namoid.in";
const clientId = "namoid_client_test_configured";
const clientSecret = "namoid_secret_test_configured";
const redirectUri = "https://app.example.com/api/auth/callback/namoid";

const config = {
  client_id: clientId,
  issuer,
  hosted_auth_base_url: issuer,
  hosted_auth_pages: { sign_in: `${issuer}/sign-in?client_id=${clientId}` },
  access_mode: "open",
  waitlist_enabled: false,
  signin_methods: ["email_otp"],
  social_providers: [
    { name: "google", display_name: "Google" },
    { name: "github", display_name: "GitHub" },
  ],
  sign_in_choices: [
    {
      id: "email_otp",
      display_name: "Email code",
      category: "local",
      delivery: "native_challenge",
      authorization_parameter: null,
    },
    {
      id: "google",
      display_name: "Google",
      category: "federated",
      delivery: "browser_redirect",
      authorization_parameter: "identity_provider",
    },
  ],
  login_delivery_modes: ["redirect", "native"],
  turnstile_site_key: "test-site-key",
  native_auth_turnstile_actions: {
    start: "native_start",
    email_otp_request: "otp_send",
  },
  mfa_mode: "off",
  brand_logo_url: null,
  brand_primary_color: null,
  brand_accent_color: null,
  brand_dark_mode: false,
  brand_locale_default: "en",
  support_email: "support@example.com",
  signup_tos_required: false,
  signup_tos_url: null,
  signup_privacy_url: null,
};

const discovery = {
  issuer,
  authorization_endpoint: `${issuer}/oauth/authorize`,
  token_endpoint: `${issuer}/v1/oauth/token`,
  userinfo_endpoint: `${issuer}/v1/oauth/userinfo`,
  jwks_uri: `${issuer}/v1/oauth/jwks.json`,
  revocation_endpoint: `${issuer}/v1/oauth/revoke`,
  end_session_endpoint: `${issuer}/oauth/logout`,
  response_types_supported: ["code"],
  grant_types_supported: ["authorization_code", "refresh_token"],
  code_challenge_methods_supported: ["S256"],
  token_endpoint_auth_methods_supported: ["client_secret_basic", "none"],
  scopes_supported: ["openid", "profile", "email", "offline_access"],
  authorization_response_iss_parameter_supported: true,
};

function metadataResponse(url) {
  if (url.pathname === "/v1/auth/config") {
    assert.equal(url.searchParams.get("client_id"), clientId);
    return Response.json(config);
  }
  if (url.pathname === "/.well-known/openid-configuration") {
    return Response.json(discovery);
  }
  return null;
}

test("browser client exposes the server-resolved sign-in delivery contract", async () => {
  const client = createNamoIDClient({
    clientId,
    fetcher: async (request) => {
      const response = metadataResponse(new URL(request));
      if (response) return response;
      throw new Error(`Unexpected request: ${request}`);
    },
  });

  const resolved = await client.auth.getConfig();
  assert.deepEqual(resolved.sign_in_choices, config.sign_in_choices);
});

test("browser client resolves discovery and builds Authorization Code + PKCE", async () => {
  const client = createNamoIDClient({
    clientId,
    fetcher: async (request) => {
      const response = metadataResponse(new URL(request));
      if (response) return response;
      throw new Error(`Unexpected request: ${request}`);
    },
  });
  const started = await client.hostedAuth.start({
    redirectUri: "https://spa.example.com/callback",
    scopes: ["openid", "email"],
  });
  const url = new URL(started.authorizationUrl);

  assert.equal(url.pathname, "/oauth/authorize");
  assert.equal(url.searchParams.get("response_type"), "code");
  assert.equal(url.searchParams.get("client_id"), clientId);
  assert.equal(url.searchParams.get("redirect_uri"), "https://spa.example.com/callback");
  assert.equal(url.searchParams.get("scope"), "openid email");
  assert.equal(url.searchParams.get("state"), started.transaction.state);
  assert.equal(url.searchParams.get("nonce"), started.transaction.nonce);
  assert.equal(url.searchParams.get("code_challenge_method"), "S256");
  assert.equal(url.searchParams.has("completion_mode"), false);
  assert.ok(started.transaction.codeVerifier.length >= 43);
});

test("browser client hides the standard identity scopes behind safe defaults", async () => {
  const client = createNamoIDClient({
    clientId,
    fetcher: async (request) => {
      const response = metadataResponse(new URL(request));
      if (response) return response;
      throw new Error(`Unexpected request: ${request}`);
    },
  });
  const started = await client.hostedAuth.start({
    redirectUri: "https://spa.example.com/callback",
  });

  assert.equal(
    new URL(started.authorizationUrl).searchParams.get("scope"),
    "openid profile email",
  );
});

test("browser client can select a configured identity provider", async () => {
  const client = createNamoIDClient({
    clientId,
    fetcher: async (request) => {
      const response = metadataResponse(new URL(request));
      if (response) return response;
      throw new Error(`Unexpected request: ${request}`);
    },
  });
  const started = await client.hostedAuth.start({
    redirectUri: "https://spa.example.com/callback",
    identityProvider: "google",
    extraParams: { identity_provider: "github" },
  });
  const url = new URL(started.authorizationUrl);

  assert.equal(url.searchParams.get("identity_provider"), "google");
});

test("browser client can select the hosted passkey ceremony", async () => {
  const client = createNamoIDClient({
    clientId,
    fetcher: async (request) => {
      const response = metadataResponse(new URL(request));
      if (response) return response;
      throw new Error(`Unexpected request: ${request}`);
    },
  });
  const started = await client.hostedAuth.start({
    redirectUri: "https://spa.example.com/callback",
    authenticationMethod: "passkey",
    extraParams: { authentication_method: "password" },
  });

  assert.equal(
    new URL(started.authorizationUrl).searchParams.get("authentication_method"),
    "passkey",
  );
});

test("browser client can select each configured hosted local ceremony", async () => {
  const client = createNamoIDClient({
    clientId,
    fetcher: async (request) => {
      const response = metadataResponse(new URL(request));
      if (response) return response;
      throw new Error(`Unexpected request: ${request}`);
    },
  });
  for (const authenticationMethod of [
    "email_otp",
    "magic_link",
    "password",
    "phone_otp",
  ]) {
    const started = await client.hostedAuth.start({
      redirectUri: "https://spa.example.com/callback",
      authenticationMethod,
    });
    assert.equal(
      new URL(started.authorizationUrl).searchParams.get("authentication_method"),
      authenticationMethod,
    );
  }
});

test("native email OTP remains bound to the standard OIDC transaction", async () => {
  const requests = [];
  let nativeState;
  const client = createNamoIDClient({
    clientId,
    fetcher: async (request, init = {}) => {
      const url = new URL(request);
      const metadata = metadataResponse(url);
      if (metadata) return metadata;
      const body = init.body ? JSON.parse(init.body) : null;
      requests.push({ url, init, body });
      if (url.pathname === "/v1/auth/native/start") {
        nativeState = body.state;
        return Response.json({
          flow_token: "native-flow-token-with-sufficient-length-123456",
          next_step: "email_otp",
          expires_in: 600,
        });
      }
      if (url.pathname === "/v1/auth/native/email-otp/request") {
        return Response.json({ status: "pending" });
      }
      if (url.pathname === "/v1/auth/native/email-otp/verify") {
        return Response.json({
          code: "native-authorization-code",
          state: nativeState,
          issuer,
          redirect_uri: "https://spa.example.com/callback",
        });
      }
      throw new Error(`Unexpected request: ${url}`);
    },
  });

  const started = await client.nativeAuth.start({
    redirectUri: "https://spa.example.com/callback",
    scopes: ["openid", "email"],
    turnstileToken: "turnstile-start",
  });
  await client.nativeAuth.requestEmailOtp({
    flowToken: started.flowToken,
    email: "person@example.com",
    turnstileToken: "turnstile-otp",
  });
  const result = await client.nativeAuth.verifyEmailOtp({
    flowToken: started.flowToken,
    email: "person@example.com",
    code: "123456",
    transaction: started.transaction,
  });

  assert.equal(result.code, "native-authorization-code");
  assert.equal(result.state, started.transaction.state);
  assert.equal(requests[0].body.code_challenge, started.transaction.codeChallenge);
  assert.equal(requests[0].body.turnstile_token, "turnstile-start");
  assert.equal(requests[1].body.turnstile_token, "turnstile-otp");
  assert.equal(requests[2].body.code, "123456");
});

test("popup mode accepts only the expected popup, origin, state, and issuer", async () => {
  const listeners = new Set();
  let authorizationUrl;
  const popupStorage = new Map();
  const popup = {
    closed: false,
    close() {
      this.closed = true;
    },
    sessionStorage: {
      setItem(key, value) {
        popupStorage.set(key, value);
      },
    },
    location: {
      replace(value) {
        authorizationUrl = value;
        const callback = new URL(value);
        setTimeout(() => {
          for (const listener of listeners) {
            listener({
              source: popup,
              origin: "https://spa.example.com",
              data: {
                type: "namoid:oidc:popup-callback",
                version: 1,
                state: callback.searchParams.get("state"),
                issuer,
                code: "popup-code",
                error: null,
                errorDescription: null,
              },
            });
          }
        }, 0);
      },
    },
  };
  const originalWindow = globalThis.window;
  globalThis.window = {
    location: {
      origin: "https://spa.example.com",
      href: "https://spa.example.com/",
      assign() {},
    },
    open: () => popup,
    addEventListener: (_name, listener) => listeners.add(listener),
    removeEventListener: (_name, listener) => listeners.delete(listener),
    setInterval,
    clearInterval,
    setTimeout,
    clearTimeout,
  };
  try {
    const client = createNamoIDClient({
      clientId,
      fetcher: async (request) => {
        const response = metadataResponse(new URL(request));
        if (response) return response;
        throw new Error(`Unexpected request: ${request}`);
      },
    });
    const result = await client.hostedAuth.popup({
      redirectUri: "https://spa.example.com/popup-callback",
      scopes: ["openid", "email"],
    });
    assert.equal(result.code, "popup-code");
    assert.equal(result.state, result.transaction.state);
    assert.equal(new URL(authorizationUrl).pathname, "/oauth/authorize");
    assert.equal(popup.closed, true);
    assert.equal(listeners.size, 0);
  } finally {
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
  }
});

test("popup callback bridge relays only the bounded OAuth result", async () => {
  let delivered;
  let closed = false;
  const originalWindow = globalThis.window;
  globalThis.window = {
    location: {
      origin: "https://spa.example.com",
      href:
        "https://spa.example.com/popup-callback?code=code&state=state&iss=" +
        encodeURIComponent(issuer),
    },
    opener: {
      closed: false,
      postMessage(payload, targetOrigin) {
        delivered = { payload, targetOrigin };
      },
    },
    close() {
      closed = true;
    },
  };
  try {
    relayHostedAuthPopupCallback();
    assert.equal(delivered.targetOrigin, "https://spa.example.com");
    assert.deepEqual(Object.keys(delivered.payload).sort(), [
      "code",
      "error",
      "errorDescription",
      "issuer",
      "state",
      "type",
      "version",
    ]);
    assert.equal(delivered.payload.code, "code");
    assert.equal(closed, false);
    await new Promise((resolve) => setTimeout(resolve, 550));
    assert.equal(closed, true);
  } finally {
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
  }
});

test("confidential code exchange uses the discovered form-encoded token endpoint", async () => {
  const requests = [];
  const client = createNamoIDClient({
    clientId,
    fetcher: async (request, init = {}) => {
      const url = new URL(request);
      const metadata = metadataResponse(url);
      if (metadata) return metadata;
      requests.push({ url, init });
      return Response.json({
        access_token: "access",
        token_type: "Bearer",
        id_token: "id-token",
      });
    },
  });

  await client.hostedAuth.exchangeCode({
    code: "authorization-code",
    redirectUri,
    codeVerifier: "verifier",
    clientSecret,
  });
  const [{ url, init }] = requests;
  assert.equal(url.pathname, "/v1/oauth/token");
  assert.match(init.headers.authorization, /^Basic /);
  assert.equal(
    Buffer.from(init.headers.authorization.slice("Basic ".length), "base64").toString(),
    `${clientId}:${clientSecret}`,
  );
  assert.equal(init.headers["content-type"], "application/x-www-form-urlencoded");
  const form = new URLSearchParams(init.body);
  assert.equal(form.get("grant_type"), "authorization_code");
  assert.equal(form.get("client_id"), clientId);
  assert.equal(form.get("code"), "authorization-code");
  assert.equal(form.get("redirect_uri"), redirectUri);
  assert.equal(form.get("code_verifier"), "verifier");
});

test("discovery rejects an issuer mix-up", async () => {
  const client = createNamoIDClient({
    clientId,
    fetcher: async (request) => {
      const url = new URL(request);
      if (url.pathname === "/v1/auth/config") return Response.json(config);
      if (url.pathname === "/.well-known/openid-configuration") {
        return Response.json({ ...discovery, issuer: "https://attacker.example.com" });
      }
      throw new Error(`Unexpected request: ${url}`);
    },
  });

  await assert.rejects(
    () => client.auth.getDiscovery(),
    (error) => error.code === "issuer_mismatch",
  );
});

test("discovery rejects endpoints outside the configured issuer", async () => {
  const client = createNamoIDClient({
    clientId,
    fetcher: async (request) => {
      const url = new URL(request);
      if (url.pathname === "/v1/auth/config") return Response.json(config);
      if (url.pathname === "/.well-known/openid-configuration") {
        return Response.json({
          ...discovery,
          token_endpoint: "https://attacker.example.com/token",
        });
      }
      throw new Error(`Unexpected request: ${url}`);
    },
  });

  await assert.rejects(
    () => client.auth.getDiscovery(),
    (error) => error.code === "invalid_discovery_endpoint",
  );
});

test("refresh, UserInfo, and revocation use discovered standard endpoints", async () => {
  const seen = [];
  const client = createNamoIDClient({
    clientId,
    fetcher: async (request, init = {}) => {
      const url = new URL(request);
      const metadata = metadataResponse(url);
      if (metadata) return metadata;
      seen.push({ url, init });
      if (url.pathname === "/v1/oauth/token") {
        return Response.json({ access_token: "rotated", token_type: "Bearer" });
      }
      if (url.pathname === "/v1/oauth/userinfo") {
        return Response.json({ sub: "user-1", email: "user@example.com" });
      }
      if (url.pathname === "/v1/oauth/revoke") return new Response(null, { status: 200 });
      throw new Error(`Unexpected request: ${url}`);
    },
  });

  await client.hostedAuth.refresh({ refreshToken: "refresh", clientSecret });
  const identity = await client.hostedAuth.userInfo("access");
  await client.hostedAuth.revoke({
    token: "refresh",
    tokenTypeHint: "refresh_token",
    clientSecret,
  });

  assert.equal(identity.sub, "user-1");
  assert.equal(new URLSearchParams(seen[0].init.body).get("grant_type"), "refresh_token");
  assert.equal(seen[1].init.headers.authorization, "Bearer access");
  assert.equal(seen[2].url.pathname, "/v1/oauth/revoke");
  assert.equal(new URLSearchParams(seen[2].init.body).get("token"), "refresh");
});

test("Next.js callback validates state, issuer, signed ID token, nonce, and UserInfo", async () => {
  const { privateKey, publicKey } = await generateKeyPair("RS256");
  const publicJwk = await exportJWK(publicKey);
  publicJwk.kid = "test-key";
  const fetcher = async (request, init = {}) => {
    const url = new URL(request);
    const metadata = metadataResponse(url);
    if (metadata) return metadata;
    if (url.pathname === "/v1/oauth/jwks.json") {
      return Response.json({ keys: [publicJwk] });
    }
    if (url.pathname === "/v1/oauth/userinfo") {
      assert.equal(init.headers.authorization, "Bearer access");
      return Response.json({ sub: "user-1", email: "user@example.com" });
    }
    throw new Error(`Unexpected request: ${url}`);
  };
  const client = createNamoIDNextClient({
    clientId,
    clientSecret,
    appBaseUrl: "https://app.example.com",
    fetcher: async (request, init = {}) => {
      const url = new URL(request);
      if (url.pathname === "/v1/oauth/token") {
        const transactionNonce = currentTransaction.nonce;
        const idToken = await new SignJWT({ nonce: transactionNonce })
          .setProtectedHeader({ alg: "RS256", kid: "test-key" })
          .setIssuer(issuer)
          .setAudience(clientId)
          .setSubject("user-1")
          .setIssuedAt()
          .setExpirationTime("5m")
          .sign(privateKey);
        return Response.json({
          access_token: "access",
          token_type: "Bearer",
          expires_in: 300,
          refresh_token: "refresh",
          id_token: idToken,
        });
      }
      return fetcher(request, init);
    },
  });
  const { authorizationUrl, transaction: currentTransaction } =
    await client.createTransaction({ returnTo: "/dashboard" });
  assert.equal(new URL(authorizationUrl).pathname, "/oauth/authorize");
  assert.equal(
    new URL(authorizationUrl).searchParams.get("scope"),
    "openid profile email offline_access",
  );

  const request = new Request(
    `${redirectUri}?code=code&state=${currentTransaction.state}&iss=${encodeURIComponent(issuer)}`,
    { headers: { cookie: transactionCookie(currentTransaction) } },
  );
  let successContext;
  const response = await client.callback(request, {
    onSuccess: (context) => {
      successContext = context;
      return Response.redirect("https://app.example.com/dashboard");
    },
  });

  assert.equal(response.status, 302);
  assert.equal(response.headers.get("location"), "https://app.example.com/dashboard");
  assert.equal(successContext.identity.email, "user@example.com");
  assert.equal(successContext.idTokenClaims.sub, "user-1");
  assert.match(response.headers.get("set-cookie"), /namoid_state=; Max-Age=0/);
});

test("Next.js logout revokes the app grant and uses RP-initiated logout", async () => {
  let revoked = false;
  const client = createNamoIDNextClient({
    clientId,
    clientSecret,
    appBaseUrl: "https://app.example.com",
    fetcher: async (request) => {
      const url = new URL(request);
      const metadata = metadataResponse(url);
      if (metadata) return metadata;
      if (url.pathname === "/v1/oauth/revoke") {
        revoked = true;
        return new Response(null, { status: 200 });
      }
      throw new Error(`Unexpected request: ${url}`);
    },
  });
  const response = await client.logout({
    refreshToken: "refresh",
    idTokenHint: "id-token",
  });
  const url = new URL(response.headers.get("location"));

  assert.equal(revoked, true);
  assert.equal(url.pathname, "/oauth/logout");
  assert.equal(url.searchParams.get("id_token_hint"), "id-token");
  assert.equal(url.searchParams.get("post_logout_redirect_uri"), "https://app.example.com/login");
  assert.equal(url.pathname === "/sign-out", false);
});

test("Next.js rejects external logout redirects and future transactions", async () => {
  const client = createNamoIDNextClient({
    clientId,
    clientSecret,
    appBaseUrl: "https://app.example.com",
    fetcher: async (request) => {
      const metadata = metadataResponse(new URL(request));
      if (metadata) return metadata;
      throw new Error(`Unexpected request: ${request}`);
    },
  });

  await assert.rejects(
    client.logout({
      clearHostedSession: false,
      postLogoutRedirectUri: "https://attacker.example/phish",
    }),
    (error) => error.code === "unsafe_redirect_uri",
  );

  const transaction = {
    state: "state",
    nonce: "nonce",
    codeVerifier: "v".repeat(64),
    redirectUri: "https://app.example.com/api/auth/callback/namoid",
    returnTo: "/",
    createdAt: Date.now() + 120_000,
  };
  assert.throws(
    () => client.readTransaction(new Request("https://app.example.com/callback", {
      headers: { cookie: transactionCookie(transaction) },
    })),
    (error) => error.code === "expired_oidc_transaction",
  );
});

function transactionCookie(transaction) {
  return [
    ["namoid_state", transaction.state],
    ["namoid_nonce", transaction.nonce],
    ["namoid_code_verifier", transaction.codeVerifier],
    ["namoid_redirect_uri", transaction.redirectUri],
    ["namoid_return_to", transaction.returnTo],
    ["namoid_created_at", String(transaction.createdAt)],
  ]
    .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
    .join("; ");
}
