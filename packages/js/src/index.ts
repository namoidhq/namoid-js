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

export type HostedAuthMode = "sign_in" | "sign_up" | "waitlist";

export type HostedAuthUrlOptions = {
  mode?: HostedAuthMode;
  returnTo: string;
  state: string;
  completionMode: "public" | "confidential";
  codeChallenge?: string;
  codeChallengeMethod?: "S256";
  extraParams?: Record<string, string | number | boolean | null | undefined>;
};

export type HostedAuthTransaction = {
  state: string;
  codeVerifier: string;
  codeChallenge: string;
  codeChallengeMethod: "S256";
};

export type HostedAuthExchangeOptions = {
  code: string;
  codeVerifier?: string;
  deviceId?: string;
  clientId?: string;
  clientSecret?: string;
};

export type NamoIDTokenResponse = {
  access_token: string;
  token_type: string;
  expires_in?: number;
  refresh_token?: string;
  id_token?: string;
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
  };
  hostedAuth: {
    getUrl: (options: HostedAuthUrlOptions) => Promise<string>;
    redirect: (options: HostedAuthUrlOptions) => Promise<void>;
    createPublicTransaction: () => Promise<HostedAuthTransaction>;
    exchangeCode: (options: HostedAuthExchangeOptions) => Promise<NamoIDTokenResponse>;
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

export function createNamoIDClient(options: NamoIDClientOptions): NamoIDClient {
  if (!options.clientId) {
    throw new NamoIDError("clientId is required", { code: "missing_client_id" });
  }

  const fetcher = requireFetch(options.fetcher);
  let configPromise: Promise<NamoIDAuthConfig> | null = null;
  const getConfig = () => {
    configPromise ??= getNamoIDAuthConfig({
      clientId: options.clientId,
      fetcher,
    });
    return configPromise;
  };
  return {
    clientId: options.clientId,
    auth: { getConfig },
    hostedAuth: {
      getUrl: async (urlOptions) => {
        return buildConfiguredHostedAuthUrl(await getConfig(), urlOptions);
      },
      redirect: async (urlOptions) => {
        if (typeof window === "undefined") {
          throw new NamoIDError("hostedAuth.redirect can only run in a browser", {
            code: "browser_required",
          });
        }
        window.location.assign(buildConfiguredHostedAuthUrl(await getConfig(), urlOptions));
      },
      createPublicTransaction: createHostedAuthTransaction,
      exchangeCode: (exchangeOptions) =>
        exchangeHostedAuthCode({ ...exchangeOptions, clientId: options.clientId, fetcher }),
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

export function buildHostedAuthUrl(baseUrl: string, options: HostedAuthUrlOptions): string {
  const path =
    options.mode === "sign_up" ? "/sign-up" : options.mode === "waitlist" ? "/waitlist" : "/sign-in";
  const url = new URL(path, normalizeBaseUrl(baseUrl));
  url.searchParams.set("return_to", options.returnTo);
  url.searchParams.set("state", options.state);
  url.searchParams.set("completion_mode", options.completionMode);
  if (options.codeChallenge) url.searchParams.set("code_challenge", options.codeChallenge);
  if (options.codeChallengeMethod) url.searchParams.set("code_challenge_method", options.codeChallengeMethod);
  for (const [key, value] of Object.entries(options.extraParams ?? {})) {
    if (value !== null && value !== undefined) url.searchParams.set(key, String(value));
  }
  return url.toString();
}

export function buildConfiguredHostedAuthUrl(
  config: NamoIDAuthConfig,
  options: HostedAuthUrlOptions,
): string {
  const mode = options.mode ?? "sign_in";
  const configuredPage = config.hosted_auth_pages[mode];
  if (!configuredPage) {
    throw new NamoIDError(`Hosted Auth page is not enabled: ${mode}`, {
      code: "hosted_auth_page_disabled",
    });
  }
  const url = new URL(configuredPage);
  url.searchParams.set("return_to", options.returnTo);
  url.searchParams.set("state", options.state);
  url.searchParams.set("completion_mode", options.completionMode);
  if (options.codeChallenge) url.searchParams.set("code_challenge", options.codeChallenge);
  if (options.codeChallengeMethod) {
    url.searchParams.set("code_challenge_method", options.codeChallengeMethod);
  }
  for (const [key, value] of Object.entries(options.extraParams ?? {})) {
    if (value !== null && value !== undefined && !url.searchParams.has(key)) {
      url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

export async function createHostedAuthTransaction(): Promise<HostedAuthTransaction> {
  const codeVerifier = randomBase64Url(48);
  return {
    state: randomBase64Url(32),
    codeVerifier,
    codeChallenge: await pkceChallenge(codeVerifier),
    codeChallengeMethod: "S256",
  };
}

export async function exchangeHostedAuthCode(
  options: HostedAuthExchangeOptions & { fetcher?: typeof fetch },
): Promise<NamoIDTokenResponse> {
  const fetcher = requireFetch(options.fetcher);
  const response = await fetcher(
    new URL("/v1/auth/hosted/exchange", DEFAULT_API_BASE_URL),
    {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        code: options.code,
        code_verifier: options.codeVerifier,
        device_id: options.deviceId,
        client_id: options.clientId,
        client_secret: options.clientSecret,
      }),
      cache: "no-store",
    },
  );
  if (!response.ok) {
    const body = await safeJson(response);
    throw new NamoIDError(readErrorMessage(body) ?? `Hosted Auth exchange failed with ${response.status}`, {
      status: response.status,
      code: readErrorCode(body) ?? "hosted_auth_exchange_failed",
      detail: body,
    });
  }
  return (await response.json()) as NamoIDTokenResponse;
}

export async function revokeNativeSession(options: {
  accessToken: string;
  refreshToken?: string;
  fetcher?: typeof fetch;
}): Promise<void> {
  const fetcher = requireFetch(options.fetcher);
  const response = await fetcher(
    new URL("/v1/auth/logout", DEFAULT_API_BASE_URL),
    {
      method: "POST",
      headers: { authorization: `Bearer ${options.accessToken}`, "content-type": "application/json" },
      body: JSON.stringify({ refresh_token: options.refreshToken }),
      cache: "no-store",
    },
  );
  if (!response.ok && response.status !== 204) {
    const body = await safeJson(response);
    throw new NamoIDError(readErrorMessage(body) ?? `Session revocation failed with ${response.status}`, {
      status: response.status,
      code: readErrorCode(body) ?? "session_revocation_failed",
      detail: body,
    });
  }
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

async function request<T>(options: {
  fetcher: typeof fetch;
  clientId: string;
  path: string;
}): Promise<T> {
  const url = new URL(options.path, DEFAULT_API_BASE_URL);
  url.searchParams.set("client_id", options.clientId);
  const response = await options.fetcher(url, {
    headers: { accept: "application/json" },
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

function requireFetch(fetcher?: typeof fetch): typeof fetch {
  const resolved = fetcher ?? globalThis.fetch;
  if (!resolved) throw new NamoIDError("fetch is not available; pass a fetcher option", { code: "missing_fetch" });
  return resolved;
}

function getCrypto(): Crypto {
  if (!globalThis.crypto?.subtle) {
    throw new NamoIDError("Web Crypto is not available in this runtime", { code: "missing_crypto" });
  }
  return globalThis.crypto;
}

function base64UrlEncode(values: Uint8Array): string {
  let binary = "";
  for (const value of values) binary += String.fromCharCode(value);
  if (typeof btoa !== "function") {
    throw new NamoIDError("base64 encoding is not available in this runtime", { code: "missing_base64" });
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
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
