import {
  buildConfiguredHostedAuthUrl,
  exchangeHostedAuthCode,
  getNamoIDAuthConfig,
  NamoIDError,
  randomBase64Url,
  revokeNativeSession,
  type HostedAuthMode,
  type NamoIDTokenResponse,
} from "@namoidhq/js";
import { validateAuthToken } from "@namoidhq/js/server";

export type NamoIDNextOptions = {
  clientId: string;
  clientSecret: string;
  appBaseUrl: string;
  callbackPath?: string;
  postLoginRedirectPath?: string;
  postLogoutRedirectPath?: string;
  cookiePrefix?: string;
  transactionMaxAgeSeconds?: number;
  fetcher?: typeof fetch;
};

export type StartLoginOptions = {
  mode?: HostedAuthMode;
  returnTo?: string;
  callbackUrl?: string;
  extraParams?: Record<string, string | number | boolean | null | undefined>;
};

export type CallbackContext = {
  request: Request;
  tokens: NamoIDTokenResponse;
  transaction: StoredTransaction;
};

export type CallbackOptions = {
  onSuccess?: (context: CallbackContext) => Response | Promise<Response>;
  onError?: (error: unknown, request: Request) => Response | Promise<Response>;
};

export type LogoutOptions = {
  accessToken?: string;
  refreshToken?: string;
  postLogoutRedirectUri?: string;
  clearHostedSession?: boolean;
};

export type StoredTransaction = {
  state: string;
  returnTo: string;
  createdAt: number;
};

export type NamoIDNextClient = {
  login: (options?: StartLoginOptions) => Promise<Response>;
  callback: (request: Request, options?: CallbackOptions) => Promise<Response>;
  logout: (options?: LogoutOptions) => Promise<Response>;
  createTransaction: (options?: StartLoginOptions) => Promise<{
    hostedAuthUrl: string;
    transaction: StoredTransaction;
  }>;
  readTransaction: (request: Request) => StoredTransaction;
  clearTransactionCookies: (headers: Headers) => void;
};

const DEFAULT_CALLBACK_PATH = "/api/auth/callback/namoid";
const DEFAULT_POST_LOGIN_REDIRECT_PATH = "/";
const DEFAULT_POST_LOGOUT_REDIRECT_PATH = "/login";
const DEFAULT_COOKIE_PREFIX = "namoid";
const DEFAULT_TRANSACTION_MAX_AGE_SECONDS = 10 * 60;

export function createNamoIDNextClient(options: NamoIDNextOptions): NamoIDNextClient {
  assertRequired(options.clientId, "clientId");
  assertRequired(options.clientSecret, "clientSecret");
  assertRequired(options.appBaseUrl, "appBaseUrl");

  const appBaseUrl = trimTrailingSlash(options.appBaseUrl);
  const callbackPath = options.callbackPath ?? DEFAULT_CALLBACK_PATH;
  const postLoginRedirectPath = options.postLoginRedirectPath ?? DEFAULT_POST_LOGIN_REDIRECT_PATH;
  const postLogoutRedirectPath = options.postLogoutRedirectPath ?? DEFAULT_POST_LOGOUT_REDIRECT_PATH;
  const cookiePrefix = options.cookiePrefix ?? DEFAULT_COOKIE_PREFIX;
  const transactionMaxAgeSeconds = options.transactionMaxAgeSeconds ?? DEFAULT_TRANSACTION_MAX_AGE_SECONDS;
  const fetcher = options.fetcher ?? globalThis.fetch;

  if (!fetcher) {
    throw new NamoIDError("fetch is not available; pass a fetcher option", { code: "missing_fetch" });
  }
  let authConfigPromise: ReturnType<typeof getNamoIDAuthConfig> | null = null;
  const getHostedAuthContext = async () => {
    authConfigPromise ??= getNamoIDAuthConfig({
      clientId: options.clientId,
      fetcher,
    });
    return authConfigPromise;
  };

  const client: NamoIDNextClient = {
    login: async (loginOptions = {}) => {
      const { hostedAuthUrl, transaction } = await createTransaction(loginOptions);
      const response = redirectResponse(hostedAuthUrl);
      writeTransactionCookies(response.headers, cookiePrefix, transaction, {
        secure: appBaseUrl.startsWith("https://"),
        maxAge: transactionMaxAgeSeconds,
      });
      return response;
    },
    callback: async (request, callbackOptions = {}) => {
      try {
        const url = new URL(request.url);
        const authError = url.searchParams.get("error");
        if (authError) {
          throw new NamoIDError(authError, {
            code: authError,
            detail: { error_description: url.searchParams.get("error_description") },
          });
        }

        const code = url.searchParams.get("code");
        const returnedState = url.searchParams.get("state");
        const transaction = readTransaction(request);
        if (!code || !returnedState || returnedState !== transaction.state) {
          throw new NamoIDError("Invalid Hosted Auth state", { code: "invalid_hosted_auth_state" });
        }

        const tokens = await exchangeHostedAuthCode({
          code,
          clientId: options.clientId,
          clientSecret: options.clientSecret,
          fetcher,
        });
        const validation = await validateAuthToken({
          token: tokens.access_token,
          clientId: options.clientId,
          clientSecret: options.clientSecret,
          fetcher,
        });
        if (!validation.valid) {
          throw new NamoIDError("Hosted Auth returned an invalid access token", {
            code: validation.error ?? "invalid_access_token",
          });
        }
        const success = callbackOptions.onSuccess
          ? await callbackOptions.onSuccess({ request, tokens, transaction })
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
      if (logoutOptions.accessToken) {
        await revokeNativeSession({
          accessToken: logoutOptions.accessToken,
          refreshToken: logoutOptions.refreshToken,
          fetcher,
        });
      }
      const postLogoutRedirectUri =
        logoutOptions.postLogoutRedirectUri ?? absoluteUrl(appBaseUrl, postLogoutRedirectPath);
      if (logoutOptions.clearHostedSession !== false) {
        const config = await getHostedAuthContext();
        const logoutUrl = new URL("/sign-out", ensureTrailingSlash(config.hosted_auth_base_url));
        logoutUrl.searchParams.set("return_to", postLogoutRedirectUri);
        copyConfiguredPageContext(config.hosted_auth_pages.sign_in, logoutUrl);
        return redirectResponse(logoutUrl.toString());
      }
      return redirectResponse(postLogoutRedirectUri);
    },
    createTransaction,
    readTransaction,
    clearTransactionCookies,
  };

  async function createTransaction(loginOptions: StartLoginOptions = {}) {
    const config = await getHostedAuthContext();
    const transaction: StoredTransaction = {
      state: randomBase64Url(32),
      returnTo: sanitizeReturnTo(loginOptions.returnTo ?? postLoginRedirectPath),
      createdAt: Date.now(),
    };
    const hostedAuthUrl = buildConfiguredHostedAuthUrl(config, {
      mode: loginOptions.mode,
      returnTo: loginOptions.callbackUrl ?? absoluteUrl(appBaseUrl, callbackPath),
      state: transaction.state,
      completionMode: "confidential",
      extraParams: loginOptions.extraParams,
    });
    return { hostedAuthUrl, transaction };
  }

  function readTransaction(request: Request): StoredTransaction {
    const cookies = parseCookieHeader(request.headers.get("cookie") ?? "");
    const state = cookies.get(cookieName(cookiePrefix, "state"));
    const returnTo = cookies.get(cookieName(cookiePrefix, "return_to"));
    const createdAtRaw = cookies.get(cookieName(cookiePrefix, "created_at"));
    const createdAt = createdAtRaw ? Number(createdAtRaw) : Number.NaN;
    if (!state || !returnTo || !Number.isFinite(createdAt)) {
      throw new NamoIDError("Hosted Auth transaction cookie is missing", {
        code: "missing_hosted_auth_transaction",
      });
    }
    if (Date.now() - createdAt > transactionMaxAgeSeconds * 1000) {
      throw new NamoIDError("Hosted Auth transaction expired", {
        code: "expired_hosted_auth_transaction",
      });
    }
    return { state, returnTo: sanitizeReturnTo(returnTo), createdAt };
  }

  function clearTransactionCookies(headers: Headers): void {
    for (const suffix of ["state", "return_to", "created_at"]) {
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

function copyConfiguredPageContext(pageUrl: string | undefined, target: URL): void {
  if (!pageUrl) return;
  const source = new URL(pageUrl);
  for (const [key, value] of source.searchParams) {
    target.searchParams.set(key, value);
  }
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
    headers: { location, "cache-control": "no-store" },
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
