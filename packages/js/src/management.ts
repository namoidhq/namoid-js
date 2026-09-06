export type NamoIDManagementOptions = {
  issuer: string;
  instanceId: string;
  clientId: string;
  clientSecret: string;
  apiBaseUrl?: string;
  scopes?: string[];
  timeoutMs?: number;
  fetcher?: typeof fetch;
};

export type ManagementUser = {
  id: string;
  user_kind: "regular" | "managed_test" | string;
  test_user_label: string | null;
  email: string | null;
  email_verified: boolean;
  user_created_at: string;
  first_consent_at: string | null;
  last_consent_at: string | null;
  last_seen_at: string | null;
  client_names: string[];
  providers: string[];
  picture: string | null;
};

export type ManagementUserListOptions = {
  query?: string;
  cursor?: string;
  limit?: number;
  userKind?: "regular" | "managed_test";
};

export type ManagementPage<T> = {
  data: T[];
  next_cursor: string | null;
  total_count: number;
};

export class NamoIDManagementError extends Error {
  readonly status: number | null;
  readonly code: string | null;
  readonly requestId: string | null;
  readonly retryAfterSeconds: number | null;

  constructor(
    message: string,
    options: {
      status?: number | null;
      code?: string | null;
      requestId?: string | null;
      retryAfterSeconds?: number | null;
    } = {},
  ) {
    super(message);
    this.name = "NamoIDManagementError";
    this.status = options.status ?? null;
    this.code = options.code ?? null;
    this.requestId = options.requestId ?? null;
    this.retryAfterSeconds = options.retryAfterSeconds ?? null;
  }
}

type TokenRecord = {
  accessToken: string;
  expiresAt: number;
};

type TokenResponse = {
  access_token: string;
  token_type: string;
  expires_in: number;
  scope: string;
};

const DEFAULT_API_BASE_URL = "https://api.namoid.in";
const MANAGEMENT_AUDIENCE = "https://api.namoid.in/management";
const DEFAULT_SCOPES = ["users:read"];
const DEFAULT_TIMEOUT_MS = 10_000;
const TOKEN_EXPIRY_SKEW_MS = 30_000;
const INSTANCE_ID_PATTERN = /^namoid_ins_(test|live|custom)_[A-Za-z0-9_-]{24}$/;

export class NamoIDManagement {
  readonly instanceId: string;
  readonly users: {
    list: (options?: ManagementUserListOptions) => Promise<ManagementPage<ManagementUser>>;
    get: (userId: string) => Promise<ManagementUser>;
    pages: (options?: Omit<ManagementUserListOptions, "cursor">) => AsyncGenerator<ManagementUser[]>;
  };

  readonly #issuer: URL;
  readonly #apiBaseUrl: URL;
  readonly #clientId: string;
  readonly #clientSecret: string;
  readonly #scopes: string[];
  readonly #timeoutMs: number;
  readonly #fetcher: typeof fetch;
  #token: TokenRecord | null = null;
  #tokenRequest: Promise<TokenRecord> | null = null;

  constructor(options: NamoIDManagementOptions) {
    if (typeof window !== "undefined") {
      throw new NamoIDManagementError("NamoIDManagement can only run on the server", {
        code: "server_only",
      });
    }
    this.#issuer = parseBaseUrl(options.issuer, "issuer");
    this.#apiBaseUrl = parseBaseUrl(options.apiBaseUrl ?? DEFAULT_API_BASE_URL, "apiBaseUrl");
    this.instanceId = required(options.instanceId, "instanceId");
    if (!INSTANCE_ID_PATTERN.test(this.instanceId)) {
      throw new NamoIDManagementError("instanceId has an invalid format", {
        code: "invalid_configuration",
      });
    }
    this.#clientId = asciiCredential(options.clientId, "clientId");
    this.#clientSecret = asciiCredential(options.clientSecret, "clientSecret");
    this.#scopes = normalizeScopes(options.scopes ?? DEFAULT_SCOPES);
    this.#timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    if (!Number.isInteger(this.#timeoutMs) || this.#timeoutMs < 250 || this.#timeoutMs > 60_000) {
      throw new NamoIDManagementError("timeoutMs must be between 250 and 60000", {
        code: "invalid_configuration",
      });
    }
    this.#fetcher = options.fetcher ?? globalThis.fetch;
    if (!this.#fetcher) {
      throw new NamoIDManagementError("fetch is not available; pass a fetcher option", {
        code: "missing_fetch",
      });
    }

    this.users = {
      list: (listOptions = {}) => this.#listUsers(listOptions),
      get: (userId) => this.#request<ManagementUser>(`/users/${encodeURIComponent(userId)}`),
      pages: (listOptions = {}) => this.#userPages(listOptions),
    };
  }

  async #listUsers(options: ManagementUserListOptions): Promise<ManagementPage<ManagementUser>> {
    const query = new URLSearchParams();
    if (options.query) query.set("q", options.query);
    if (options.cursor) query.set("cursor", options.cursor);
    if (options.userKind) query.set("user_kind", options.userKind);
    if (options.limit !== undefined) {
      if (!Number.isInteger(options.limit) || options.limit < 1 || options.limit > 100) {
        throw new NamoIDManagementError("limit must be between 1 and 100", {
          code: "invalid_argument",
        });
      }
      query.set("limit", String(options.limit));
    }
    const suffix = query.size > 0 ? `?${query}` : "";
    return this.#request<ManagementPage<ManagementUser>>(`/users${suffix}`);
  }

  async *#userPages(
    options: Omit<ManagementUserListOptions, "cursor">,
  ): AsyncGenerator<ManagementUser[]> {
    let cursor: string | undefined;
    do {
      const page = await this.#listUsers({ ...options, cursor });
      yield page.data;
      cursor = page.next_cursor ?? undefined;
    } while (cursor);
  }

  async #request<T>(path: string, retryAfterUnauthorized = true): Promise<T> {
    const token = await this.#accessToken();
    const url = new URL(
      `/management/v1/instances/${encodeURIComponent(this.instanceId)}${path}`,
      this.#apiBaseUrl,
    );
    const response = await this.#fetch(url, {
      method: "GET",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${token}`,
      },
    });
    if (response.status === 401 && retryAfterUnauthorized) {
      this.#token = null;
      return this.#request<T>(path, false);
    }
    return decodeResponse<T>(response);
  }

  async #accessToken(): Promise<string> {
    if (this.#token && this.#token.expiresAt - TOKEN_EXPIRY_SKEW_MS > Date.now()) {
      return this.#token.accessToken;
    }
    this.#tokenRequest ??= this.#fetchToken().finally(() => {
      this.#tokenRequest = null;
    });
    this.#token = await this.#tokenRequest;
    return this.#token.accessToken;
  }

  async #fetchToken(): Promise<TokenRecord> {
    const tokenUrl = new URL("/v1/oauth/token", this.#issuer);
    const body = new URLSearchParams({
      grant_type: "client_credentials",
      resource: MANAGEMENT_AUDIENCE,
      scope: this.#scopes.join(" "),
    });
    const response = await this.#fetch(tokenUrl, {
      method: "POST",
      headers: {
        accept: "application/json",
        authorization: `Basic ${btoa(`${this.#clientId}:${this.#clientSecret}`)}`,
        "content-type": "application/x-www-form-urlencoded",
      },
      body,
    });
    const token = await decodeResponse<TokenResponse>(response);
    if (
      typeof token.access_token !== "string" ||
      token.token_type.toLowerCase() !== "bearer" ||
      !Number.isFinite(token.expires_in) ||
      token.expires_in <= 0
    ) {
      throw new NamoIDManagementError("NamoID returned an invalid token response", {
        code: "invalid_token_response",
        requestId: response.headers.get("x-request-id"),
      });
    }
    return {
      accessToken: token.access_token,
      expiresAt: Date.now() + token.expires_in * 1000,
    };
  }

  async #fetch(input: URL, init: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.#timeoutMs);
    try {
      return await this.#fetcher(input, {
        ...init,
        cache: "no-store",
        redirect: "error",
        signal: controller.signal,
      });
    } catch (error) {
      throw new NamoIDManagementError(
        error instanceof DOMException && error.name === "AbortError"
          ? "NamoID request timed out"
          : "NamoID request failed",
        { code: error instanceof DOMException && error.name === "AbortError" ? "timeout" : "network_error" },
      );
    } finally {
      clearTimeout(timer);
    }
  }
}

function required(value: string, name: string): string {
  const normalized = value?.trim();
  if (!normalized) {
    throw new NamoIDManagementError(`${name} is required`, { code: "invalid_configuration" });
  }
  return normalized;
}

function asciiCredential(value: string, name: string): string {
  const normalized = required(value, name);
  if (normalized.includes(":") || !/^[\x20-\x7e]+$/.test(normalized)) {
    throw new NamoIDManagementError(`${name} has an invalid format`, {
      code: "invalid_configuration",
    });
  }
  return normalized;
}

function parseBaseUrl(value: string, name: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new NamoIDManagementError(`${name} must be an absolute URL`, {
      code: "invalid_configuration",
    });
  }
  if (url.protocol !== "https:" && url.hostname !== "localhost" && url.hostname !== "127.0.0.1") {
    throw new NamoIDManagementError(`${name} must use HTTPS`, {
      code: "invalid_configuration",
    });
  }
  url.pathname = url.pathname.replace(/\/$/, "");
  url.search = "";
  url.hash = "";
  return url;
}

function normalizeScopes(scopes: string[]): string[] {
  const values = [...new Set(scopes.map((scope) => scope.trim()).filter(Boolean))];
  if (values.length === 0 || values.some((scope) => !/^[a-z][a-z0-9:_-]{0,63}$/.test(scope))) {
    throw new NamoIDManagementError("scopes contains an invalid value", {
      code: "invalid_configuration",
    });
  }
  return values;
}

async function decodeResponse<T>(response: Response): Promise<T> {
  const requestId = response.headers.get("x-request-id");
  const retryAfterHeader = response.headers.get("retry-after");
  const retryAfter = retryAfterHeader === null ? null : Number(retryAfterHeader);
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  if (!response.ok) {
    const errorBody = body as { error?: unknown; message?: unknown } | null;
    throw new NamoIDManagementError(
      typeof errorBody?.message === "string" ? errorBody.message : "NamoID request failed",
      {
        status: response.status,
        code: typeof errorBody?.error === "string" ? errorBody.error : null,
        requestId,
        retryAfterSeconds: retryAfter !== null && Number.isFinite(retryAfter) ? retryAfter : null,
      },
    );
  }
  return body as T;
}
