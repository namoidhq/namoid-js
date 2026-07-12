import { NamoIDError } from "./index.js";

export type AuthTokenValidation = {
  valid: boolean;
  user_id: string | null;
  session_id: string | null;
  client_id: string | null;
  scopes: string[];
  error: string | null;
};

const DEFAULT_API_BASE_URL = "https://api.namoid.in";

export async function validateAuthToken(options: {
  token: string;
  apiKey: string;
  apiBaseUrl?: string;
  fetcher?: typeof fetch;
}): Promise<AuthTokenValidation> {
  const fetcher = options.fetcher ?? globalThis.fetch;
  if (!fetcher) {
    throw new NamoIDError("fetch is not available; pass a fetcher option", { code: "missing_fetch" });
  }

  const response = await fetcher(
    new URL("/v1/auth/tokens/validate", normalizeBaseUrl(options.apiBaseUrl ?? DEFAULT_API_BASE_URL)),
    {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        "X-API-Key": options.apiKey,
      },
      body: JSON.stringify({ token: options.token }),
      cache: "no-store",
    },
  );

  if (!response.ok) {
    const body = await safeJson(response);
    throw new NamoIDError(readErrorMessage(body) ?? `Token validation failed with ${response.status}`, {
      status: response.status,
      code: readErrorCode(body) ?? "token_validation_failed",
      detail: body,
    });
  }

  return (await response.json()) as AuthTokenValidation;
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
