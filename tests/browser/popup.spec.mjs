import { expect, test } from "@playwright/test";

const issuer = "https://tenant.sandbox.namoid.in";

async function mockMetadata(page) {
  await page.context().route("https://api.namoid.in/v1/auth/config**", (route) =>
    route.fulfill({
      json: {
        client_id: "namoid_client_test_browser",
        issuer,
        hosted_auth_base_url: issuer,
        hosted_auth_pages: {},
        access_mode: "open",
        waitlist_enabled: false,
        signin_methods: ["email_otp"],
        login_delivery_modes: ["redirect", "popup"],
        turnstile_site_key: null,
        native_auth_turnstile_actions: {},
        mfa_mode: "off",
        brand_logo_url: null,
        brand_primary_color: null,
        brand_accent_color: null,
        brand_dark_mode: false,
        brand_locale_default: "en",
        support_email: null,
        signup_tos_required: false,
        signup_tos_url: null,
        signup_privacy_url: null,
      },
    }),
  );
  await page.context().route(`${issuer}/.well-known/openid-configuration`, (route) =>
    route.fulfill({
      json: {
        issuer,
        authorization_endpoint: `${issuer}/oauth/authorize`,
        token_endpoint: `${issuer}/v1/oauth/token`,
        userinfo_endpoint: `${issuer}/v1/oauth/userinfo`,
        jwks_uri: `${issuer}/v1/oauth/jwks.json`,
        response_types_supported: ["code"],
        code_challenge_methods_supported: ["S256"],
        authorization_response_iss_parameter_supported: true,
      },
    }),
  );
}

async function mockAuthorize(page) {
  await page.context().route(`${issuer}/oauth/authorize**`, async (route) => {
    const url = new URL(route.request().url());
    const mode = url.searchParams.get("browser_test_mode") ?? "success";
    if (mode === "close") {
      await route.fulfill({
        contentType: "text/html",
        body: "<script>window.close()</script>",
      });
      return;
    }
    if (mode === "hang") {
      await route.fulfill({
        contentType: "text/html",
        body: "<!doctype html><title>Waiting for sign-in</title>",
      });
      return;
    }
    const callback = new URL(url.searchParams.get("redirect_uri"));
    callback.searchParams.set("state", mode === "wrong_state" ? "wrong" : url.searchParams.get("state"));
    callback.searchParams.set("iss", mode === "wrong_issuer" ? "https://attacker.example" : issuer);
    if (mode === "denied") {
      callback.searchParams.set("error", "access_denied");
      callback.searchParams.set("error_description", "The user cancelled sign-in");
    } else {
      callback.searchParams.set("code", "browser-code");
    }
    // Playwright WebKit cannot synthesize a redirect status through route.fulfill.
    // Navigating from the mocked issuer page exercises the same cross-origin
    // round trip consistently in Chromium, Firefox, and WebKit.
    await route.fulfill({
      contentType: "text/html",
      body: `<script>location.replace(${JSON.stringify(callback.toString())})</script>`,
    });
  });
}

test.beforeEach(async ({ page }) => {
  await mockMetadata(page);
  await mockAuthorize(page);
  await page.goto("/");
});

test("completes a same-origin callback bridge", async ({ page }) => {
  const result = await page.evaluate(() => window.runPopup());
  expect(result.code).toBe("browser-code");
  expect(result.state).toBe(result.transaction.state);
  expect(result.issuer).toBe(issuer);
});

test("keeps concurrent popup attempts isolated", async ({ page }) => {
  const results = await page.evaluate(() =>
    Promise.all([window.runPopup(), window.runPopup()]),
  );
  expect(results).toHaveLength(2);
  expect(results[0].code).toBe("browser-code");
  expect(results[1].code).toBe("browser-code");
  expect(results[0].state).not.toBe(results[1].state);
  expect(results[0].state).toBe(results[0].transaction.state);
  expect(results[1].state).toBe(results[1].transaction.state);
});

for (const [mode, errorCode] of [
  ["wrong_state", "invalid_oidc_state"],
  ["wrong_issuer", "issuer_mismatch"],
  ["denied", "access_denied"],
]) {
  test(`rejects ${mode}`, async ({ page }) => {
    const result = await page.evaluate(async (selectedMode) => {
      try {
        await window.runPopup(selectedMode);
        return null;
      } catch (error) {
        return error.code;
      }
    }, mode);
    expect(result).toBe(errorCode);
  });
}

test("reports a user-closed popup", async ({ page }) => {
  const result = await page.evaluate(async () => {
    try {
      await window.runPopup("close");
      return null;
    } catch (error) {
      return error.code;
    }
  });
  expect(result).toBe("popup_closed");
});

test("reports a popup timeout", async ({ page }) => {
  const result = await page.evaluate(async () => {
    try {
      await window.runPopup("hang");
      return null;
    } catch (error) {
      return error.code;
    }
  });
  expect(result).toBe("popup_timeout");
});

test("rejects a cross-origin callback before opening", async ({ page }) => {
  const result = await page.evaluate(async () => {
    try {
      await window.runCrossOriginPopup();
      return null;
    } catch (error) {
      return error.code;
    }
  });
  expect(result).toBe("popup_origin_mismatch");
});

test("reports a browser-blocked popup", async ({ page }) => {
  await page.evaluate(() => {
    window.open = () => null;
  });
  const result = await page.evaluate(async () => {
    try {
      await window.runPopup();
      return null;
    } catch (error) {
      return error.code;
    }
  });
  expect(result).toBe("popup_blocked");
});
