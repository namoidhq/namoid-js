export type NamoIDSignInMethod =
  | "email_otp"
  | "phone_otp"
  | "password"
  | "google"
  | "github"
  | "linkedin"
  | "apple"
  | "passkey"
  | string;

export type NamoIDHostedAuthenticationMethod =
  | "email_otp"
  | "magic_link"
  | "password"
  | "phone_otp"
  | "passkey";

export type NamoIDSocialProvider = {
  name: string;
  display_name: string;
};

export type NamoIDSignInChoice = {
  id: string;
  display_name: string;
  category: "local" | "federated";
  delivery: "native_challenge" | "browser_redirect";
  authorization_parameter: "authentication_method" | "identity_provider" | null;
};

export type NamoIDAuthConfig = {
  client_id: string;
  issuer: string;
  hosted_auth_base_url: string;
  hosted_auth_pages: Partial<Record<"sign_in" | "sign_up" | "waitlist" | "account", string>>;
  access_mode: "closed" | "open" | "invite_only" | "domain_allowlist" | string;
  waitlist_enabled: boolean;
  signin_methods: NamoIDSignInMethod[];
  /** Configured providers that can be launched directly through Hosted Auth. */
  social_providers?: NamoIDSocialProvider[];
  /** Explicit native-versus-hosted ceremony contract. Optional for compatibility with older deployments. */
  sign_in_choices?: NamoIDSignInChoice[];
  login_delivery_modes: string[];
  turnstile_site_key: string | null;
  native_auth_turnstile_actions: Record<string, string>;
  mfa_mode: "off" | "optional" | "required" | string;
  brand_logo_url: string | null;
  brand_primary_color: string | null;
  brand_accent_color: string | null;
  brand_dark_mode: boolean;
  brand_locale_default: string;
  support_email: string | null;
  signup_tos_required: boolean;
  signup_tos_url: string | null;
  signup_privacy_url: string | null;
};

export type OIDCDiscoveryDocument = {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  userinfo_endpoint: string;
  jwks_uri: string;
  revocation_endpoint?: string;
  end_session_endpoint?: string;
  response_types_supported: string[];
  grant_types_supported?: string[];
  code_challenge_methods_supported?: string[];
  token_endpoint_auth_methods_supported?: string[];
  scopes_supported?: string[];
  authorization_response_iss_parameter_supported?: boolean;
};

export type OIDCTransaction = {
  state: string;
  nonce: string;
  codeVerifier: string;
  codeChallenge: string;
  codeChallengeMethod: "S256";
  redirectUri: string;
  createdAt: number;
};

export type StartAuthorizationOptions = {
  redirectUri: string;
  scopes?: string[];
  prompt?: "login";
  resource?: string;
  /** Selects a configured social provider while preserving the standard OIDC flow. */
  identityProvider?: string;
  /** Selects a configured hosted authentication ceremony without collecting credentials in the customer page. */
  authenticationMethod?: NamoIDHostedAuthenticationMethod;
  extraParams?: Record<string, string | number | boolean | null | undefined>;
};

export type AuthorizationUrlOptions = StartAuthorizationOptions & {
  state: string;
  nonce: string;
  codeChallenge: string;
  codeChallengeMethod?: "S256";
};

export type AuthorizationStart = {
  authorizationUrl: string;
  transaction: OIDCTransaction;
};

export type PopupAuthorizationOptions = StartAuthorizationOptions & {
  timeoutMs?: number;
  windowFeatures?: string;
};

export type PopupAuthorizationResult = {
  code: string;
  state: string;
  issuer: string;
  transaction: OIDCTransaction;
};

export type NativeAuthStartOptions = StartAuthorizationOptions & {
  turnstileToken?: string;
};

export type NativeAuthStartResult = {
  flowToken: string;
  nextStep: "email_otp";
  expiresIn: number;
  transaction: OIDCTransaction;
};

export type NativeEmailOtpRequestOptions = {
  flowToken: string;
  email: string;
  turnstileToken?: string;
};

export type NativeEmailOtpVerifyOptions = {
  flowToken: string;
  email: string;
  code: string;
  transaction: OIDCTransaction;
};

export type NativeAuthorizationResult = {
  code: string;
  state: string;
  issuer: string;
  redirectUri: string;
};

export type AuthorizationCodeExchangeOptions = {
  code: string;
  redirectUri: string;
  codeVerifier: string;
  clientSecret?: string;
};

export type RefreshTokenOptions = {
  refreshToken: string;
  clientSecret?: string;
  scopes?: string[];
  resource?: string;
};

export type RevokeTokenOptions = {
  token: string;
  tokenTypeHint?: "access_token" | "refresh_token";
  clientSecret?: string;
};

export type LogoutUrlOptions = {
  idTokenHint: string;
  postLogoutRedirectUri?: string;
  state?: string;
};

export type NamoIDTokenResponse = {
  access_token: string;
  token_type: string;
  expires_in?: number;
  refresh_token?: string;
  id_token?: string;
  scope?: string;
  [claim: string]: unknown;
};

export type NamoIDUserInfo = {
  sub: string;
  name?: string;
  email?: string;
  email_verified?: boolean;
  phone_number?: string;
  phone_number_verified?: boolean;
  [claim: string]: unknown;
};

export type NamoIDClientOptions = {
  clientId: string;
  fetcher?: typeof fetch;
};

export type GetNamoIDAuthConfigOptions = {
  clientId: string;
  fetcher?: typeof fetch;
};

export type NamoIDClient = {
  readonly clientId: string;
  auth: {
    getConfig: () => Promise<NamoIDAuthConfig>;
    getDiscovery: () => Promise<OIDCDiscoveryDocument>;
  };
  hostedAuth: {
    start: (options: StartAuthorizationOptions) => Promise<AuthorizationStart>;
    getUrl: (options: AuthorizationUrlOptions) => Promise<string>;
    redirect: (options: AuthorizationUrlOptions) => Promise<void>;
    popup: (options: PopupAuthorizationOptions) => Promise<PopupAuthorizationResult>;
    createTransaction: (redirectUri: string) => Promise<OIDCTransaction>;
    exchangeCode: (options: AuthorizationCodeExchangeOptions) => Promise<NamoIDTokenResponse>;
    refresh: (options: RefreshTokenOptions) => Promise<NamoIDTokenResponse>;
    userInfo: (accessToken: string) => Promise<NamoIDUserInfo>;
    revoke: (options: RevokeTokenOptions) => Promise<void>;
    getLogoutUrl: (options: LogoutUrlOptions) => Promise<string>;
  };
  nativeAuth: {
    start: (options: NativeAuthStartOptions) => Promise<NativeAuthStartResult>;
    requestEmailOtp: (options: NativeEmailOtpRequestOptions) => Promise<void>;
    verifyEmailOtp: (
      options: NativeEmailOtpVerifyOptions,
    ) => Promise<NativeAuthorizationResult>;
  };
};

export class NamoIDError extends Error {
  readonly status: number | null;
  readonly code: string | null;
  readonly detail: unknown;

  constructor(
    message: string,
    options: { status?: number | null; code?: string | null; detail?: unknown } = {},
  ) {
    super(message);
    this.name = "NamoIDError";
    this.status = options.status ?? null;
    this.code = options.code ?? null;
    this.detail = options.detail;
  }
}

const DEFAULT_API_BASE_URL = "https://api.namoid.in";
const DEFAULT_IDENTITY_SCOPES = ["openid", "profile", "email"];

export function createNamoIDClient(options: NamoIDClientOptions): NamoIDClient {
  if (!options.clientId) {
    throw new NamoIDError("clientId is required", { code: "missing_client_id" });
  }

  const fetcher = requireFetch(options.fetcher);
  let configPromise: Promise<NamoIDAuthConfig> | null = null;
  let discoveryPromise: Promise<OIDCDiscoveryDocument> | null = null;
  const getConfig = () => {
    configPromise ??= getNamoIDAuthConfig({ clientId: options.clientId, fetcher }).then(
      (config) => {
        if (config.client_id !== options.clientId) {
          throw new NamoIDError("Auth configuration Client ID mismatch", {
            code: "client_id_mismatch",
          });
        }
        return config;
      },
    );
    return configPromise;
  };
  const getDiscovery = async () => {
    if (!discoveryPromise) {
      discoveryPromise = getConfig().then((config) =>
        getOIDCDiscovery({ issuer: config.issuer, fetcher }),
      );
    }
    return discoveryPromise;
  };

  const createTransaction = (redirectUri: string) => createOIDCTransaction(redirectUri);
  const getUrl = async (urlOptions: AuthorizationUrlOptions) =>
    buildAuthorizationUrl(await getDiscovery(), options.clientId, urlOptions);
  const startAuthorization = async (
    startOptions: StartAuthorizationOptions,
  ): Promise<AuthorizationStart> => {
    const transaction = await createTransaction(startOptions.redirectUri);
    const authorizationUrl = await getUrl({
      ...startOptions,
      state: transaction.state,
      nonce: transaction.nonce,
      codeChallenge: transaction.codeChallenge,
      codeChallengeMethod: transaction.codeChallengeMethod,
    });
    return { authorizationUrl, transaction };
  };

  return {
    clientId: options.clientId,
    auth: { getConfig, getDiscovery },
    hostedAuth: {
      start: startAuthorization,
      getUrl,
      redirect: async (urlOptions) => {
        if (typeof window === "undefined") {
          throw new NamoIDError("hostedAuth.redirect can only run in a browser", {
            code: "browser_required",
          });
        }
        window.location.assign(await getUrl(urlOptions));
      },
      popup: async (popupOptions) => {
        if (typeof window === "undefined") {
          throw new NamoIDError("hostedAuth.popup can only run in a browser", {
            code: "browser_required",
          });
        }
        const callbackOrigin = new URL(popupOptions.redirectUri).origin;
        if (callbackOrigin !== window.location.origin) {
          throw new NamoIDError(
            "Popup callback must use the same origin as the application",
            { code: "popup_origin_mismatch" },
          );
        }
        // Store a random transport handle in the new window before leaving the
        // application origin. The callback uses it for a COOP-safe channel;
        // OAuth state remains the independent integrity check for the response.
        const channelName = popupChannelName(randomBase64Url(32));
        const popup = window.open(
          "about:blank",
          channelName,
          popupOptions.windowFeatures ?? "popup=yes,width=520,height=720,resizable=yes,scrollbars=yes",
        );
        if (!popup) {
          throw new NamoIDError("The browser blocked the sign-in popup", {
            code: "popup_blocked",
          });
        }
        try {
          popup.sessionStorage.setItem(POPUP_CHANNEL_STORAGE_KEY, channelName);
        } catch {
          popup.close();
          throw new NamoIDError(
            "Popup sign-in requires same-origin session storage",
            { code: "popup_storage_unavailable" },
          );
        }
        try {
          const started = await startAuthorization(popupOptions);
          const discovery = await getDiscovery();
          return await waitForPopupAuthorization({
            popup,
            authorizationUrl: started.authorizationUrl,
            transaction: started.transaction,
            issuer: discovery.issuer,
            callbackOrigin,
            channelName,
            timeoutMs: popupOptions.timeoutMs,
          });
        } catch (error) {
          popup.close();
          throw error;
        }
      },
      createTransaction,
      exchangeCode: async (exchangeOptions) =>
        exchangeAuthorizationCode({
          ...exchangeOptions,
          clientId: options.clientId,
          discovery: await getDiscovery(),
          fetcher,
        }),
      refresh: async (refreshOptions) =>
        refreshOIDCTokens({
          ...refreshOptions,
          clientId: options.clientId,
          discovery: await getDiscovery(),
          fetcher,
        }),
      userInfo: async (accessToken) =>
        fetchOIDCUserInfo({
          accessToken,
          discovery: await getDiscovery(),
          fetcher,
        }),
      revoke: async (revokeOptions) =>
        revokeOIDCToken({
          ...revokeOptions,
          clientId: options.clientId,
          discovery: await getDiscovery(),
          fetcher,
        }),
      getLogoutUrl: async (logoutOptions) =>
        buildOIDCLogoutUrl(await getDiscovery(), logoutOptions),
    },
    nativeAuth: {
      start: async (startOptions) => {
        const config = await getConfig();
        if (!config.login_delivery_modes.includes("native")) {
          throw new NamoIDError("Native authentication is not enabled for this application", {
            code: "native_auth_unavailable",
          });
        }
        const transaction = await createTransaction(startOptions.redirectUri);
        const result = await nativeAuthRequest<{
          flow_token: string;
          next_step: "email_otp";
          expires_in: number;
        }>({
          fetcher,
          path: "/v1/auth/native/start",
          body: {
            client_id: options.clientId,
            redirect_uri: startOptions.redirectUri,
            scope: normalizedScopes(startOptions.scopes).join(" "),
            state: transaction.state,
            nonce: transaction.nonce,
            code_challenge: transaction.codeChallenge,
            code_challenge_method: transaction.codeChallengeMethod,
            method: "email_otp",
            turnstile_token: startOptions.turnstileToken,
          },
        });
        return {
          flowToken: result.flow_token,
          nextStep: result.next_step,
          expiresIn: result.expires_in,
          transaction,
        };
      },
      requestEmailOtp: async (requestOptions) => {
        await nativeAuthRequest({
          fetcher,
          path: "/v1/auth/native/email-otp/request",
          body: {
            flow_token: requestOptions.flowToken,
            email: requestOptions.email,
            turnstile_token: requestOptions.turnstileToken,
          },
        });
      },
      verifyEmailOtp: async (verifyOptions) => {
        const result = await nativeAuthRequest<{
          code: string;
          state: string;
          issuer: string;
          redirect_uri: string;
        }>({
          fetcher,
          path: "/v1/auth/native/email-otp/verify",
          body: {
            flow_token: verifyOptions.flowToken,
            email: verifyOptions.email,
            code: verifyOptions.code,
          },
        });
        const discovery = await getDiscovery();
        if (result.state !== verifyOptions.transaction.state) {
          throw new NamoIDError("Native authorization state mismatch", {
            code: "invalid_oidc_state",
          });
        }
        if (normalizeIssuer(result.issuer) !== normalizeIssuer(discovery.issuer)) {
          throw new NamoIDError("Native authorization issuer mismatch", {
            code: "issuer_mismatch",
          });
        }
        if (result.redirect_uri !== verifyOptions.transaction.redirectUri) {
          throw new NamoIDError("Native authorization callback mismatch", {
            code: "redirect_uri_mismatch",
          });
        }
        return {
          code: result.code,
          state: result.state,
          issuer: result.issuer,
          redirectUri: result.redirect_uri,
        };
      },
    },
  };
}

const POPUP_CALLBACK_TYPE = "namoid:oidc:popup-callback";
const POPUP_CALLBACK_VERSION = 1;
const POPUP_CHANNEL_STORAGE_KEY = "namoid:oidc:popup-channel";

type PopupCallbackPayload = {
  type: typeof POPUP_CALLBACK_TYPE;
  version: typeof POPUP_CALLBACK_VERSION;
  state: string;
  issuer: string | null;
  code: string | null;
  error: string | null;
  errorDescription: string | null;
};

/**
 * Relay an OAuth callback from a customer-owned callback page to its same-origin opener.
 * The bridge sends only the authorization result; tokens and user data never cross windows.
 */
export function relayHostedAuthPopupCallback(
  callbackUrl: string = window.location.href,
): void {
  if (typeof window === "undefined") {
    throw new NamoIDError("Popup callback relay can only run in a browser", {
      code: "browser_required",
    });
  }
  const callback = new URL(callbackUrl, window.location.href);
  if (callback.origin !== window.location.origin) {
    throw new NamoIDError("Popup callback URL must use the current origin", {
      code: "popup_origin_mismatch",
    });
  }
  const state = callback.searchParams.get("state");
  if (!state) {
    throw new NamoIDError("Popup authorization state is missing", {
      code: "missing_oidc_state",
    });
  }
  const code = callback.searchParams.get("code");
  const error = callback.searchParams.get("error");
  if (!code && !error) {
    throw new NamoIDError("Popup authorization result is missing", {
      code: "missing_authorization_result",
    });
  }
  const payload: PopupCallbackPayload = {
    type: POPUP_CALLBACK_TYPE,
    version: POPUP_CALLBACK_VERSION,
    state,
    issuer: callback.searchParams.get("iss"),
    code,
    error,
    errorDescription: callback.searchParams.get("error_description"),
  };
  let delivered = false;
  let storedChannelName: string | null = null;
  try {
    storedChannelName = window.sessionStorage.getItem(POPUP_CHANNEL_STORAGE_KEY);
    window.sessionStorage.removeItem(POPUP_CHANNEL_STORAGE_KEY);
  } catch {
    // The opener postMessage fallback remains available without storage.
  }
  const channelName = validPopupChannelName(storedChannelName ?? "")
    ? storedChannelName
    : validPopupChannelName(window.name)
      ? window.name
      : null;
  if (channelName && typeof BroadcastChannel !== "undefined") {
    const channel = new BroadcastChannel(channelName);
    channel.postMessage(payload);
    globalThis.setTimeout(() => channel.close(), 500);
    delivered = true;
  }
  if (window.opener && !window.opener.closed) {
    window.opener.postMessage(payload, window.location.origin);
    delivered = true;
  }
  if (!delivered) {
    throw new NamoIDError("The sign-in result cannot reach the application", {
      code: "popup_receiver_unavailable",
    });
  }
  // BroadcastChannel survives COOP separation. Delay closure so every browser
  // can enqueue the same-origin result before this context disappears.
  const popupWindow = window;
  globalThis.setTimeout(() => popupWindow.close(), 500);
}

async function waitForPopupAuthorization(options: {
  popup: Window;
  authorizationUrl: string;
  transaction: OIDCTransaction;
  issuer: string;
  callbackOrigin: string;
  channelName: string;
  timeoutMs?: number;
}): Promise<PopupAuthorizationResult> {
  const timeoutMs = Math.min(Math.max(options.timeoutMs ?? 120_000, 1_000), 600_000);
  return new Promise((resolve, reject) => {
    let settled = false;
    let popupClosedAt: number | null = null;
    const channel =
      typeof BroadcastChannel !== "undefined"
        ? new BroadcastChannel(options.channelName)
        : null;
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      window.removeEventListener("message", onMessage);
      window.clearInterval(closedTimer);
      window.clearTimeout(timeoutTimer);
      channel?.close();
      if (!options.popup.closed) options.popup.close();
      callback();
    };
    const fail = (error: NamoIDError) => finish(() => reject(error));
    const acceptPayload = (value: unknown) => {
      if (!isPopupCallbackPayload(value)) return;
      const payload = value;
      if (payload.state !== options.transaction.state) {
        fail(new NamoIDError("Popup authorization state mismatch", {
          code: "invalid_oidc_state",
        }));
        return;
      }
      if (payload.issuer !== options.issuer) {
        fail(new NamoIDError("Popup authorization issuer mismatch", {
          code: "issuer_mismatch",
        }));
        return;
      }
      if (payload.error) {
        fail(new NamoIDError(payload.errorDescription ?? payload.error, {
          code: payload.error,
        }));
        return;
      }
      if (!payload.code) {
        fail(new NamoIDError("Popup authorization code is missing", {
          code: "missing_authorization_code",
        }));
        return;
      }
      finish(() => resolve({
        code: payload.code as string,
        state: payload.state,
        issuer: payload.issuer as string,
        transaction: options.transaction,
      }));
    };
    const onMessage = (event: MessageEvent<unknown>) => {
      if (event.source !== options.popup || event.origin !== options.callbackOrigin) return;
      acceptPayload(event.data);
    };
    window.addEventListener("message", onMessage);
    if (channel) channel.onmessage = (event) => acceptPayload(event.data);
    const closedTimer = window.setInterval(() => {
      if (!options.popup.closed) {
        popupClosedAt = null;
        return;
      }
      // WebKit can report `closed` before a BroadcastChannel callback that is
      // already queued reaches this window. Give that bounded message a short
      // chance to win before treating the close as user cancellation.
      popupClosedAt ??= Date.now();
      if (Date.now() - popupClosedAt >= 500) {
        fail(new NamoIDError("The sign-in popup was closed before completion", {
          code: "popup_closed",
        }));
      }
    }, 100);
    const timeoutTimer = window.setTimeout(() => {
      fail(new NamoIDError("The sign-in popup timed out", { code: "popup_timeout" }));
    }, timeoutMs);
    try {
      options.popup.location.replace(options.authorizationUrl);
    } catch {
      fail(new NamoIDError("The sign-in popup could not be opened", {
        code: "popup_navigation_failed",
      }));
    }
  });
}

function popupChannelName(randomValue: string): string {
  return `namoid:oidc:popup:${randomValue}`;
}

function validPopupChannelName(value: string): boolean {
  return /^namoid:oidc:popup:[A-Za-z0-9_-]{32,}$/.test(value);
}

function isPopupCallbackPayload(value: unknown): value is PopupCallbackPayload {
  if (typeof value !== "object" || value === null) return false;
  const payload = value as Partial<PopupCallbackPayload>;
  return (
    payload.type === POPUP_CALLBACK_TYPE &&
    payload.version === POPUP_CALLBACK_VERSION &&
    typeof payload.state === "string" &&
    (typeof payload.issuer === "string" || payload.issuer === null) &&
    (typeof payload.code === "string" || payload.code === null) &&
    (typeof payload.error === "string" || payload.error === null) &&
    (typeof payload.errorDescription === "string" || payload.errorDescription === null)
  );
}

export async function getNamoIDAuthConfig(
  options: GetNamoIDAuthConfigOptions,
): Promise<NamoIDAuthConfig> {
  if (!options.clientId) {
    throw new NamoIDError("clientId is required", { code: "missing_client_id" });
  }
  return request<NamoIDAuthConfig>({
    fetcher: requireFetch(options.fetcher),
    clientId: options.clientId,
    path: "/v1/auth/config",
  });
}

export async function getOIDCDiscovery(options: {
  issuer: string;
  fetcher?: typeof fetch;
}): Promise<OIDCDiscoveryDocument> {
  const issuer = normalizeIssuer(options.issuer);
  const response = await requireFetch(options.fetcher)(
    new URL("/.well-known/openid-configuration", `${issuer}/`),
    { headers: { accept: "application/json" }, cache: "no-store" },
  );
  if (!response.ok) {
    const body = await safeJson(response);
    throw new NamoIDError(readErrorMessage(body) ?? `OIDC discovery failed with ${response.status}`, {
      status: response.status,
      code: readErrorCode(body) ?? "oidc_discovery_failed",
      detail: body,
    });
  }
  const discovery = (await response.json()) as OIDCDiscoveryDocument;
  if (normalizeIssuer(discovery.issuer) !== issuer) {
    throw new NamoIDError("OIDC discovery issuer does not match the configured issuer", {
      code: "issuer_mismatch",
    });
  }
  if (
    !discovery.authorization_endpoint ||
    !discovery.token_endpoint ||
    !discovery.userinfo_endpoint ||
    !discovery.jwks_uri
  ) {
    throw new NamoIDError("OIDC discovery document is incomplete", {
      code: "invalid_discovery_document",
    });
  }
  for (const endpoint of [
    discovery.authorization_endpoint,
    discovery.token_endpoint,
    discovery.userinfo_endpoint,
    discovery.jwks_uri,
    discovery.revocation_endpoint,
    discovery.end_session_endpoint,
  ]) {
    if (endpoint) assertTrustedIssuerEndpoint(issuer, endpoint);
  }
  if (!discovery.code_challenge_methods_supported?.includes("S256")) {
    throw new NamoIDError("The issuer does not advertise PKCE S256", {
      code: "pkce_s256_unavailable",
    });
  }
  return discovery;
}

export function buildAuthorizationUrl(
  discovery: OIDCDiscoveryDocument,
  clientId: string,
  options: AuthorizationUrlOptions,
): string {
  const url = new URL(discovery.authorization_endpoint);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", options.redirectUri);
  url.searchParams.set("scope", normalizedScopes(options.scopes).join(" "));
  url.searchParams.set("state", options.state);
  url.searchParams.set("nonce", options.nonce);
  url.searchParams.set("code_challenge", options.codeChallenge);
  url.searchParams.set("code_challenge_method", options.codeChallengeMethod ?? "S256");
  if (options.prompt) url.searchParams.set("prompt", options.prompt);
  if (options.resource) url.searchParams.set("resource", options.resource);
  if (options.identityProvider) {
    url.searchParams.set("identity_provider", options.identityProvider);
  }
  if (options.authenticationMethod) {
    url.searchParams.set("authentication_method", options.authenticationMethod);
  }
  for (const [key, value] of Object.entries(options.extraParams ?? {})) {
    if (RESERVED_AUTHORIZATION_PARAMS.has(key)) continue;
    if (value !== null && value !== undefined) url.searchParams.set(key, String(value));
  }
  return url.toString();
}

export async function createOIDCTransaction(redirectUri: string): Promise<OIDCTransaction> {
  if (!redirectUri) {
    throw new NamoIDError("redirectUri is required", { code: "missing_redirect_uri" });
  }
  const codeVerifier = randomBase64Url(48);
  return {
    state: randomBase64Url(32),
    nonce: randomBase64Url(32),
    codeVerifier,
    codeChallenge: await pkceChallenge(codeVerifier),
    codeChallengeMethod: "S256",
    redirectUri,
    createdAt: Date.now(),
  };
}

export async function exchangeAuthorizationCode(options: {
  discovery: OIDCDiscoveryDocument;
  code: string;
  redirectUri: string;
  codeVerifier: string;
  clientId: string;
  clientSecret?: string;
  fetcher?: typeof fetch;
}): Promise<NamoIDTokenResponse> {
  return tokenRequest({
    discovery: options.discovery,
    clientId: options.clientId,
    clientSecret: options.clientSecret,
    fetcher: options.fetcher,
    form: {
      grant_type: "authorization_code",
      code: options.code,
      redirect_uri: options.redirectUri,
      code_verifier: options.codeVerifier,
    },
  });
}

export async function refreshOIDCTokens(options: {
  discovery: OIDCDiscoveryDocument;
  refreshToken: string;
  clientId: string;
  clientSecret?: string;
  scopes?: string[];
  resource?: string;
  fetcher?: typeof fetch;
}): Promise<NamoIDTokenResponse> {
  const form: Record<string, string> = {
    grant_type: "refresh_token",
    refresh_token: options.refreshToken,
  };
  if (options.scopes?.length) form.scope = normalizedScopes(options.scopes).join(" ");
  if (options.resource) form.resource = options.resource;
  return tokenRequest({
    discovery: options.discovery,
    clientId: options.clientId,
    clientSecret: options.clientSecret,
    fetcher: options.fetcher,
    form,
  });
}

export async function fetchOIDCUserInfo(options: {
  discovery: OIDCDiscoveryDocument;
  accessToken: string;
  fetcher?: typeof fetch;
}): Promise<NamoIDUserInfo> {
  const response = await requireFetch(options.fetcher)(options.discovery.userinfo_endpoint, {
    headers: { accept: "application/json", authorization: `Bearer ${options.accessToken}` },
    cache: "no-store",
  });
  if (!response.ok) {
    const body = await safeJson(response);
    throw new NamoIDError(readErrorMessage(body) ?? `UserInfo failed with ${response.status}`, {
      status: response.status,
      code: readErrorCode(body) ?? "userinfo_failed",
      detail: body,
    });
  }
  return (await response.json()) as NamoIDUserInfo;
}

export async function revokeOIDCToken(options: {
  discovery: OIDCDiscoveryDocument;
  token: string;
  tokenTypeHint?: "access_token" | "refresh_token";
  clientId: string;
  clientSecret?: string;
  fetcher?: typeof fetch;
}): Promise<void> {
  if (!options.discovery.revocation_endpoint) {
    throw new NamoIDError("The issuer does not advertise token revocation", {
      code: "revocation_unavailable",
    });
  }
  const form = new URLSearchParams({ token: options.token, client_id: options.clientId });
  if (options.tokenTypeHint) form.set("token_type_hint", options.tokenTypeHint);
  const headers = tokenClientHeaders(options.clientId, options.clientSecret);
  const response = await requireFetch(options.fetcher)(options.discovery.revocation_endpoint, {
    method: "POST",
    headers,
    body: form,
    cache: "no-store",
  });
  if (!response.ok) {
    const body = await safeJson(response);
    throw new NamoIDError(readErrorMessage(body) ?? `Token revocation failed with ${response.status}`, {
      status: response.status,
      code: readErrorCode(body) ?? "token_revocation_failed",
      detail: body,
    });
  }
}

export function buildOIDCLogoutUrl(
  discovery: OIDCDiscoveryDocument,
  options: LogoutUrlOptions,
): string {
  if (!discovery.end_session_endpoint) {
    throw new NamoIDError("The issuer does not advertise RP-initiated logout", {
      code: "logout_unavailable",
    });
  }
  const url = new URL(discovery.end_session_endpoint);
  url.searchParams.set("id_token_hint", options.idTokenHint);
  if (options.postLogoutRedirectUri) {
    url.searchParams.set("post_logout_redirect_uri", options.postLogoutRedirectUri);
  }
  if (options.state) url.searchParams.set("state", options.state);
  return url.toString();
}

export function randomBase64Url(bytes = 32): string {
  const values = new Uint8Array(bytes);
  getCrypto().getRandomValues(values);
  return base64UrlEncode(values);
}

export async function pkceChallenge(verifier: string): Promise<string> {
  const digest = await getCrypto().subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return base64UrlEncode(new Uint8Array(digest));
}

async function tokenRequest(options: {
  discovery: OIDCDiscoveryDocument;
  clientId: string;
  clientSecret?: string;
  form: Record<string, string>;
  fetcher?: typeof fetch;
}): Promise<NamoIDTokenResponse> {
  const form = new URLSearchParams(options.form);
  form.set("client_id", options.clientId);
  const response = await requireFetch(options.fetcher)(options.discovery.token_endpoint, {
    method: "POST",
    headers: tokenClientHeaders(options.clientId, options.clientSecret),
    body: form,
    cache: "no-store",
  });
  if (!response.ok) {
    const body = await safeJson(response);
    throw new NamoIDError(readErrorMessage(body) ?? `Token request failed with ${response.status}`, {
      status: response.status,
      code: readErrorCode(body) ?? "token_request_failed",
      detail: body,
    });
  }
  return (await response.json()) as NamoIDTokenResponse;
}

function tokenClientHeaders(clientId: string, clientSecret?: string): Record<string, string> {
  const headers: Record<string, string> = {
    accept: "application/json",
    "content-type": "application/x-www-form-urlencoded",
  };
  if (clientSecret) {
    headers.authorization = `Basic ${base64EncodeText(`${clientId}:${clientSecret}`)}`;
  }
  return headers;
}

async function request<T>(options: {
  fetcher: typeof fetch;
  clientId: string;
  path: string;
}): Promise<T> {
  const url = new URL(options.path, DEFAULT_API_BASE_URL);
  url.searchParams.set("client_id", options.clientId);
  const response = await options.fetcher(url, { headers: { accept: "application/json" } });
  if (!response.ok) {
    const body = await safeJson(response);
    throw new NamoIDError(readErrorMessage(body) ?? `NamoID request failed with ${response.status}`, {
      status: response.status,
      code: readErrorCode(body),
      detail: body,
    });
  }
  return (await response.json()) as T;
}

async function nativeAuthRequest<T = unknown>(options: {
  fetcher: typeof fetch;
  path: string;
  body: Record<string, unknown>;
}): Promise<T> {
  const response = await options.fetcher(new URL(options.path, DEFAULT_API_BASE_URL), {
    method: "POST",
    headers: { accept: "application/json", "content-type": "application/json" },
    body: JSON.stringify(options.body),
    cache: "no-store",
  });
  if (!response.ok) {
    const body = await safeJson(response);
    throw new NamoIDError(
      readErrorMessage(body) ?? `Native authentication failed with ${response.status}`,
      {
        status: response.status,
        code: readErrorCode(body) ?? "native_auth_failed",
        detail: body,
      },
    );
  }
  return (await response.json()) as T;
}

function normalizedScopes(scopes?: string[]): string[] {
  const values = scopes?.length ? scopes : DEFAULT_IDENTITY_SCOPES;
  return Array.from(new Set(["openid", ...values.filter(Boolean)]));
}

function normalizeIssuer(value: string): string {
  return value.replace(/\/+$/, "");
}

function assertTrustedIssuerEndpoint(issuer: string, endpoint: string): void {
  const issuerUrl = new URL(issuer);
  const endpointUrl = new URL(endpoint);
  const localDevelopment =
    issuerUrl.hostname === "localhost" || issuerUrl.hostname.endsWith(".localhost");
  if ((!localDevelopment && endpointUrl.protocol !== "https:") || endpointUrl.origin !== issuerUrl.origin) {
    throw new NamoIDError("OIDC discovery contains an untrusted endpoint", {
      code: "invalid_discovery_endpoint",
    });
  }
}

function requireFetch(fetcher?: typeof fetch): typeof fetch {
  if (fetcher) return fetcher;
  if (!globalThis.fetch) {
    throw new NamoIDError("fetch is not available; pass a fetcher option", {
      code: "missing_fetch",
    });
  }
  // Browser-native fetch requires its receiver. Returning the method unbound
  // causes an "Illegal invocation" before any request reaches NamoID.
  return globalThis.fetch.bind(globalThis);
}

function getCrypto(): Crypto {
  if (!globalThis.crypto?.subtle) {
    throw new NamoIDError("Web Crypto is not available in this runtime", {
      code: "missing_crypto",
    });
  }
  return globalThis.crypto;
}

function base64UrlEncode(values: Uint8Array): string {
  let binary = "";
  for (const value of values) binary += String.fromCharCode(value);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64EncodeText(value: string): string {
  const encoded = base64UrlEncode(new TextEncoder().encode(value))
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  return encoded.padEnd(Math.ceil(encoded.length / 4) * 4, "=");
}

async function safeJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function readErrorMessage(body: unknown): string | null {
  if (typeof body === "object" && body !== null && "error_description" in body) {
    const value = (body as { error_description?: unknown }).error_description;
    if (typeof value === "string") return value;
  }
  if (typeof body === "object" && body !== null && "message" in body) {
    const value = (body as { message?: unknown }).message;
    if (typeof value === "string") return value;
  }
  if (typeof body === "object" && body !== null && "detail" in body) {
    const value = (body as { detail?: unknown }).detail;
    if (typeof value === "string") return value;
  }
  return null;
}

function readErrorCode(body: unknown): string | null {
  if (typeof body === "object" && body !== null && "error" in body) {
    const value = (body as { error?: unknown }).error;
    return typeof value === "string" ? value : null;
  }
  return null;
}

const RESERVED_AUTHORIZATION_PARAMS = new Set([
  "response_type",
  "client_id",
  "redirect_uri",
  "scope",
  "state",
  "nonce",
  "code_challenge",
  "code_challenge_method",
  "prompt",
  "resource",
  "identity_provider",
  "authentication_method",
]);
