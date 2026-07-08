export type NamoIDEnvironment = "production" | "development" | "test" | string;

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
  project_id: string;
  environment_id: string;
  key_prefix: string;
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

export type HostedLoginMode = "signin" | "signup" | "waitlist";

export type HostedLoginUrlOptions = {
  mode?: HostedLoginMode;
  clientId: string;
  redirectUri: string;
  scope?: string | string[];
  state?: string;
  nonce?: string;
  codeChallenge?: string;
  codeChallengeMethod?: "S256" | "plain";
  resource?: string;
  loginHint?: string;
  prompt?: string;
  extraParams?: Record<string, string | number | boolean | null | undefined>;
};

export type NamoIDClientOptions = {
  publishableKey: string;
  apiBaseUrl?: string;
  hostedLoginBaseUrl?: string;
  fetcher?: typeof fetch;
};

export type NamoIDClient = {
  readonly publishableKey: string;
  readonly apiBaseUrl: string;
  readonly hostedLoginBaseUrl: string;
  auth: {
    getConfig: () => Promise<NamoIDAuthConfig>;
  };
  hostedLogin: {
    getUrl: (options: HostedLoginUrlOptions) => string;
    redirect: (options: HostedLoginUrlOptions) => void;
  };
  oidc: {
    discover: (issuer?: string) => Promise<OpenIdConfiguration>;
    exchangeCode: (options: ClientAuthorizationCodeExchangeOptions) => Promise<NamoIDTokenResponse>;
    refreshTokens: (options: ClientRefreshTokenOptions) => Promise<NamoIDTokenResponse>;
    revokeToken: (options: ClientRevokeTokenOptions) => Promise<void>;
    getUserInfo: (options: ClientUserInfoOptions) => Promise<NamoIDUserInfo>;
  };
};

export type OpenIdConfiguration = {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  userinfo_endpoint?: string;
  jwks_uri: string;
  revocation_endpoint?: string;
  end_session_endpoint?: string;
  response_types_supported?: string[];
  grant_types_supported?: string[];
  scopes_supported?: string[];
  token_endpoint_auth_methods_supported?: string[];
  code_challenge_methods_supported?: string[];
  [claim: string]: unknown;
};

export type OAuthTransaction = {
  state: string;
  nonce: string;
  codeVerifier: string;
  codeChallenge: string;
  codeChallengeMethod: "S256";
};

export type OAuthTokens = {
  access_token: string;
  token_type: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
  id_token?: string;
  [claim: string]: unknown;
};

export type NamoIDTokenResponse = OAuthTokens;

export type NamoIDUserInfo = {
  sub: string;
  name?: string;
  given_name?: string;
  family_name?: string;
  email?: string;
  email_verified?: boolean;
  phone_number?: string;
  phone_number_verified?: boolean;
  picture?: string;
  [claim: string]: unknown;
};

export type NamoIDJsonWebKey = JsonWebKey & {
  kid?: string;
  alg?: string;
  use?: string;
};

export type JsonWebKeySet = {
  keys: NamoIDJsonWebKey[];
};

export type JwtHeader = {
  alg?: string;
  kid?: string;
  typ?: string;
  [claim: string]: unknown;
};

export type JwtClaims = {
  iss?: string;
  sub?: string;
  aud?: string | string[];
  exp?: number;
  nbf?: number;
  iat?: number;
  nonce?: string;
  azp?: string;
  [claim: string]: unknown;
};

export type DecodedJwt<TClaims extends JwtClaims = JwtClaims> = {
  header: JwtHeader;
  claims: TClaims;
  signingInput: string;
  signature: Uint8Array;
};

export type DiscoverOptions = {
  issuer: string;
  fetcher?: typeof fetch;
};

export type TokenEndpointAuthMethod = "client_secret_basic" | "client_secret_post" | "none";

export type AuthorizationCodeExchangeOptions = {
  issuer?: string;
  tokenEndpoint?: string;
  clientId: string;
  clientSecret?: string;
  code: string;
  redirectUri: string;
  codeVerifier: string;
  tokenEndpointAuthMethod?: TokenEndpointAuthMethod;
  fetcher?: typeof fetch;
};

export type ClientAuthorizationCodeExchangeOptions = Omit<AuthorizationCodeExchangeOptions, "issuer" | "fetcher"> & {
  issuer?: string;
};

export type RefreshTokenOptions = {
  issuer?: string;
  tokenEndpoint?: string;
  clientId: string;
  clientSecret?: string;
  refreshToken: string;
  scope?: string | string[];
  tokenEndpointAuthMethod?: TokenEndpointAuthMethod;
  fetcher?: typeof fetch;
};

export type ClientRefreshTokenOptions = Omit<RefreshTokenOptions, "issuer" | "fetcher"> & {
  issuer?: string;
};

export type RevokeTokenOptions = {
  issuer?: string;
  revocationEndpoint?: string;
  clientId?: string;
  clientSecret?: string;
  token: string;
  tokenTypeHint?: "access_token" | "refresh_token" | string;
  tokenEndpointAuthMethod?: TokenEndpointAuthMethod;
  fetcher?: typeof fetch;
};

export type ClientRevokeTokenOptions = Omit<RevokeTokenOptions, "issuer" | "fetcher"> & {
  issuer?: string;
};

export type UserInfoOptions = {
  issuer?: string;
  userinfoEndpoint?: string;
  accessToken: string;
  fetcher?: typeof fetch;
};

export type ClientUserInfoOptions = Omit<UserInfoOptions, "issuer" | "fetcher"> & {
  issuer?: string;
};

export type VerifyIdTokenOptions = {
  issuer: string;
  audience: string;
  nonce?: string;
  jwks?: JsonWebKeySet;
  jwksUri?: string;
  clockToleranceSeconds?: number;
  fetcher?: typeof fetch;
};

export class NamoIDError extends Error {
  readonly status: number | null;
  readonly code: string | null;
  readonly detail: unknown;

  constructor(message: string, options: { status?: number | null; code?: string | null; detail?: unknown } = {}) {
    super(message);
    this.name = "NamoIDError";
    this.status = options.status ?? null;
    this.code = options.code ?? null;
    this.detail = options.detail;
  }
}

const DEFAULT_API_BASE_URL = "https://api.namoid.in";
const DEFAULT_SCOPE = "openid email profile";
const DEFAULT_CLOCK_TOLERANCE_SECONDS = 60;

export function createNamoIDClient(options: NamoIDClientOptions): NamoIDClient {
  if (!options.publishableKey) {
    throw new NamoIDError("publishableKey is required", { code: "missing_publishable_key" });
  }

  const apiBaseUrl = normalizeBaseUrl(options.apiBaseUrl ?? DEFAULT_API_BASE_URL);
  const hostedLoginBaseUrl = normalizeBaseUrl(options.hostedLoginBaseUrl ?? apiBaseUrl);
  const fetcher = options.fetcher ?? globalThis.fetch;

  if (!fetcher) {
    throw new NamoIDError("fetch is not available; pass a fetcher option", { code: "missing_fetch" });
  }

  const client: NamoIDClient = {
    publishableKey: options.publishableKey,
    apiBaseUrl,
    hostedLoginBaseUrl,
    auth: {
      getConfig: () =>
        request<NamoIDAuthConfig>({
          fetcher,
          apiBaseUrl,
          publishableKey: options.publishableKey,
          path: "/v1/auth/config",
        }),
    },
    hostedLogin: {
      getUrl: (urlOptions) => buildHostedLoginUrl(hostedLoginBaseUrl, urlOptions),
      redirect: (urlOptions) => {
        if (typeof window === "undefined") {
          throw new NamoIDError("hostedLogin.redirect can only run in a browser", {
            code: "browser_required",
          });
        }
        window.location.assign(buildHostedLoginUrl(hostedLoginBaseUrl, urlOptions));
      },
    },
    oidc: {
      discover: (issuer = hostedLoginBaseUrl) => discoverOpenIdConfiguration({ issuer, fetcher }),
      exchangeCode: (exchangeOptions) =>
        exchangeAuthorizationCode({
          ...exchangeOptions,
          issuer: exchangeOptions.issuer ?? hostedLoginBaseUrl,
          fetcher,
        }),
      refreshTokens: (refreshOptions) =>
        refreshTokens({
          ...refreshOptions,
          issuer: refreshOptions.issuer ?? hostedLoginBaseUrl,
          fetcher,
        }),
      revokeToken: (revokeOptions) =>
        revokeToken({
          ...revokeOptions,
          issuer: revokeOptions.issuer ?? hostedLoginBaseUrl,
          fetcher,
        }),
      getUserInfo: (userInfoOptions) =>
        getUserInfo({
          ...userInfoOptions,
          issuer: userInfoOptions.issuer ?? hostedLoginBaseUrl,
          fetcher,
        }),
    },
  };

  return client;
}

export function buildHostedLoginUrl(baseUrl: string, options: HostedLoginUrlOptions): string {
  const url = new URL("/oauth/authorize", normalizeBaseUrl(baseUrl));
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", options.clientId);
  url.searchParams.set("redirect_uri", options.redirectUri);
  url.searchParams.set("scope", normalizeScope(options.scope ?? DEFAULT_SCOPE));

  if (options.mode) url.searchParams.set("mode", options.mode);
  if (options.state) url.searchParams.set("state", options.state);
  if (options.nonce) url.searchParams.set("nonce", options.nonce);
  if (options.codeChallenge) url.searchParams.set("code_challenge", options.codeChallenge);
  if (options.codeChallengeMethod) url.searchParams.set("code_challenge_method", options.codeChallengeMethod);
  if (options.resource) url.searchParams.set("resource", options.resource);
  if (options.loginHint) url.searchParams.set("login_hint", options.loginHint);
  if (options.prompt) url.searchParams.set("prompt", options.prompt);

  for (const [key, value] of Object.entries(options.extraParams ?? {})) {
    if (value !== null && value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }

  return url.toString();
}

export async function createOAuthTransaction(): Promise<OAuthTransaction> {
  const codeVerifier = randomBase64Url(48);
  return {
    state: randomBase64Url(32),
    nonce: randomBase64Url(32),
    codeVerifier,
    codeChallenge: await pkceChallenge(codeVerifier),
    codeChallengeMethod: "S256",
  };
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

export async function discoverOpenIdConfiguration(options: DiscoverOptions): Promise<OpenIdConfiguration> {
  const fetcher = requireFetch(options.fetcher);
  const issuer = normalizeIssuer(options.issuer);
  const response = await fetcher(new URL("/.well-known/openid-configuration", issuer), {
    headers: { accept: "application/json" },
    cache: "no-store",
  });

  if (!response.ok) {
    const body = await safeJson(response);
    throw new NamoIDError(readErrorMessage(body) ?? `OIDC discovery failed with ${response.status}`, {
      status: response.status,
      code: readErrorCode(body) ?? "discovery_failed",
      detail: body,
    });
  }

  const discovered = (await response.json()) as OpenIdConfiguration;
  if (discovered.issuer && normalizeIssuer(discovered.issuer) !== issuer) {
    throw new NamoIDError("OIDC discovery issuer mismatch", {
      code: "issuer_mismatch",
      detail: { expected: issuer, actual: discovered.issuer },
    });
  }
  return discovered;
}

export async function exchangeAuthorizationCode(options: AuthorizationCodeExchangeOptions): Promise<NamoIDTokenResponse> {
  const fetcher = requireFetch(options.fetcher);
  const endpoint = await resolveTokenEndpoint(options, fetcher);
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: options.clientId,
    code: options.code,
    redirect_uri: options.redirectUri,
    code_verifier: options.codeVerifier,
  });

  return postTokenEndpoint({
    fetcher,
    endpoint,
    body,
    clientId: options.clientId,
    clientSecret: options.clientSecret,
    tokenEndpointAuthMethod: options.tokenEndpointAuthMethod,
  });
}

export async function refreshTokens(options: RefreshTokenOptions): Promise<NamoIDTokenResponse> {
  const fetcher = requireFetch(options.fetcher);
  const endpoint = await resolveTokenEndpoint(options, fetcher);
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: options.clientId,
    refresh_token: options.refreshToken,
  });
  if (options.scope) body.set("scope", normalizeScope(options.scope));

  return postTokenEndpoint({
    fetcher,
    endpoint,
    body,
    clientId: options.clientId,
    clientSecret: options.clientSecret,
    tokenEndpointAuthMethod: options.tokenEndpointAuthMethod,
  });
}

export async function revokeToken(options: RevokeTokenOptions): Promise<void> {
  const fetcher = requireFetch(options.fetcher);
  const endpoint = await resolveRevocationEndpoint(options, fetcher);
  const body = new URLSearchParams({ token: options.token });
  if (options.clientId) body.set("client_id", options.clientId);
  if (options.tokenTypeHint) body.set("token_type_hint", options.tokenTypeHint);

  await postForm({
    fetcher,
    endpoint,
    body,
    clientId: options.clientId,
    clientSecret: options.clientSecret,
    tokenEndpointAuthMethod: options.tokenEndpointAuthMethod,
    expectedJson: false,
  });
}

export async function getUserInfo(options: UserInfoOptions): Promise<NamoIDUserInfo> {
  const fetcher = requireFetch(options.fetcher);
  const endpoint = await resolveUserInfoEndpoint(options, fetcher);
  const response = await fetcher(endpoint, {
    headers: {
      accept: "application/json",
      authorization: `Bearer ${options.accessToken}`,
    },
    cache: "no-store",
  });

  if (!response.ok) {
    const body = await safeJson(response);
    throw new NamoIDError(readErrorMessage(body) ?? `UserInfo request failed with ${response.status}`, {
      status: response.status,
      code: readErrorCode(body) ?? "userinfo_failed",
      detail: body,
    });
  }

  return (await response.json()) as NamoIDUserInfo;
}

export function decodeJwt<TClaims extends JwtClaims = JwtClaims>(token: string): DecodedJwt<TClaims> {
  const parts = token.split(".");
  const headerPart = parts[0];
  const claimsPart = parts[1];
  const signaturePart = parts[2];
  if (!headerPart || !claimsPart || !signaturePart || parts.length !== 3) {
    throw new NamoIDError("Invalid JWT format", { code: "invalid_jwt" });
  }

  return {
    header: JSON.parse(new TextDecoder().decode(base64UrlDecode(headerPart))) as JwtHeader,
    claims: JSON.parse(new TextDecoder().decode(base64UrlDecode(claimsPart))) as TClaims,
    signingInput: `${headerPart}.${claimsPart}`,
    signature: base64UrlDecode(signaturePart),
  };
}

export function validateIdTokenClaims(claims: JwtClaims, options: VerifyIdTokenOptions): void {
  const now = Math.floor(Date.now() / 1000);
  const tolerance = options.clockToleranceSeconds ?? DEFAULT_CLOCK_TOLERANCE_SECONDS;
  if (claims.iss !== normalizeIssuer(options.issuer)) {
    throw new NamoIDError("ID token issuer mismatch", {
      code: "invalid_id_token_issuer",
      detail: { expected: normalizeIssuer(options.issuer), actual: claims.iss },
    });
  }
  if (!audienceMatches(claims.aud, options.audience)) {
    throw new NamoIDError("ID token audience mismatch", {
      code: "invalid_id_token_audience",
      detail: { expected: options.audience, actual: claims.aud },
    });
  }
  if (Array.isArray(claims.aud) && claims.aud.length > 1 && claims.azp !== options.audience) {
    throw new NamoIDError("ID token authorized party mismatch", {
      code: "invalid_id_token_azp",
      detail: { expected: options.audience, actual: claims.azp },
    });
  }
  if (options.nonce && claims.nonce !== options.nonce) {
    throw new NamoIDError("ID token nonce mismatch", { code: "invalid_id_token_nonce" });
  }
  if (typeof claims.exp !== "number" || claims.exp <= now - tolerance) {
    throw new NamoIDError("ID token expired", { code: "id_token_expired" });
  }
  if (typeof claims.nbf === "number" && claims.nbf > now + tolerance) {
    throw new NamoIDError("ID token not valid yet", { code: "id_token_not_yet_valid" });
  }
}

export async function verifyIdToken(options: VerifyIdTokenOptions & { idToken: string }): Promise<JwtClaims> {
  const decoded = decodeJwt(options.idToken);
  if (decoded.header.alg !== "RS256") {
    throw new NamoIDError("Unsupported ID token algorithm", {
      code: "unsupported_jwt_alg",
      detail: { alg: decoded.header.alg },
    });
  }
  if (!decoded.header.kid) {
    throw new NamoIDError("ID token is missing kid", { code: "missing_jwt_kid" });
  }

  const jwks = options.jwks ?? (await fetchJwks({ jwksUri: options.jwksUri, issuer: options.issuer, fetcher: options.fetcher }));
  const key = jwks.keys.find((candidate) => candidate.kid === decoded.header.kid);
  if (!key) {
    throw new NamoIDError("ID token signing key not found", {
      code: "unknown_jwt_kid",
      detail: { kid: decoded.header.kid },
    });
  }

  const cryptoKey = await getCrypto().subtle.importKey(
    "jwk",
    key,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"],
  );
  const valid = await getCrypto().subtle.verify(
    "RSASSA-PKCS1-v1_5",
    cryptoKey,
    toArrayBuffer(decoded.signature),
    new TextEncoder().encode(decoded.signingInput),
  );
  if (!valid) {
    throw new NamoIDError("ID token signature verification failed", { code: "invalid_jwt_signature" });
  }

  validateIdTokenClaims(decoded.claims, options);
  return decoded.claims;
}

export async function fetchJwks(options: {
  issuer?: string;
  jwksUri?: string;
  fetcher?: typeof fetch;
}): Promise<JsonWebKeySet> {
  const fetcher = requireFetch(options.fetcher);
  let uri = options.jwksUri;
  if (!uri) {
    if (!options.issuer) throw new NamoIDError("issuer or jwksUri is required", { code: "missing_jwks_uri" });
    uri = (await discoverOpenIdConfiguration({ issuer: options.issuer, fetcher })).jwks_uri;
  }
  const response = await fetcher(uri, { headers: { accept: "application/json" }, cache: "no-store" });
  if (!response.ok) {
    const body = await safeJson(response);
    throw new NamoIDError(readErrorMessage(body) ?? `JWKS request failed with ${response.status}`, {
      status: response.status,
      code: readErrorCode(body) ?? "jwks_failed",
      detail: body,
    });
  }
  return (await response.json()) as JsonWebKeySet;
}

async function request<T>(options: {
  fetcher: typeof fetch;
  apiBaseUrl: string;
  publishableKey: string;
  path: string;
}): Promise<T> {
  const response = await options.fetcher(new URL(options.path, options.apiBaseUrl), {
    headers: {
      "X-API-Key": options.publishableKey,
      accept: "application/json",
    },
  });

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

function normalizeBaseUrl(value: string): string {
  return value.endsWith("/") ? value : `${value}/`;
}

function normalizeIssuer(value: string): string {
  return value.replace(/\/+$/, "");
}

function normalizeScope(scope: string | string[]): string {
  return Array.isArray(scope) ? scope.join(" ") : scope;
}

function requireFetch(fetcher?: typeof fetch): typeof fetch {
  const resolved = fetcher ?? globalThis.fetch;
  if (!resolved) {
    throw new NamoIDError("fetch is not available; pass a fetcher option", { code: "missing_fetch" });
  }
  return resolved;
}

function getCrypto(): Crypto {
  if (!globalThis.crypto?.subtle) {
    throw new NamoIDError("Web Crypto is not available in this runtime", { code: "missing_crypto" });
  }
  return globalThis.crypto;
}

async function resolveTokenEndpoint(
  options: { issuer?: string; tokenEndpoint?: string },
  fetcher: typeof fetch,
): Promise<string> {
  if (options.tokenEndpoint) return options.tokenEndpoint;
  if (!options.issuer) throw new NamoIDError("issuer or tokenEndpoint is required", { code: "missing_token_endpoint" });
  return (await discoverOpenIdConfiguration({ issuer: options.issuer, fetcher })).token_endpoint;
}

async function resolveRevocationEndpoint(
  options: { issuer?: string; revocationEndpoint?: string },
  fetcher: typeof fetch,
): Promise<string> {
  if (options.revocationEndpoint) return options.revocationEndpoint;
  if (!options.issuer) throw new NamoIDError("issuer or revocationEndpoint is required", { code: "missing_revocation_endpoint" });
  const discovered = await discoverOpenIdConfiguration({ issuer: options.issuer, fetcher });
  if (!discovered.revocation_endpoint) {
    throw new NamoIDError("issuer does not advertise a revocation endpoint", { code: "missing_revocation_endpoint" });
  }
  return discovered.revocation_endpoint;
}

async function resolveUserInfoEndpoint(
  options: { issuer?: string; userinfoEndpoint?: string },
  fetcher: typeof fetch,
): Promise<string> {
  if (options.userinfoEndpoint) return options.userinfoEndpoint;
  if (!options.issuer) throw new NamoIDError("issuer or userinfoEndpoint is required", { code: "missing_userinfo_endpoint" });
  const discovered = await discoverOpenIdConfiguration({ issuer: options.issuer, fetcher });
  if (!discovered.userinfo_endpoint) {
    throw new NamoIDError("issuer does not advertise a userinfo endpoint", { code: "missing_userinfo_endpoint" });
  }
  return discovered.userinfo_endpoint;
}

async function postTokenEndpoint(options: {
  fetcher: typeof fetch;
  endpoint: string;
  body: URLSearchParams;
  clientId: string;
  clientSecret?: string;
  tokenEndpointAuthMethod?: TokenEndpointAuthMethod;
}): Promise<NamoIDTokenResponse> {
  return (await postForm({ ...options, expectedJson: true })) as NamoIDTokenResponse;
}

async function postForm(options: {
  fetcher: typeof fetch;
  endpoint: string;
  body: URLSearchParams;
  clientId?: string;
  clientSecret?: string;
  tokenEndpointAuthMethod?: TokenEndpointAuthMethod;
  expectedJson: boolean;
}): Promise<unknown> {
  const headers: Record<string, string> = {
    accept: "application/json",
    "content-type": "application/x-www-form-urlencoded",
  };
  const method = options.tokenEndpointAuthMethod ?? (options.clientSecret ? "client_secret_basic" : "none");
  if (method === "client_secret_basic") {
    if (!options.clientId || !options.clientSecret) {
      throw new NamoIDError("clientId and clientSecret are required for client_secret_basic", {
        code: "missing_client_auth",
      });
    }
    headers.authorization = `Basic ${basicAuth(options.clientId, options.clientSecret)}`;
  } else if (method === "client_secret_post") {
    if (!options.clientId || !options.clientSecret) {
      throw new NamoIDError("clientId and clientSecret are required for client_secret_post", {
        code: "missing_client_auth",
      });
    }
    options.body.set("client_id", options.clientId);
    options.body.set("client_secret", options.clientSecret);
  } else if (method === "none") {
    if (options.clientId && !options.body.has("client_id")) options.body.set("client_id", options.clientId);
  } else {
    throw new NamoIDError("Unsupported token endpoint auth method", {
      code: "unsupported_client_auth_method",
      detail: { method },
    });
  }

  const response = await options.fetcher(options.endpoint, {
    method: "POST",
    headers,
    body: options.body,
    cache: "no-store",
  });

  if (!response.ok) {
    const body = await safeJson(response);
    throw new NamoIDError(readErrorMessage(body) ?? `OIDC request failed with ${response.status}`, {
      status: response.status,
      code: readErrorCode(body) ?? "oidc_request_failed",
      detail: body,
    });
  }

  if (!options.expectedJson || response.status === 204) return null;
  return response.json();
}

function toArrayBuffer(values: Uint8Array): ArrayBuffer {
  return values.buffer.slice(values.byteOffset, values.byteOffset + values.byteLength) as ArrayBuffer;
}

function audienceMatches(audience: string | string[] | undefined, expected: string): boolean {
  if (typeof audience === "string") return audience === expected;
  if (Array.isArray(audience)) return audience.includes(expected);
  return false;
}

function basicAuth(clientId: string, clientSecret: string): string {
  const raw = `${encodeURIComponent(clientId)}:${encodeURIComponent(clientSecret)}`;
  return base64Encode(new TextEncoder().encode(raw));
}

function base64UrlEncode(values: Uint8Array): string {
  return base64Encode(values).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlDecode(value: string): Uint8Array {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  return base64Decode(base64);
}

function base64Encode(values: Uint8Array): string {
  let binary = "";
  for (const value of values) binary += String.fromCharCode(value);
  if (typeof btoa === "function") return btoa(binary);
  throw new NamoIDError("base64 encoding is not available in this runtime", { code: "missing_base64" });
}

function base64Decode(value: string): Uint8Array {
  if (typeof atob !== "function") {
    throw new NamoIDError("base64 decoding is not available in this runtime", { code: "missing_base64" });
  }
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

async function safeJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function readErrorMessage(body: unknown): string | null {
  if (typeof body === "object" && body !== null && "message" in body) {
    const value = (body as { message?: unknown }).message;
    return typeof value === "string" ? value : null;
  }
  if (typeof body === "object" && body !== null && "detail" in body) {
    const value = (body as { detail?: unknown }).detail;
    return typeof value === "string" ? value : null;
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
