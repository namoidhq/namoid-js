import {
  buildHostedLoginUrl,
  createOAuthTransaction,
  decodeJwt,
  discoverOpenIdConfiguration,
  exchangeAuthorizationCode,
  NamoIDError,
  revokeToken,
  type HostedLoginMode,
  type JwtClaims,
  type NamoIDTokenResponse,
  type OAuthTransaction,
  type OpenIdConfiguration,
  type TokenEndpointAuthMethod,
  verifyIdToken,
} from "@namoidhq/js";

export type NamoIDNextOptions = {
  issuer: string;
  clientId: string;
  clientSecret?: string;
  appBaseUrl: string;
  redirectPath?: string;
  postLoginRedirectPath?: string;
  postLogoutRedirectPath?: string;
  scope?: string | string[];
  tokenEndpoint?: string;
  tokenEndpointAuthMethod?: TokenEndpointAuthMethod;
  cookiePrefix?: string;
  transactionMaxAgeSeconds?: number;
  fetcher?: typeof fetch;
};

export type StartLoginOptions = {
  mode?: HostedLoginMode;
  redirectUri?: string;
  returnTo?: string;
  scope?: string | string[];
  resource?: string;
  loginHint?: string;
  prompt?: string;
  extraParams?: Record<string, string | number | boolean | null | undefined>;
};

export type CallbackContext = {
  request: Request;
  tokens: NamoIDTokenResponse;
  idTokenClaims: JwtClaims;
  transaction: StoredTransaction;
  discovery: OpenIdConfiguration | null;
};

export type CallbackOptions = {
  onSuccess?: (context: CallbackContext) => Response | Promise<Response>;
  onError?: (error: unknown, request: Request) => Response | Promise<Response>;
};

export type LogoutOptions = {
  idTokenHint?: string;
  postLogoutRedirectUri?: string;
};

export type StoredTransaction = OAuthTransaction & {
  returnTo: string;
  createdAt: number;
};

export type NamoIDNextClient = {
  login: (options?: StartLoginOptions) => Promise<Response>;
  callback: (request: Request, options?: CallbackOptions) => Promise<Response>;
  logout: (options?: LogoutOptions) => Promise<Response>;
  createTransaction: (options?: StartLoginOptions) => Promise<{ authorizeUrl: string; transaction: StoredTransaction }>;
  readTransaction: (request: Request) => StoredTransaction;
  clearTransactionCookies: (headers: Headers) => void;
};

const DEFAULT_SCOPE = "openid profile email offline_access";
const DEFAULT_REDIRECT_PATH = "/api/auth/callback/namoid";
const DEFAULT_POST_LOGIN_REDIRECT_PATH = "/";
const DEFAULT_POST_LOGOUT_REDIRECT_PATH = "/login";
const DEFAULT_COOKIE_PREFIX = "namoid";
const DEFAULT_TRANSACTION_MAX_AGE_SECONDS = 10 * 60;

export function createNamoIDNextClient(options: NamoIDNextOptions): NamoIDNextClient {
  assertRequired(options.issuer, "issuer");
  assertRequired(options.clientId, "clientId");
  assertRequired(options.appBaseUrl, "appBaseUrl");

  const issuer = trimTrailingSlash(options.issuer);
  const appBaseUrl = trimTrailingSlash(options.appBaseUrl);
  const redirectPath = options.redirectPath ?? DEFAULT_REDIRECT_PATH;
  const postLoginRedirectPath = options.postLoginRedirectPath ?? DEFAULT_POST_LOGIN_REDIRECT_PATH;
  const postLogoutRedirectPath = options.postLogoutRedirectPath ?? DEFAULT_POST_LOGOUT_REDIRECT_PATH;
  const cookiePrefix = options.cookiePrefix ?? DEFAULT_COOKIE_PREFIX;
  const transactionMaxAgeSeconds = options.transactionMaxAgeSeconds ?? DEFAULT_TRANSACTION_MAX_AGE_SECONDS;
  const fetcher = options.fetcher ?? globalThis.fetch;

  if (!fetcher) {
    throw new NamoIDError("fetch is not available; pass a fetcher option", { code: "missing_fetch" });
  }

  const client: NamoIDNextClient = {
    login: async (loginOptions = {}) => {
      const { authorizeUrl, transaction } = await createTransaction(loginOptions);
      const response = redirectResponse(authorizeUrl);
      writeTransactionCookies(response.headers, cookiePrefix, transaction, {
        secure: appBaseUrl.startsWith("https://"),
        maxAge: transactionMaxAgeSeconds,
      });
      return response;
    },
    callback: async (request, callbackOptions = {}) => {
      try {
        const url = new URL(request.url);
        const oauthError = url.searchParams.get("error");
        if (oauthError) {
          throw new NamoIDError(oauthError, {
            code: oauthError,
            detail: {
              error_description: url.searchParams.get("error_description"),
            },
          });
        }

        const code = url.searchParams.get("code");
        const returnedState = url.searchParams.get("state");
        const transaction = readTransaction(request);
        if (!code || !returnedState || returnedState !== transaction.state) {
          throw new NamoIDError("Invalid OAuth state", { code: "invalid_oauth_state" });
        }

        const discovery = options.tokenEndpoint ? null : await discoverOpenIdConfiguration({ issuer, fetcher });
        const tokens = await exchangeAuthorizationCode({
          issuer,
          tokenEndpoint: options.tokenEndpoint ?? discovery?.token_endpoint,
          clientId: options.clientId,
          clientSecret: options.clientSecret,
          code,
          redirectUri: absoluteUrl(appBaseUrl, redirectPath),
          codeVerifier: transaction.codeVerifier,
          tokenEndpointAuthMethod: options.tokenEndpointAuthMethod,
          fetcher,
        });
        if (!tokens.id_token) {
          throw new NamoIDError("NamoID callback did not include an ID token", { code: "missing_id_token" });
        }

        const idTokenClaims = await verifyIdToken({
          idToken: tokens.id_token,
          issuer,
          audience: options.clientId,
          nonce: transaction.nonce,
          jwksUri: discovery?.jwks_uri,
          fetcher,
        });

        const success = callbackOptions.onSuccess
          ? await callbackOptions.onSuccess({ request, tokens, idTokenClaims, transaction, discovery })
          : redirectResponse(absoluteUrl(appBaseUrl, transaction.returnTo));
        clearTransactionCookies(success.headers);
        return success;
      } catch (error) {
        const fallback = callbackOptions.onError
          ? await callbackOptions.onError(error, request)
          : redirectResponse(withQuery(absoluteUrl(appBaseUrl, postLogoutRedirectPath), "error", errorCode(error)));
        clearTransactionCookies(fallback.headers);
        return fallback;
      }
    },
    logout: async (logoutOptions = {}) => {
      const discovery = await discoverOpenIdConfiguration({ issuer, fetcher });
      const postLogoutRedirectUri = logoutOptions.postLogoutRedirectUri ?? absoluteUrl(appBaseUrl, postLogoutRedirectPath);
      if (logoutOptions.idTokenHint && discovery.end_session_endpoint) {
        const logoutUrl = new URL(discovery.end_session_endpoint);
        logoutUrl.searchParams.set("client_id", options.clientId);
        logoutUrl.searchParams.set("post_logout_redirect_uri", postLogoutRedirectUri);
        logoutUrl.searchParams.set("id_token_hint", logoutOptions.idTokenHint);
        return redirectResponse(logoutUrl.toString());
      }
      return redirectResponse(postLogoutRedirectUri);
    },
    createTransaction,
    readTransaction,
    clearTransactionCookies,
  };

  async function createTransaction(loginOptions: StartLoginOptions = {}) {
    const oauth = await createOAuthTransaction();
    const transaction: StoredTransaction = {
      ...oauth,
      returnTo: sanitizeReturnTo(loginOptions.returnTo ?? postLoginRedirectPath),
      createdAt: Date.now(),
    };
    const authorizeUrl = buildHostedLoginUrl(issuer, {
      mode: loginOptions.mode,
      clientId: options.clientId,
      redirectUri: loginOptions.redirectUri ?? absoluteUrl(appBaseUrl, redirectPath),
      scope: loginOptions.scope ?? options.scope ?? DEFAULT_SCOPE,
      state: transaction.state,
      nonce: transaction.nonce,
      codeChallenge: transaction.codeChallenge,
      codeChallengeMethod: transaction.codeChallengeMethod,
      resource: loginOptions.resource,
      loginHint: loginOptions.loginHint,
      prompt: loginOptions.prompt,
      extraParams: loginOptions.extraParams,
    });
    return { authorizeUrl, transaction };
  }

  function readTransaction(request: Request): StoredTransaction {
    const cookies = parseCookieHeader(request.headers.get("cookie") ?? "");
    const state = cookies.get(cookieName(cookiePrefix, "state"));
    const nonce = cookies.get(cookieName(cookiePrefix, "nonce"));
    const codeVerifier = cookies.get(cookieName(cookiePrefix, "verifier"));
    const returnTo = cookies.get(cookieName(cookiePrefix, "return_to"));
    const createdAtRaw = cookies.get(cookieName(cookiePrefix, "created_at"));
    const createdAt = createdAtRaw ? Number(createdAtRaw) : NaN;

    if (!state || !nonce || !codeVerifier || !returnTo || !Number.isFinite(createdAt)) {
      throw new NamoIDError("OAuth transaction cookie is missing", { code: "missing_oauth_transaction" });
    }
    if (Date.now() - createdAt > transactionMaxAgeSeconds * 1000) {
      throw new NamoIDError("OAuth transaction expired", { code: "expired_oauth_transaction" });
    }

    return {
      state,
      nonce,
      codeVerifier,
      codeChallenge: "",
      codeChallengeMethod: "S256",
      returnTo: sanitizeReturnTo(returnTo),
      createdAt,
    };
  }

  function clearTransactionCookies(headers: Headers): void {
    for (const suffix of ["state", "nonce", "verifier", "return_to", "created_at"]) {
      appendCookie(headers, cookieName(cookiePrefix, suffix), "", {
        httpOnly: true,
        sameSite: "Lax",
        secure: appBaseUrl.startsWith("https://"),
        path: "/",
        maxAge: 0,
      });
    }
  }

  return client;
}

export async function exchangeNamoIDCodeForSession(options: {
  apiBaseUrl: string;
  idToken: string;
  issuer: string;
  clientId: string;
  nonce: string;
  sessionMintToken?: string;
  fetcher?: typeof fetch;
}): Promise<unknown> {
  const fetcher = options.fetcher ?? globalThis.fetch;
  if (!fetcher) throw new NamoIDError("fetch is not available; pass a fetcher option", { code: "missing_fetch" });
  const headers: Record<string, string> = {
    accept: "application/json",
    "content-type": "application/json",
  };
  if (options.sessionMintToken) headers["x-console-session-mint-token"] = options.sessionMintToken;
  const response = await fetcher(new URL("/v1/auth/oidc-session", ensureTrailingSlash(options.apiBaseUrl)), {
    method: "POST",
    headers,
    body: JSON.stringify({
      id_token: options.idToken,
      issuer: trimTrailingSlash(options.issuer),
      client_id: options.clientId,
      nonce: options.nonce,
    }),
    cache: "no-store",
  });
  if (!response.ok) {
    let detail: unknown = null;
    try {
      detail = await response.json();
    } catch {
      detail = null;
    }
    throw new NamoIDError(`NamoID session exchange failed with ${response.status}`, {
      status: response.status,
      code: "session_exchange_failed",
      detail,
    });
  }
  return response.json();
}

export function buildLogoutUrl(options: {
  issuer: string;
  clientId: string;
  postLogoutRedirectUri: string;
  idTokenHint?: string;
  endSessionEndpoint?: string;
}): string {
  const endpoint = options.endSessionEndpoint ?? new URL("/oauth/logout", ensureTrailingSlash(options.issuer)).toString();
  const url = new URL(endpoint);
  url.searchParams.set("client_id", options.clientId);
  url.searchParams.set("post_logout_redirect_uri", options.postLogoutRedirectUri);
  if (options.idTokenHint) url.searchParams.set("id_token_hint", options.idTokenHint);
  return url.toString();
}

export async function revokeRefreshToken(options: {
  issuer: string;
  clientId: string;
  clientSecret?: string;
  refreshToken: string;
  tokenEndpointAuthMethod?: TokenEndpointAuthMethod;
  fetcher?: typeof fetch;
}): Promise<void> {
  await revokeToken({
    issuer: options.issuer,
    clientId: options.clientId,
    clientSecret: options.clientSecret,
    token: options.refreshToken,
    tokenTypeHint: "refresh_token",
    tokenEndpointAuthMethod: options.tokenEndpointAuthMethod,
    fetcher: options.fetcher,
  });
}

export function getIdTokenClaims(idToken: string): JwtClaims {
  return decodeJwt(idToken).claims;
}

function writeTransactionCookies(
  headers: Headers,
  cookiePrefix: string,
  transaction: StoredTransaction,
  options: { secure: boolean; maxAge: number },
): void {
  const cookieOptions: CookieOptions = {
    httpOnly: true,
    sameSite: "Lax",
    secure: options.secure,
    path: "/",
    maxAge: options.maxAge,
  };
  appendCookie(headers, cookieName(cookiePrefix, "state"), transaction.state, cookieOptions);
  appendCookie(headers, cookieName(cookiePrefix, "nonce"), transaction.nonce, cookieOptions);
  appendCookie(headers, cookieName(cookiePrefix, "verifier"), transaction.codeVerifier, cookieOptions);
  appendCookie(headers, cookieName(cookiePrefix, "return_to"), transaction.returnTo, cookieOptions);
  appendCookie(headers, cookieName(cookiePrefix, "created_at"), String(transaction.createdAt), cookieOptions);
}

function cookieName(prefix: string, suffix: string): string {
  return `${prefix}_${suffix}`;
}

type CookieOptions = {
  httpOnly?: boolean;
  sameSite?: "Lax" | "Strict" | "None";
  secure?: boolean;
  path?: string;
  maxAge?: number;
};

function appendCookie(headers: Headers, name: string, value: string, options: CookieOptions): void {
  const parts = [`${name}=${encodeURIComponent(value)}`];
  if (options.maxAge !== undefined) parts.push(`Max-Age=${options.maxAge}`);
  if (options.path) parts.push(`Path=${options.path}`);
  if (options.httpOnly) parts.push("HttpOnly");
  if (options.secure) parts.push("Secure");
  if (options.sameSite) parts.push(`SameSite=${options.sameSite}`);
  headers.append("Set-Cookie", parts.join("; "));
}

function parseCookieHeader(header: string): Map<string, string> {
  const cookies = new Map<string, string>();
  for (const part of header.split(";")) {
    const [rawName, ...rawValue] = part.trim().split("=");
    if (!rawName) continue;
    cookies.set(rawName, decodeURIComponent(rawValue.join("=") || ""));
  }
  return cookies;
}

function redirectResponse(location: string): Response {
  return new Response(null, {
    status: 302,
    headers: {
      location,
      "cache-control": "no-store",
    },
  });
}

function absoluteUrl(baseUrl: string, pathOrUrl: string): string {
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  const normalizedPath = pathOrUrl.startsWith("/") ? pathOrUrl : `/${pathOrUrl}`;
  return new URL(normalizedPath, ensureTrailingSlash(baseUrl)).toString();
}

function withQuery(urlValue: string, key: string, value: string): string {
  const url = new URL(urlValue);
  url.searchParams.set(key, value);
  return url.toString();
}

function sanitizeReturnTo(value: string): string {
  if (/^https?:\/\//i.test(value)) {
    throw new NamoIDError("returnTo must be a relative path", { code: "unsafe_return_to" });
  }
  return value.startsWith("/") ? value : `/${value}`;
}

function errorCode(error: unknown): string {
  if (typeof error === "object" && error !== null && "code" in error) {
    const value = (error as { code?: unknown }).code;
    if (typeof value === "string" && value) return value;
  }
  if (error instanceof Error && error.message) return error.message;
  return "auth_callback_failed";
}

function assertRequired(value: string | undefined, field: string): void {
  if (!value) throw new NamoIDError(`${field} is required`, { code: `missing_${field}` });
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function ensureTrailingSlash(value: string): string {
  return value.endsWith("/") ? value : `${value}/`;
}
