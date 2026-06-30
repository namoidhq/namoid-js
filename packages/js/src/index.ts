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
  extraParams?: Record<string, string | number | boolean | null | undefined>;
};

export type NamoIDClientOptions = {
  publishableKey: string;
  apiBaseUrl?: string;
  hostedLoginBaseUrl?: string;
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
};

const DEFAULT_API_BASE_URL = "https://api.namoid.in";

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
  };

  return client;
}

function buildHostedLoginUrl(baseUrl: string, options: HostedLoginUrlOptions): string {
  const url = new URL("/oauth/authorize", baseUrl);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", options.clientId);
  url.searchParams.set("redirect_uri", options.redirectUri);
  url.searchParams.set("scope", Array.isArray(options.scope) ? options.scope.join(" ") : options.scope ?? "openid email profile");

  if (options.mode) url.searchParams.set("mode", options.mode);
  if (options.state) url.searchParams.set("state", options.state);
  if (options.nonce) url.searchParams.set("nonce", options.nonce);
  if (options.codeChallenge) url.searchParams.set("code_challenge", options.codeChallenge);
  if (options.codeChallengeMethod) {
    url.searchParams.set("code_challenge_method", options.codeChallengeMethod);
  }

  for (const [key, value] of Object.entries(options.extraParams ?? {})) {
    if (value !== null && value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }

  return url.toString();
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
  return null;
}

function readErrorCode(body: unknown): string | null {
  if (typeof body === "object" && body !== null && "error" in body) {
    const value = (body as { error?: unknown }).error;
    return typeof value === "string" ? value : null;
  }
  return null;
}
