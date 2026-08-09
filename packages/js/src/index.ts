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

export type NamoIDAuthConfig = {
  client_id: string;
  issuer: string;
  hosted_auth_base_url: string;
  hosted_auth_pages: Partial<Record<"sign_in" | "sign_up" | "waitlist" | "account", string>>;
  access_mode: "closed" | "open" | "invite_only" | "domain_allowlist" | string;
  waitlist_enabled: boolean;
  signin_methods: NamoIDSignInMethod[];
  mfa_mode: "off" | "optional" | "required" | string;
  brand_logo_url: string | null;
  brand_primary_color: string | null;
  brand_accent_color: string | null;
  brand_dark_mode: boolean;
  brand_locale_default: string;
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
    createTransaction: (redirectUri: string) => Promise<OIDCTransaction>;
    exchangeCode: (options: AuthorizationCodeExchangeOptions) => Promise<NamoIDTokenResponse>;
    refresh: (options: RefreshTokenOptions) => Promise<NamoIDTokenResponse>;
    userInfo: (accessToken: string) => Promise<NamoIDUserInfo>;
    revoke: (options: RevokeTokenOptions) => Promise<void>;
    getLogoutUrl: (options: LogoutUrlOptions) => Promise<string>;
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
const DEFAULT_SCOPES = ["openid", "email"];

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

  return {
    clientId: options.clientId,
    auth: { getConfig, getDiscovery },
    hostedAuth: {
      start: async (startOptions) => {
        const transaction = await createTransaction(startOptions.redirectUri);
        const authorizationUrl = await getUrl({
          ...startOptions,
          state: transaction.state,
          nonce: transaction.nonce,
          codeChallenge: transaction.codeChallenge,
          codeChallengeMethod: transaction.codeChallengeMethod,
        });
        return { authorizationUrl, transaction };
      },
      getUrl,
      redirect: async (urlOptions) => {
        if (typeof window === "undefined") {
          throw new NamoIDError("hostedAuth.redirect can only run in a browser", {
            code: "browser_required",
          });
        }
        window.location.assign(await getUrl(urlOptions));
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
  };
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

function normalizedScopes(scopes?: string[]): string[] {
  const values = scopes?.length ? scopes : DEFAULT_SCOPES;
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
  const resolved = fetcher ?? globalThis.fetch;
  if (!resolved) {
    throw new NamoIDError("fetch is not available; pass a fetcher option", {
      code: "missing_fetch",
    });
  }
  return resolved;
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
]);
