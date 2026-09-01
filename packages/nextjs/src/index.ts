import {
  createNamoIDClient,
  NamoIDError,
  randomBase64Url,
  type NamoIDTokenResponse,
  type NamoIDUserInfo,
} from "@namoidhq/js";
import { validateOIDCIdToken, type ValidatedIDToken } from "@namoidhq/js/server";

export type NamoIDNextOptions = {
  clientId: string;
  clientSecret: string;
  appBaseUrl: string;
  callbackPath?: string;
  postLoginRedirectPath?: string;
  postLogoutRedirectPath?: string;
  errorRedirectPath?: string;
  cookiePrefix?: string;
  transactionMaxAgeSeconds?: number;
  fetcher?: typeof fetch;
};

export type StartLoginOptions = {
  returnTo?: string;
  callbackUrl?: string;
  prompt?: "login";
  resource?: string;
  extraParams?: Record<string, string | number | boolean | null | undefined>;
};

export type CallbackContext = {
  request: Request;
  tokens: NamoIDTokenResponse;
  identity: NamoIDUserInfo;
  idTokenClaims: ValidatedIDToken;
  transaction: StoredTransaction;
};

export type CallbackOptions = {
  onSuccess?: (context: CallbackContext) => Response | Promise<Response>;
  onError?: (error: unknown, request: Request) => Response | Promise<Response>;
};

export type LogoutOptions = {
  accessToken?: string;
  refreshToken?: string;
  idTokenHint?: string;
  postLogoutRedirectUri?: string;
  clearHostedSession?: boolean;
};

export type StoredTransaction = {
  state: string;
  nonce: string;
  codeVerifier: string;
  redirectUri: string;
  returnTo: string;
  createdAt: number;
};

export type NamoIDNextClient = {
  login: (options?: StartLoginOptions) => Promise<Response>;
  callback: (request: Request, options?: CallbackOptions) => Promise<Response>;
  refresh: (refreshToken: string) => Promise<NamoIDTokenResponse>;
  logout: (options?: LogoutOptions) => Promise<Response>;
  createTransaction: (options?: StartLoginOptions) => Promise<{
    authorizationUrl: string;
    transaction: StoredTransaction;
  }>;
  readTransaction: (request: Request) => StoredTransaction;
  clearTransactionCookies: (headers: Headers) => void;
};

const DEFAULT_CALLBACK_PATH = "/api/auth/callback/namoid";
const DEFAULT_POST_LOGIN_REDIRECT_PATH = "/";
const DEFAULT_POST_LOGOUT_REDIRECT_PATH = "/login";
const DEFAULT_ERROR_REDIRECT_PATH = "/login";
const DEFAULT_COOKIE_PREFIX = "namoid";
const DEFAULT_TRANSACTION_MAX_AGE_SECONDS = 10 * 60;
const SESSION_SCOPES = ["openid", "profile", "email", "offline_access"];

export function createNamoIDNextClient(options: NamoIDNextOptions): NamoIDNextClient {
  assertRequired(options.clientId, "clientId");
  assertRequired(options.clientSecret, "clientSecret");
  assertRequired(options.appBaseUrl, "appBaseUrl");

  const appBaseUrl = trimTrailingSlash(options.appBaseUrl);
  const callbackPath = options.callbackPath ?? DEFAULT_CALLBACK_PATH;
  const postLoginRedirectPath = options.postLoginRedirectPath ?? DEFAULT_POST_LOGIN_REDIRECT_PATH;
  const postLogoutRedirectPath = options.postLogoutRedirectPath ?? DEFAULT_POST_LOGOUT_REDIRECT_PATH;
  const errorRedirectPath = options.errorRedirectPath ?? DEFAULT_ERROR_REDIRECT_PATH;
  const cookiePrefix = options.cookiePrefix ?? DEFAULT_COOKIE_PREFIX;
  const transactionMaxAgeSeconds =
    options.transactionMaxAgeSeconds ?? DEFAULT_TRANSACTION_MAX_AGE_SECONDS;
  const fetcher = options.fetcher ?? globalThis.fetch;

  if (!fetcher) {
    throw new NamoIDError("fetch is not available; pass a fetcher option", {
      code: "missing_fetch",
    });
  }
  const oidc = createNamoIDClient({ clientId: options.clientId, fetcher });

  const client: NamoIDNextClient = {
    login: async (loginOptions = {}) => {
      const { authorizationUrl, transaction } = await createTransaction(loginOptions);
      const response = redirectResponse(authorizationUrl);
      writeTransactionCookies(response.headers, cookiePrefix, transaction, {
        secure: appBaseUrl.startsWith("https://"),
        maxAge: transactionMaxAgeSeconds,
      });
      return response;
    },
    callback: async (request, callbackOptions = {}) => {
      try {
        const url = new URL(request.url);
        const transaction = readTransaction(request);
        const returnedState = url.searchParams.get("state");
        if (!returnedState || returnedState !== transaction.state) {
          throw new NamoIDError("Invalid authorization state", {
            code: "invalid_oidc_state",
          });
        }

        const authError = url.searchParams.get("error");
        if (authError) {
          throw new NamoIDError(
            url.searchParams.get("error_description") ?? authError,
            { code: authError },
          );
        }
        const code = url.searchParams.get("code");
        if (!code) {
          throw new NamoIDError("Authorization code is missing", {
            code: "missing_authorization_code",
          });
        }

        const discovery = await oidc.auth.getDiscovery();
        const responseIssuer = url.searchParams.get("iss");
        if (
          discovery.authorization_response_iss_parameter_supported &&
          responseIssuer !== discovery.issuer
        ) {
          throw new NamoIDError("Authorization response issuer mismatch", {
            code: "issuer_mismatch",
          });
        }

        const tokens = await oidc.hostedAuth.exchangeCode({
          code,
          redirectUri: transaction.redirectUri,
          codeVerifier: transaction.codeVerifier,
          clientSecret: options.clientSecret,
        });
        if (!tokens.id_token) {
          throw new NamoIDError("The token response did not include an ID token", {
            code: "missing_id_token",
          });
        }
        const idTokenClaims = await validateOIDCIdToken({
          idToken: tokens.id_token,
          discovery,
          clientId: options.clientId,
          nonce: transaction.nonce,
          fetcher,
        });
        const identity = await oidc.hostedAuth.userInfo(tokens.access_token);
        if (identity.sub !== idTokenClaims.sub) {
          throw new NamoIDError("ID token and UserInfo subjects do not match", {
            code: "subject_mismatch",
          });
        }

        const success = callbackOptions.onSuccess
          ? await callbackOptions.onSuccess({
              request,
              tokens,
              identity,
              idTokenClaims,
              transaction,
            })
          : redirectResponse(absoluteUrl(appBaseUrl, transaction.returnTo));
        return withClearedTransactionCookies(success);
      } catch (error) {
        const fallback = callbackOptions.onError
          ? await callbackOptions.onError(error, request)
          : redirectResponse(
              withQuery(
                absoluteUrl(appBaseUrl, errorRedirectPath),
                "error",
                errorCode(error),
              ),
            );
        return withClearedTransactionCookies(fallback);
      }
    },
    refresh: (refreshToken) =>
      oidc.hostedAuth.refresh({
        refreshToken,
        clientSecret: options.clientSecret,
      }),
    logout: async (logoutOptions = {}) => {
      const tokenToRevoke = logoutOptions.refreshToken ?? logoutOptions.accessToken;
      if (tokenToRevoke) {
        await oidc.hostedAuth.revoke({
          token: tokenToRevoke,
          tokenTypeHint: logoutOptions.refreshToken ? "refresh_token" : "access_token",
          clientSecret: options.clientSecret,
        });
      }
      const postLogoutRedirectUri =
        safeAppRedirect(
          appBaseUrl,
          logoutOptions.postLogoutRedirectUri ?? postLogoutRedirectPath,
          "postLogoutRedirectUri",
        );
      if (logoutOptions.clearHostedSession !== false && logoutOptions.idTokenHint) {
        return redirectResponse(
          await oidc.hostedAuth.getLogoutUrl({
            idTokenHint: logoutOptions.idTokenHint,
            postLogoutRedirectUri,
            state: randomBase64Url(24),
          }),
        );
      }
      return redirectResponse(postLogoutRedirectUri);
    },
    createTransaction,
    readTransaction,
    clearTransactionCookies,
  };

  async function createTransaction(loginOptions: StartLoginOptions = {}) {
    const redirectUri =
      loginOptions.callbackUrl ?? absoluteUrl(appBaseUrl, callbackPath);
    const started = await oidc.hostedAuth.start({
      redirectUri,
      scopes: SESSION_SCOPES,
      prompt: loginOptions.prompt,
      resource: loginOptions.resource,
      extraParams: loginOptions.extraParams,
    });
    const transaction: StoredTransaction = {
      state: started.transaction.state,
      nonce: started.transaction.nonce,
      codeVerifier: started.transaction.codeVerifier,
      redirectUri,
      returnTo: sanitizeReturnTo(loginOptions.returnTo ?? postLoginRedirectPath),
      createdAt: started.transaction.createdAt,
    };
    return { authorizationUrl: started.authorizationUrl, transaction };
  }

  function readTransaction(request: Request): StoredTransaction {
    const cookies = parseCookieHeader(request.headers.get("cookie") ?? "");
    const state = cookies.get(cookieName(cookiePrefix, "state"));
    const nonce = cookies.get(cookieName(cookiePrefix, "nonce"));
    const codeVerifier = cookies.get(cookieName(cookiePrefix, "code_verifier"));
    const redirectUri = cookies.get(cookieName(cookiePrefix, "redirect_uri"));
    const returnTo = cookies.get(cookieName(cookiePrefix, "return_to"));
    const createdAtRaw = cookies.get(cookieName(cookiePrefix, "created_at"));
    const createdAt = createdAtRaw ? Number(createdAtRaw) : Number.NaN;
    if (
      !state ||
      !nonce ||
      !codeVerifier ||
      !redirectUri ||
      !returnTo ||
      !Number.isFinite(createdAt)
    ) {
      throw new NamoIDError("Authorization transaction cookie is missing", {
        code: "missing_oidc_transaction",
      });
    }
    const age = Date.now() - createdAt;
    if (age < -60_000 || age > transactionMaxAgeSeconds * 1000) {
      throw new NamoIDError("Authorization transaction expired", {
        code: "expired_oidc_transaction",
      });
    }
    return {
      state,
      nonce,
      codeVerifier,
      redirectUri,
      returnTo: sanitizeReturnTo(returnTo),
      createdAt,
    };
  }

  function clearTransactionCookies(headers: Headers): void {
    for (const suffix of TRANSACTION_COOKIE_SUFFIXES) {
      appendCookie(headers, cookieName(cookiePrefix, suffix), "", {
        httpOnly: true,
        sameSite: "Lax",
        secure: appBaseUrl.startsWith("https://"),
        path: "/",
        maxAge: 0,
      });
    }
  }

  function withClearedTransactionCookies(response: Response): Response {
    const mutableResponse = new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: new Headers(response.headers),
    });
    clearTransactionCookies(mutableResponse.headers);
    return mutableResponse;
  }

  return client;
}

const TRANSACTION_COOKIE_SUFFIXES = [
  "state",
  "nonce",
  "code_verifier",
  "redirect_uri",
  "return_to",
  "created_at",
] as const;

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
  const values: Record<(typeof TRANSACTION_COOKIE_SUFFIXES)[number], string> = {
    state: transaction.state,
    nonce: transaction.nonce,
    code_verifier: transaction.codeVerifier,
    redirect_uri: transaction.redirectUri,
    return_to: transaction.returnTo,
    created_at: String(transaction.createdAt),
  };
  for (const suffix of TRANSACTION_COOKIE_SUFFIXES) {
    appendCookie(headers, cookieName(cookiePrefix, suffix), values[suffix], cookieOptions);
  }
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
    headers: { location, "cache-control": "no-store" },
  });
}

function absoluteUrl(baseUrl: string, pathOrUrl: string): string {
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  const normalizedPath = pathOrUrl.startsWith("/") ? pathOrUrl : `/${pathOrUrl}`;
  return new URL(normalizedPath, `${baseUrl}/`).toString();
}

function safeAppRedirect(baseUrl: string, pathOrUrl: string, field: string): string {
  const resolved = absoluteUrl(baseUrl, pathOrUrl);
  if (new URL(resolved).origin !== new URL(baseUrl).origin) {
    throw new NamoIDError(`${field} must use the application origin`, {
      code: "unsafe_redirect_uri",
    });
  }
  return resolved;
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
  return "auth_callback_failed";
}

function assertRequired(value: string | undefined, field: string): void {
  if (!value) throw new NamoIDError(`${field} is required`, { code: `missing_${field}` });
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}
