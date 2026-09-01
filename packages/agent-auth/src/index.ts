export type AgentAuthErrorCode =
  | "invalid_configuration"
  | "server_only"
  | "invalid_user_assertion"
  | "application_not_authorized"
  | "authorization_required"
  | "account_selection_required"
  | "reauthorization_required"
  | "session_expired"
  | "gateway_revision_unavailable"
  | "policy_denied"
  | "quota_exceeded"
  | "provider_rate_limited"
  | "provider_unavailable"
  | "uncertain_write_outcome"
  | "request_timeout"
  | "request_aborted"
  | "network_error"
  | "unexpected_response"
  | (string & {});

export type NamoIDAgentAuthOptions = {
  clientId: string;
  clientSecret: string;
  baseUrl?: string;
  fetch?: typeof globalThis.fetch;
  timeoutMs?: number;
};

export type AgentAuthUserContext = {
  accessToken: string;
};

export type AgentAuthRequestOptions = {
  signal?: AbortSignal;
  timeoutMs?: number;
  idempotencyKey?: string;
};

export type CreateUserConnectionInput = {
  connectionId: string;
  returnUrl: string;
};

export type UserConnectionSession = {
  id: string;
  authorizeUrl: string;
  expiresIn: number;
};

export type UserConnectionSessionStatus = {
  id: string;
  status: "pending" | "completed" | "failed";
  userConnectionId: string | null;
};

export type UserConnection = {
  id: string;
  connectionId: string;
  connector: string;
  providerDisplayHint: string | null;
  grantedScopes: string[];
  status: string;
  authorizedAt: string;
  revokedAt: string | null;
};

export type CreateMcpSessionInput = {
  gatewayId: string;
  /**
   * Selects one of the current user's compatible User connections. Omit when
   * the user has exactly one compatible active User connection.
   */
  userConnectionId?: string;
};

export type McpConnectionDescriptor = {
  url: string;
  headers: { Authorization: string };
  expiresAt: string;
};

export type McpSession = {
  id: string;
  gatewayId: string;
  gatewayRevisionId: string;
  userConnectionId: string;
  status: string;
  expiresAt: string;
  revokedAt: string | null;
  revokedReason: string | null;
  createdAt: string;
};

export type CreatedMcpSession = McpSession & {
  /** One-time, short-lived credential. Do not persist or log this value. */
  token: string;
  gatewayUrl: string;
  mcp: McpConnectionDescriptor;
  /** JSON serialization redacts both copies of the MCP credential. */
  toJSON(): Record<string, unknown>;
};

type ApiErrorBody = {
  error?: unknown;
  message?: unknown;
  detail?: unknown;
};

type ApiConnectionSession = {
  id: string;
  authorize_url: string;
  expires_in: number;
};

type ApiConnectionSessionStatus = {
  id: string;
  status: "pending" | "completed" | "failed";
  connected_account_id: string | null;
};

type ApiConnectedAccount = {
  id: string;
  connection_id: string;
  connector: string;
  provider_display_hint: string | null;
  granted_scopes: string[];
  status: string;
  authorized_at: string;
  revoked_at: string | null;
};

type ApiMcpSession = {
  id: string;
  gateway_id: string;
  gateway_revision_id: string;
  connected_account_id: string;
  status: string;
  expires_at: string;
  revoked_at: string | null;
  revoked_reason: string | null;
  created_at: string;
};

type ApiCreatedMcpSession = ApiMcpSession & {
  token: string;
  gateway_url: string;
};

const DEFAULT_BASE_URL = "https://api.namoid.in";
const DEFAULT_TIMEOUT_MS = 10_000;
const REDACTED = "[REDACTED]";

const ERROR_CODE_MAP: Record<string, AgentAuthErrorCode> = {
  unauthorized: "invalid_user_assertion",
  forbidden: "application_not_authorized",
  rate_limited: "quota_exceeded",
  upstream_error: "provider_unavailable",
};

export class NamoIDAgentAuthError extends Error {
  readonly code: AgentAuthErrorCode;
  readonly status?: number;
  readonly requestId?: string;
  readonly retryable: boolean;
  readonly details?: Record<string, unknown>;

  constructor(
    message: string,
    options: {
      code: AgentAuthErrorCode;
      status?: number;
      requestId?: string;
      retryable?: boolean;
      details?: Record<string, unknown>;
      cause?: unknown;
    },
  ) {
    super(message, { cause: options.cause });
    this.name = "NamoIDAgentAuthError";
    this.code = options.code;
    this.status = options.status;
    this.requestId = options.requestId;
    this.retryable = options.retryable ?? false;
    this.details = options.details;
  }
}

export class NamoIDAgentAuth {
  readonly userConnections: {
    create: (
      input: CreateUserConnectionInput,
      user: AgentAuthUserContext,
      options?: AgentAuthRequestOptions,
    ) => Promise<UserConnectionSession>;
    getSession: (
      id: string,
      user: AgentAuthUserContext,
      options?: AgentAuthRequestOptions,
    ) => Promise<UserConnectionSessionStatus>;
    list: (
      user: AgentAuthUserContext,
      options?: AgentAuthRequestOptions,
    ) => Promise<UserConnection[]>;
    revoke: (
      id: string,
      user: AgentAuthUserContext,
      options?: AgentAuthRequestOptions,
    ) => Promise<UserConnection>;
  };

  readonly sessions: {
    create: (
      input: CreateMcpSessionInput,
      user: AgentAuthUserContext,
      options?: AgentAuthRequestOptions,
    ) => Promise<CreatedMcpSession>;
    revoke: (
      id: string,
      user: AgentAuthUserContext,
      options?: AgentAuthRequestOptions,
    ) => Promise<McpSession>;
  };

  readonly #clientId: string;
  readonly #clientSecret: string;
  readonly #baseUrl: URL;
  readonly #fetch: typeof globalThis.fetch;
  readonly #timeoutMs: number;

  constructor(options: NamoIDAgentAuthOptions) {
    if (typeof globalThis.window !== "undefined") {
      throw sdkError("This package can only be used from a server runtime", "server_only");
    }
    this.#clientId = requiredSecret(options.clientId, "clientId");
    this.#clientSecret = requiredSecret(options.clientSecret, "clientSecret");
    this.#baseUrl = parseBaseUrl(options.baseUrl ?? DEFAULT_BASE_URL);
    this.#fetch = options.fetch ?? globalThis.fetch;
    if (typeof this.#fetch !== "function") {
      throw sdkError("fetch is unavailable; pass the fetch option", "invalid_configuration");
    }
    this.#timeoutMs = positiveTimeout(options.timeoutMs ?? DEFAULT_TIMEOUT_MS);

    this.userConnections = {
      create: async (input, user, requestOptions) => {
        requiredId(input.connectionId, "connectionId");
        validateReturnUrl(input.returnUrl);
        const body = await this.#request<ApiConnectionSession>(
          "POST",
          "/v1/agent-auth/connect-sessions",
          user,
          { connection_id: input.connectionId, return_url: input.returnUrl },
          requestOptions,
        );
        assertConnectionSession(body);
        return {
          id: body.id,
          authorizeUrl: resolveApiUrl(this.#baseUrl, body.authorize_url),
          expiresIn: body.expires_in,
        };
      },
      getSession: async (id, user, requestOptions) => {
        requiredId(id, "connectSessionId");
        const body = await this.#request<ApiConnectionSessionStatus>(
          "GET",
          `/v1/agent-auth/connect-sessions/${encodeURIComponent(id)}`,
          user,
          undefined,
          requestOptions,
        );
        assertConnectionSessionStatus(body);
        return {
          id: body.id,
          status: body.status,
          userConnectionId: body.connected_account_id,
        };
      },
      list: async (user, requestOptions) => {
        const body = await this.#request<ApiConnectedAccount[]>(
          "GET",
          "/v1/agent-auth/connected-accounts",
          user,
          undefined,
          requestOptions,
        );
        return body.map(mapUserConnection);
      },
      revoke: async (id, user, requestOptions) => {
        requiredId(id, "userConnectionId");
        const body = await this.#request<ApiConnectedAccount>(
          "POST",
          `/v1/agent-auth/connected-accounts/${encodeURIComponent(id)}/revoke`,
          user,
          undefined,
          requestOptions,
        );
        return mapUserConnection(body);
      },
    };

    this.sessions = {
      create: async (input, user, requestOptions) => {
        requiredId(input.gatewayId, "gatewayId");
        if (input.userConnectionId !== undefined) {
          requiredId(input.userConnectionId, "userConnectionId");
        }
        const body = await this.#request<ApiCreatedMcpSession>(
          "POST",
          "/v1/agent-auth/mcp-sessions",
          user,
          {
            gateway_id: input.gatewayId,
            ...(input.userConnectionId
              ? { connected_account_id: input.userConnectionId }
              : {}),
          },
          requestOptions,
        );
        return createMcpSession(body, this.#baseUrl);
      },
      revoke: async (id, user, requestOptions) => {
        requiredId(id, "mcpSessionId");
        const body = await this.#request<ApiMcpSession>(
          "POST",
          `/v1/agent-auth/mcp-sessions/${encodeURIComponent(id)}/revoke`,
          user,
          undefined,
          requestOptions,
        );
        return mapMcpSession(body);
      },
    };
  }

  async #request<T>(
    method: "GET" | "POST",
    path: string,
    user: AgentAuthUserContext,
    body?: Record<string, unknown>,
    options: AgentAuthRequestOptions = {},
  ): Promise<T> {
    const accessToken = requiredSecret(user?.accessToken, "user accessToken");
    const controller = new AbortController();
    let timedOut = false;
    const timeoutMs = positiveTimeout(options.timeoutMs ?? this.#timeoutMs);
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);
    const abort = () => controller.abort();
    if (options.signal?.aborted) abort();
    else options.signal?.addEventListener("abort", abort, { once: true });

    try {
      const response = await this.#fetch(new URL(path, this.#baseUrl), {
        method,
        headers: {
          accept: "application/json",
          "content-type": "application/json",
          "x-namoid-client-id": this.#clientId,
          "x-namoid-client-secret": this.#clientSecret,
          authorization: `Bearer ${accessToken}`,
          ...(options.idempotencyKey
            ? { "idempotency-key": requiredSecret(options.idempotencyKey, "idempotencyKey") }
            : {}),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
        cache: "no-store",
      });
      if (!response.ok) throw await responseError(response);
      try {
        return (await response.json()) as T;
      } catch (cause) {
        throw new NamoIDAgentAuthError("NamoID returned an invalid JSON response", {
          code: "unexpected_response",
          status: response.status,
          requestId: response.headers.get("x-request-id") ?? undefined,
          cause,
        });
      }
    } catch (error) {
      if (error instanceof NamoIDAgentAuthError) throw error;
      if (timedOut) {
        throw new NamoIDAgentAuthError(`NamoID request timed out after ${timeoutMs}ms`, {
          code: "request_timeout",
          retryable: method === "GET",
          cause: error,
        });
      }
      if (options.signal?.aborted || controller.signal.aborted) {
        throw new NamoIDAgentAuthError("NamoID request was aborted", {
          code: "request_aborted",
          cause: error,
        });
      }
      throw new NamoIDAgentAuthError("Unable to reach NamoID", {
        code: "network_error",
        retryable: method === "GET",
        cause: error,
      });
    } finally {
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", abort);
    }
  }
}

function mapUserConnection(body: ApiConnectedAccount): UserConnection {
  if (
    !isRecord(body) ||
    !hasStrings(body, ["id", "connection_id", "connector", "status", "authorized_at"]) ||
    !isNullableString(body.provider_display_hint) ||
    !isStringArray(body.granted_scopes) ||
    !isNullableString(body.revoked_at)
  ) {
    throw invalidResponse();
  }
  return {
    id: body.id,
    connectionId: body.connection_id,
    connector: body.connector,
    providerDisplayHint: body.provider_display_hint,
    grantedScopes: body.granted_scopes,
    status: body.status,
    authorizedAt: body.authorized_at,
    revokedAt: body.revoked_at,
  };
}

function mapMcpSession(body: ApiMcpSession): McpSession {
  if (
    !isRecord(body) ||
    !hasStrings(body, [
      "id",
      "gateway_id",
      "gateway_revision_id",
      "connected_account_id",
      "status",
      "expires_at",
      "created_at",
    ]) ||
    !isNullableString(body.revoked_at) ||
    !isNullableString(body.revoked_reason)
  ) {
    throw invalidResponse();
  }
  return {
    id: body.id,
    gatewayId: body.gateway_id,
    gatewayRevisionId: body.gateway_revision_id,
    userConnectionId: body.connected_account_id,
    status: body.status,
    expiresAt: body.expires_at,
    revokedAt: body.revoked_at,
    revokedReason: body.revoked_reason,
    createdAt: body.created_at,
  };
}

function createMcpSession(body: ApiCreatedMcpSession, baseUrl: URL): CreatedMcpSession {
  if (!isRecord(body) || !hasStrings(body, ["token", "gateway_url"])) {
    throw invalidResponse();
  }
  const session = mapMcpSession(body);
  const mcp = {
    url: resolveApiUrl(baseUrl, body.gateway_url),
    headers: { Authorization: `Bearer ${body.token}` },
    expiresAt: body.expires_at,
  };
  return {
    ...session,
    token: body.token,
    gatewayUrl: mcp.url,
    mcp,
    toJSON() {
      return {
        ...session,
        token: REDACTED,
        gatewayUrl: mcp.url,
        mcp: { ...mcp, headers: { Authorization: `Bearer ${REDACTED}` } },
      };
    },
  };
}

async function responseError(response: Response): Promise<NamoIDAgentAuthError> {
  let body: ApiErrorBody = {};
  try {
    body = (await response.json()) as ApiErrorBody;
  } catch {
    // Never copy arbitrary non-JSON upstream bodies into an SDK error.
  }
  const serverCode = typeof body.error === "string" ? body.error : undefined;
  const message =
    typeof body.message === "string" && body.message.length <= 500
      ? body.message
      : `NamoID request failed (${response.status})`;
  const code = classifyServerCode(serverCode, message);
  return new NamoIDAgentAuthError(message, {
    code,
    status: response.status,
    requestId: response.headers.get("x-request-id") ?? undefined,
    retryable: response.status === 429 || response.status >= 500,
    details: safeDetails(body.detail),
  });
}

function classifyServerCode(serverCode: string | undefined, message: string): AgentAuthErrorCode {
  if (!serverCode) return "unexpected_response";
  if (serverCode === "unauthorized" && /application|client id|client secret/i.test(message)) {
    return "application_not_authorized";
  }
  return ERROR_CODE_MAP[serverCode] ?? serverCode;
}

function assertConnectionSession(body: ApiConnectionSession): void {
  if (
    !isRecord(body) ||
    !hasStrings(body, ["id", "authorize_url"]) ||
    typeof body.expires_in !== "number" ||
    !Number.isFinite(body.expires_in)
  ) {
    throw invalidResponse();
  }
}

function assertConnectionSessionStatus(body: ApiConnectionSessionStatus): void {
  if (
    !isRecord(body) ||
    typeof body.id !== "string" ||
    !["pending", "completed", "failed"].includes(String(body.status)) ||
    !isNullableString(body.connected_account_id)
  ) {
    throw invalidResponse();
  }
}

function hasStrings(value: Record<string, unknown>, keys: string[]): boolean {
  return keys.every((key) => typeof value[key] === "string" && value[key] !== "");
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function invalidResponse(): NamoIDAgentAuthError {
  return new NamoIDAgentAuthError("NamoID returned an unexpected response shape", {
    code: "unexpected_response",
  });
}

function safeDetails(value: unknown): Record<string, unknown> | undefined {
  if (!isRecord(value)) return undefined;
  return redactRecord(value, 0);
}

function redactRecord(value: Record<string, unknown>, depth: number): Record<string, unknown> {
  if (depth >= 3) return {};
  const result: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value).slice(0, 30)) {
    if (/secret|token|authorization|credential|code|password/i.test(key)) {
      result[key] = REDACTED;
    } else if (Array.isArray(item)) {
      result[key] = item.slice(0, 50).map((entry) =>
        isRecord(entry) ? redactRecord(entry, depth + 1) : safeScalar(entry),
      );
    } else if (isRecord(item)) {
      result[key] = redactRecord(item, depth + 1);
    } else {
      result[key] = safeScalar(item);
    }
  }
  return result;
}

function safeScalar(value: unknown): string | number | boolean | null {
  if (value === null || typeof value === "number" || typeof value === "boolean") return value;
  return typeof value === "string" ? value.slice(0, 500) : String(value).slice(0, 500);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredSecret(value: string | undefined, name: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw sdkError(`${name} is required`, "invalid_configuration");
  }
  if (/\r|\n/.test(value)) {
    throw sdkError(`${name} contains invalid characters`, "invalid_configuration");
  }
  return value;
}

function requiredId(value: string, name: string): void {
  if (typeof value !== "string" || !value.trim() || value.length > 512) {
    throw sdkError(`${name} is invalid`, "invalid_configuration");
  }
}

function positiveTimeout(value: number): number {
  if (!Number.isFinite(value) || value <= 0 || value > 120_000) {
    throw sdkError("timeoutMs must be between 1 and 120000", "invalid_configuration");
  }
  return value;
}

function validateReturnUrl(value: string): void {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password) throw new Error();
  } catch {
    throw sdkError("returnUrl must be an absolute HTTPS URL", "invalid_configuration");
  }
}

function parseBaseUrl(value: string): URL {
  try {
    const url = new URL(value);
    const localHttp =
      url.protocol === "http:" && ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
    if ((url.protocol !== "https:" && !localHttp) || url.username || url.password) {
      throw new Error();
    }
    url.pathname = url.pathname.endsWith("/") ? url.pathname : `${url.pathname}/`;
    url.search = "";
    url.hash = "";
    return url;
  } catch {
    throw sdkError("baseUrl must be HTTPS (or localhost HTTP)", "invalid_configuration");
  }
}

function resolveApiUrl(baseUrl: URL, value: string): string {
  return new URL(value, baseUrl).toString();
}

function sdkError(message: string, code: AgentAuthErrorCode): NamoIDAgentAuthError {
  return new NamoIDAgentAuthError(message, { code });
}
